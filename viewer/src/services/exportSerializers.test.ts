/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";
import { InMemoryReadout, mergeReadoutsStrict } from "@/services/readoutUtils";
import {
    serializeReadoutsToArchiveBytes,
    serializeReadoutsToJsonBytes,
} from "@/services/exportSerializers";
import { readElectronFile } from "../features/Dashboard/lib/readers";

function createReadout(overrides?: {
    defSha?: string;
    recSha?: string;
    source?: string | null;
    sourceKey?: string | null;
    bucketHits?: number[];
}): Readout {
    const bucketHits = overrides?.bucketHits ?? [2, 1];
    return new InMemoryReadout({
        defSha: overrides?.defSha ?? "def-a",
        recSha: overrides?.recSha ?? "rec-a",
        source: overrides?.source ?? "suite",
        sourceKey: overrides?.sourceKey ?? "test",
        points: [
            {
                start: 0,
                depth: 0,
                end: 1,
                axis_start: 0,
                axis_end: 1,
                axis_value_start: 0,
                axis_value_end: 2,
                goal_start: 0,
                goal_end: 2,
                bucket_start: 0,
                bucket_end: 2,
                target: 4,
                target_buckets: 2,
                name: "Root",
                description: "Root",
            },
        ],
        bucketGoals: [
            { start: 0, goal: 0 },
            { start: 1, goal: 1 },
        ],
        axes: [
            {
                start: 0,
                value_start: 0,
                value_end: 2,
                name: "axis",
                description: "axis desc",
            },
        ],
        axisValues: [
            { start: 0, value: "A" },
            { start: 1, value: "B" },
        ],
        goals: [
            { start: 0, target: 3, name: "goal0", description: "g0" },
            { start: 1, target: 2, name: "goal1", description: "g1" },
        ],
        pointHits: [
            {
                start: 0,
                depth: 0,
                hits: Math.min(bucketHits[0], 3) + Math.min(bucketHits[1], 2),
                hit_buckets: bucketHits.filter((value) => value > 0).length,
                full_buckets: [
                    bucketHits[0] >= 3 ? 1 : 0,
                    bucketHits[1] >= 2 ? 1 : 0,
                ].reduce((a, b) => a + b, 0),
            },
        ],
        bucketHits: [
            { start: 0, hits: bucketHits[0] },
            { start: 1, hits: bucketHits[1] },
        ],
    });
}

async function readSingle(bytes: Uint8Array): Promise<Readout> {
    const reader = await readElectronFile(Array.from(bytes));
    const readouts: Readout[] = [];
    for await (const readout of reader.read_all()) {
        readouts.push(readout);
    }
    expect(readouts).toHaveLength(1);
    return readouts[0];
}

describe("mergeReadoutsStrict", () => {
    test("merges bucket hits and preserves originals", () => {
        const readoutA = createReadout({ bucketHits: [1, 2] });
        const readoutB = createReadout({ bucketHits: [3, 4] });

        const merged = mergeReadoutsStrict([readoutA, readoutB]);
        const mergedBucketHits = Array.from(merged.iter_bucket_hits(0, null)).map(
            (value) => value.hits,
        );
        expect(mergedBucketHits).toEqual([4, 6]);

        // Originals are unchanged
        expect(Array.from(readoutA.iter_bucket_hits(0, null)).map((value) => value.hits)).toEqual(
            [1, 2],
        );
        expect(Array.from(readoutB.iter_bucket_hits(0, null)).map((value) => value.hits)).toEqual(
            [3, 4],
        );
        expect(merged.get_source()).toMatch(/^Merged_/);
        expect(merged.get_source_key()).toBe("");
    });

    test("rejects def hash mismatch", () => {
        const readoutA = createReadout({ defSha: "def-a" });
        const readoutB = createReadout({ defSha: "def-b" });
        expect(() => mergeReadoutsStrict([readoutA, readoutB])).toThrow(
            "Tried to merge coverage with two different definition hashes!",
        );
    });

    test("rejects rec hash mismatch", () => {
        const readoutA = createReadout({ recSha: "rec-a" });
        const readoutB = createReadout({ recSha: "rec-b" });
        expect(() => mergeReadoutsStrict([readoutA, readoutB])).toThrow(
            "Tried to merge coverage with two different record hashes!",
        );
    });
});

describe("export serializers", () => {
    test("round-trips json serialization through reader", async () => {
        const readout = createReadout({ bucketHits: [5, 6], source: "json", sourceKey: "r0" });
        const bytes = serializeReadoutsToJsonBytes([readout]);
        const restored = await readSingle(bytes);

        expect(restored.get_def_sha()).toBe(readout.get_def_sha());
        expect(restored.get_rec_sha()).toBe(readout.get_rec_sha());
        expect(restored.get_source()).toBe("json");
        expect(restored.get_source_key()).toBe("r0");
        expect(Array.from(restored.iter_bucket_hits(0, null)).map((value) => value.hits)).toEqual(
            [5, 6],
        );
    });

    test("round-trips archive serialization through reader", async () => {
        const readout = createReadout({ bucketHits: [7, 8], source: "archive", sourceKey: "r1" });
        const bytes = serializeReadoutsToArchiveBytes([readout]);
        const restored = await readSingle(bytes);

        expect(restored.get_def_sha()).toBe(readout.get_def_sha());
        expect(restored.get_rec_sha()).toBe(readout.get_rec_sha());
        expect(restored.get_source()).toBe("archive");
        expect(restored.get_source_key()).toBe("r1");
        expect(Array.from(restored.iter_bucket_hits(0, null)).map((value) => value.hits)).toEqual(
            [7, 8],
        );
    });
});
