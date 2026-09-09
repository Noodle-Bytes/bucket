/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";
import { InMemoryReadout } from "@/services/readoutUtils";
import {
    buildComparison,
    buildCompareDisplayReadout,
    getBucketHitStatus,
    getCompareCompatibility,
    matchesCompareSetMode,
    recompareWithDefinition,
} from "@/services/coverageCompare";
import type { CompareRecordMeta } from "@/types/coverageCompare";

function createReadout(overrides?: {
    defSha?: string;
    recSha?: string;
    bucketHits?: number[];
    waivers?: BucketWaiverTuple[];
}): Readout {
    const bucketHits = overrides?.bucketHits ?? [3, 0];
    return new InMemoryReadout({
        bucketWaivers: overrides?.waivers ?? [],
        defSha: overrides?.defSha ?? "def-a",
        recSha: overrides?.recSha ?? "rec-a",
        source: "suite",
        sourceKey: "test",
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
                goal_end: 1,
                bucket_start: 0,
                bucket_end: 2,
                target: 6,
                target_buckets: 2,
                name: "Root",
                description: "Root",
            },
        ],
        bucketGoals: [
            { start: 0, goal: 0 },
            { start: 1, goal: 0 },
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
        goals: [{ start: 0, target: 3, name: "goal0", description: "g0" }],
        pointHits: [
            {
                start: 0,
                depth: 0,
                hits: bucketHits[0] > 0 ? Math.min(bucketHits[0], 3) : 0,
                hit_buckets: bucketHits.filter((value) => value > 0).length,
                full_buckets: bucketHits[0] >= 3 ? 1 : 0,
            },
        ],
        bucketHits: [
            { start: 0, hits: bucketHits[0] },
            { start: 1, hits: bucketHits[1] },
        ],
    });
}

function meta(id: string, readout: Readout): CompareRecordMeta {
    return {
        id,
        label: id,
        source: readout.get_source(),
        sourceKey: readout.get_source_key(),
        defSha: readout.get_def_sha(),
        recSha: readout.get_rec_sha(),
    };
}

describe("buildComparison", () => {
    test("classifies all four valid-bucket categories with any_hit", () => {
        const readoutA = createReadout({ bucketHits: [3, 0] });
        const readoutB = createReadout({ bucketHits: [0, 2] });

        const result = buildComparison(
            readoutA,
            readoutB,
            meta("A", readoutA),
            meta("B", readoutB),
            "any_hit",
        );

        expect(result.global.valid).toBe(2);
        expect(result.global.a_only).toBe(1);
        expect(result.global.b_only).toBe(1);
        expect(result.global.both).toBe(0);
        expect(result.global.neither).toBe(0);
    });

    test("classifies both and neither with met_goal", () => {
        const readoutA = createReadout({ bucketHits: [3, 1] });
        const readoutB = createReadout({ bucketHits: [3, 0] });

        const result = buildComparison(
            readoutA,
            readoutB,
            meta("A", readoutA),
            meta("B", readoutB),
            "met_goal",
        );

        expect(result.global.both).toBe(1);
        expect(result.global.neither).toBe(1);
        expect(result.global.a_only).toBe(0);
        expect(result.global.b_only).toBe(0);
    });

    test("allows different rec_sha when def_sha matches", () => {
        const readoutA = createReadout({ recSha: "rec-a" });
        const readoutB = createReadout({ recSha: "rec-b" });

        expect(() =>
            buildComparison(
                readoutA,
                readoutB,
                meta("A", readoutA),
                meta("B", readoutB),
                "any_hit",
            ),
        ).not.toThrow();
    });

    test("rejects def hash mismatch", () => {
        const readoutA = createReadout({ defSha: "def-a" });
        const readoutB = createReadout({ defSha: "def-b" });

        expect(() =>
            buildComparison(
                readoutA,
                readoutB,
                meta("A", readoutA),
                meta("B", readoutB),
                "any_hit",
            ),
        ).toThrow("different covertree definitions");
    });
});

describe("buildComparison with waivers", () => {
    test("a bucket waived on either side is excluded from the comparison", () => {
        // Bucket 1 is waived in B only; bucket 0 is compared normally.
        const readoutA = createReadout({ bucketHits: [3, 3] });
        const readoutB = createReadout({
            recSha: "rec-b",
            bucketHits: [0, 3],
            waivers: [{ start: 1, reason: "known limitation" }],
        });
        const comparison = buildComparison(
            readoutA,
            readoutB,
            meta("A", readoutA),
            meta("B", readoutB),
            "any_hit",
        );

        expect(comparison.bucketsByIndex.get(0)).toBe("a_only");
        expect(comparison.bucketsByIndex.get(1)).toBe("waived");
        expect(comparison.global).toMatchObject({ a_only: 1, waived: 1, valid: 1 });
        expect(comparison.bucketDetails.map((detail) => detail.bucketIndex)).toEqual([0]);
        expect(comparison.points[0].counts.waived).toBe(1);

        // Waived is outside every set mode, like illegal / ignore.
        expect(matchesCompareSetMode("waived", "all")).toBe(false);
        expect(matchesCompareSetMode("waived", "neither")).toBe(false);

        // Reclassifying keeps the waived bucket waived.
        const recompared = recompareWithDefinition(comparison, "met_goal");
        expect(recompared.bucketsByIndex.get(1)).toBe("waived");
        expect(recompared.global.waived).toBe(1);
    });

    test("the merged display readout unions waivers, first reason wins", () => {
        const readoutA = createReadout({
            bucketHits: [3, 0],
            waivers: [{ start: 0, reason: "A says" }],
        });
        const readoutB = createReadout({
            recSha: "rec-b",
            bucketHits: [0, 3],
            waivers: [
                { start: 0, reason: "B says" },
                { start: 1, reason: "B only" },
            ],
        });
        const merged = buildCompareDisplayReadout(readoutA, readoutB, "both");
        expect(Array.from(merged.iter_bucket_waivers(0, null))).toEqual([
            { start: 0, reason: "A says" },
            { start: 1, reason: "B only" },
        ]);
        expect(Array.from(merged.iter_point_hits())[0]).toMatchObject({
            hits: 0,
            hit_buckets: 0,
            waived_buckets: 2,
            waived_target: 6,
        });
    });
});

