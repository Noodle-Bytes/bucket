/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";
import { InMemoryReadout, mergeReadoutsStrict } from "@/services/readoutUtils";
import { SUPPORTED_FORMAT_VERSION } from "@/utils/versionCompat";
import {
    serializeReadoutsToArchiveBytes,
    serializeReadoutsToJsonBytes,
} from "@/services/exportSerializers";
import { loadReadoutsFromBytes } from "./fileLoader";

function createReadout(overrides?: {
    defSha?: string;
    recSha?: string;
    source?: string | null;
    sourceKey?: string | null;
    bucketHits?: number[];
    tier?: number | null;
    tags?: string;
    motivation?: string;
    /** Waived buckets; point_hit rows are rescored to exclude them. */
    waivers?: BucketWaiverTuple[];
}): Readout {
    const bucketHits = overrides?.bucketHits ?? [2, 1];
    const waivers = overrides?.waivers ?? [];
    const targets = [3, 2];
    const waived = (idx: number) => waivers.some((waiver) => waiver.start === idx);
    const scored = [0, 1].filter((idx) => !waived(idx));
    return new InMemoryReadout({
        defSha: overrides?.defSha ?? "def-a",
        recSha: overrides?.recSha ?? "rec-a",
        source: overrides?.source ?? "suite",
        sourceKey: overrides?.sourceKey ?? "test",
        bucketVersion: "",
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
                tier: overrides?.tier ?? 0,
                tags: overrides?.tags ?? "[\"default\"]",
                motivation: overrides?.motivation ?? "why",
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
                hits: scored.reduce((sum, idx) => sum + Math.min(bucketHits[idx], targets[idx]), 0),
                hit_buckets: scored.filter((idx) => bucketHits[idx] > 0).length,
                full_buckets: scored.filter((idx) => bucketHits[idx] >= targets[idx]).length,
                waived_buckets: waivers.length,
                waived_target: waivers.reduce((sum, waiver) => sum + targets[waiver.start], 0),
            },
        ],
        bucketHits: [
            { start: 0, hits: bucketHits[0] },
            { start: 1, hits: bucketHits[1] },
        ],
        bucketWaivers: waivers,
    });
}

async function readSingle(bytes: Uint8Array): Promise<Readout> {
    const readouts = await loadReadoutsFromBytes(bytes);
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

    test("unions waivers (first reason wins) and rescores point hits without them", () => {
        const readoutA = createReadout({
            bucketHits: [3, 0],
            waivers: [{ start: 0, reason: "from A" }],
        });
        const readoutB = createReadout({
            bucketHits: [1, 2],
            waivers: [
                { start: 0, reason: "from B" },
                { start: 1, reason: "B only" },
            ],
        });

        const merged = mergeReadoutsStrict([readoutA, readoutB]);
        expect(Array.from(merged.iter_bucket_waivers(0, null))).toEqual([
            { start: 0, reason: "from A" },
            { start: 1, reason: "B only" },
        ]);
        // Raw hits still sum; scoring excludes both waived buckets entirely.
        expect(Array.from(merged.iter_bucket_hits(0, null)).map((value) => value.hits)).toEqual(
            [4, 2],
        );
        expect(Array.from(merged.iter_point_hits())).toEqual([
            {
                start: 0,
                depth: 0,
                hits: 0,
                hit_buckets: 0,
                full_buckets: 0,
                waived_buckets: 2,
                waived_target: 5,
            },
        ]);
    });

    test("a waiver on one record only excludes that bucket from the merged score", () => {
        const readoutA = createReadout({ bucketHits: [3, 1] });
        const readoutB = createReadout({
            bucketHits: [3, 1],
            waivers: [{ start: 1, reason: "flaky" }],
        });
        const merged = mergeReadoutsStrict([readoutA, readoutB]);
        expect(Array.from(merged.iter_point_hits())).toEqual([
            {
                start: 0,
                depth: 0,
                hits: 3,
                hit_buckets: 1,
                full_buckets: 1,
                waived_buckets: 1,
                waived_target: 2,
            },
        ]);
    });
});