describe("getBucketHitStatus", () => {
    test("distinguishes hit, partial, and unhit", () => {
        expect(getBucketHitStatus(3, 3)).toBe("hit");
        expect(getBucketHitStatus(5, 3)).toBe("hit");
        expect(getBucketHitStatus(1, 3)).toBe("partial");
        expect(getBucketHitStatus(0, 3)).toBe("unhit");
    });
});

describe("recompareWithDefinition", () => {
    test("reclassifies existing buckets without the source readouts", () => {
        const readoutA = createReadout({ bucketHits: [3, 0] });
        const readoutB = createReadout({ bucketHits: [0, 2] });
        const anyHit = buildComparison(
            readoutA,
            readoutB,
            meta("A", readoutA),
            meta("B", readoutB),
            "any_hit",
        );

        expect(anyHit.global.a_only).toBe(1);
        expect(anyHit.global.b_only).toBe(1);

        const metGoal = recompareWithDefinition(anyHit, "met_goal");
        expect(metGoal.definition).toBe("met_goal");
        expect(metGoal.global.a_only).toBe(1);
        expect(metGoal.global.b_only).toBe(0);
        expect(metGoal.global.neither).toBe(1);
        expect(metGoal.global.valid).toBe(2);

        expect(recompareWithDefinition(anyHit, "any_hit")).toBe(anyHit);
    });
});

describe("getCompareCompatibility", () => {
    test("finds compatible groups by def_sha", () => {
        const records = [
            { id: "1", label: "one", readout: createReadout({ defSha: "def-a" }) },
            { id: "2", label: "two", readout: createReadout({ defSha: "def-a" }) },
            { id: "3", label: "three", readout: createReadout({ defSha: "def-b" }) },
        ];
        const compatibility = getCompareCompatibility(records);
        expect(compatibility.canCompare).toBe(true);
        expect(compatibility.compatibleGroups).toHaveLength(1);
        expect(compatibility.compatibleGroups[0]).toHaveLength(2);
    });
});

describe("matchesCompareSetMode", () => {
    test("filters categories for set modes", () => {
        expect(matchesCompareSetMode("a_only", "a_only")).toBe(true);
        expect(matchesCompareSetMode("both", "a_only")).toBe(false);
        expect(matchesCompareSetMode("both", "all")).toBe(true);
        expect(matchesCompareSetMode("illegal", "all")).toBe(false);
    });
});

describe("buildCompareDisplayReadout", () => {
    test("uses B readout for b_only and merged hits for both", () => {
        const readoutA = createReadout({ recSha: "rec-a", bucketHits: [3, 0] });
        const readoutB = createReadout({ recSha: "rec-b", bucketHits: [0, 2] });

        const fromB = buildCompareDisplayReadout(readoutA, readoutB, "b_only");
        expect(Array.from(fromB.iter_bucket_hits(0, null)).map((entry) => entry.hits)).toEqual([
            0, 2,
        ]);

        const merged = buildCompareDisplayReadout(readoutA, readoutB, "both");
        expect(Array.from(merged.iter_bucket_hits(0, null)).map((entry) => entry.hits)).toEqual([
            3, 2,
        ]);
        expect(merged.get_source()).toBe("suite");
        expect(merged.get_source_key()).toBe("test vs test");

        const fromA = buildCompareDisplayReadout(readoutA, readoutB, "a_only");
        expect(Array.from(fromA.iter_bucket_hits(0, null)).map((entry) => entry.hits)).toEqual([
            3, 0,
        ]);
    });

    test("labels the shared all-mode tree as both sides of the pair", () => {
        const readoutA = new InMemoryReadout({
            ...materializeFixture("baseline", [3, 0]),
        });
        const readoutB = new InMemoryReadout({
            ...materializeFixture("improved", [0, 2]),
        });

        const display = buildCompareDisplayReadout(readoutA, readoutB, "all");
        expect(display.get_source()).toBe("riscv_compare");
        expect(display.get_source_key()).toBe("baseline vs improved");
        expect(Array.from(display.iter_bucket_hits(0, null)).map((entry) => entry.hits)).toEqual([
            3, 0,
        ]);
    });
});

function materializeFixture(sourceKey: string, bucketHits: number[]) {
    return {
        defSha: "def-a",
        recSha: `rec-${sourceKey}`,
        source: "riscv_compare",
        sourceKey,
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
                goal_end: 1,
                bucket_start: 0,
                bucket_end: 2,
                target: 2,
                target_buckets: 2,
                name: "root",
                description: "",
                motivation: "",
            },
        ],
        bucketGoals: [
            { start: 0, goal: 0 },
            { start: 1, goal: 0 },
        ],
        axes: [],
        axisValues: [],
        goals: [{ start: 0, name: "g", description: "", target: 1 }],
        pointHits: [{ start: 0, depth: 0, hits: bucketHits.reduce((a, b) => a + b, 0), hit_buckets: 1, full_buckets: 0 }],
        bucketHits: bucketHits.map((hits, start) => ({ start, hits })),
    };
}