describe("export serializers: sidecar-only waivers", () => {
    const waivers: BucketWaiverTuple[] = [{ start: 1, reason: 'needs "quoting", commas' }];

    test.each(["json", "archive"] as const)(
        "%s strips waivers and point_hit waiver columns",
        async (format) => {
            const readout = createReadout({ bucketHits: [3, 5], waivers });
            const bytes =
                format === "json"
                    ? serializeReadoutsToJsonBytes([readout])
                    : serializeReadoutsToArchiveBytes([readout]);
            const restored = await readSingle(bytes);

            expect(restored.get_format_version?.()).toBe(SUPPORTED_FORMAT_VERSION);
            expect(Array.from(restored.iter_bucket_waivers(0, null))).toEqual([]);
            expect(Array.from(restored.iter_bucket_hits(0, null)).map((value) => value.hits)).toEqual(
                [3, 5],
            );
            expect(Array.from(restored.iter_point_hits())[0]).toMatchObject({
                hits: 3,
                hit_buckets: 1,
                full_buckets: 1,
                waived_buckets: 0,
                waived_target: 0,
            });
        },
    );

    test("archive: no record embeds waivers", async () => {
        const readoutA = createReadout({ recSha: "rec-a", sourceKey: "a", waivers: [] });
        const readoutB = createReadout({
            recSha: "rec-b",
            sourceKey: "b",
            waivers: [{ start: 0, reason: "b0" }],
        });
        const readoutC = createReadout({
            recSha: "rec-c",
            sourceKey: "c",
            waivers: [
                { start: 0, reason: "c0" },
                { start: 1, reason: "c1" },
            ],
        });
        const restored = await loadReadoutsFromBytes(
            serializeReadoutsToArchiveBytes([readoutA, readoutB, readoutC]),
        );
        expect(restored.map((readout) => Array.from(readout.iter_bucket_waivers(0, null)))).toEqual([
            [],
            [],
            [],
        ]);
    });

    test("json payload uses the short format 2 tables", () => {
        const readout = createReadout({ waivers });
        const payload = JSON.parse(
            new TextDecoder().decode(serializeReadoutsToJsonBytes([readout])),
        );
        expect(payload.tables.bucket_waiver).toBeUndefined();
        expect(payload.tables.point_hit).toEqual([
            "start",
            "depth",
            "hits",
            "hit_buckets",
            "full_buckets",
        ]);
        expect(payload.records[0].bucket_waiver).toBeUndefined();
        expect(payload.records[0].point_hit[0]).toHaveLength(5);
        expect(payload.records[0].format_version).toBe(2);
    });
});

describe("export serializers", () => {
    test("round-trips json serialization through reader", async () => {
        const readout = createReadout({
            bucketHits: [5, 6],
            source: "json",
            sourceKey: "r0",
            tier: 2,
            tags: "[\"abc\",\"xyz\"]",
            motivation: "json motivation",
        });
        const bytes = serializeReadoutsToJsonBytes([readout]);
        const restored = await readSingle(bytes);

        expect(restored.get_def_sha()).toBe(readout.get_def_sha());
        expect(restored.get_rec_sha()).toBe(readout.get_rec_sha());
        expect(restored.get_source()).toBe("json");
        expect(restored.get_source_key()).toBe("r0");
        const restoredPoints = Array.from(restored.iter_points());
        expect(restoredPoints[0].tier).toBe(2);
        expect(restoredPoints[0].tags).toBe("[\"abc\",\"xyz\"]");
        expect(restoredPoints[0].motivation).toBe("json motivation");
        expect(Array.from(restored.iter_bucket_hits(0, null)).map((value) => value.hits)).toEqual(
            [5, 6],
        );
        expect(restored.get_format_version?.()).toBe(SUPPORTED_FORMAT_VERSION);
    });

    test("round-trips archive serialization through reader", async () => {
        const readout = createReadout({
            bucketHits: [7, 8],
            source: "archive",
            sourceKey: "r1",
            tier: 1,
            tags: "[\"archive-tag\"]",
            motivation: "archive motivation",
        });
        const bytes = serializeReadoutsToArchiveBytes([readout]);
        const restored = await readSingle(bytes);

        expect(restored.get_def_sha()).toBe(readout.get_def_sha());
        expect(restored.get_rec_sha()).toBe(readout.get_rec_sha());
        expect(restored.get_source()).toBe("archive");
        expect(restored.get_source_key()).toBe("r1");
        const restoredPoints = Array.from(restored.iter_points());
        expect(restoredPoints[0].tier).toBe(1);
        expect(restoredPoints[0].tags).toBe("[\"archive-tag\"]");
        expect(restoredPoints[0].motivation).toBe("archive motivation");
        expect(Array.from(restored.iter_bucket_hits(0, null)).map((value) => value.hits)).toEqual(
            [7, 8],
        );
        expect(restored.get_format_version?.()).toBe(SUPPORTED_FORMAT_VERSION);
    });
});
