/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";
import CoverageTree from "./coveragetree";
import {
    aggregatePivotCells,
    buildBucketRecords,
    getCompareCellBackground,
} from "./pivottable";
import { buildComparison } from "@/services/coverageCompare";
import { InMemoryReadout } from "@/services/readoutUtils";
import type { CompareRecordMeta } from "@/types/coverageCompare";

/** Former flat-record keys plus current BucketRecord fields that must not clash with axes. */
const RESERVED_AXIS_NAMES = [
    "target",
    "hits",
    "axes",
    "hitCount",
    "goalTarget",
    "rowKey",
    "rowLabel",
    "sumHits",
    "sumTargets",
    "bucketCount",
] as const;

function readoutWithClashAxis(clashAxisName: string): InMemoryReadout {
    return new InMemoryReadout({
        defSha: "def",
        recSha: "rec",
        source: "test",
        sourceKey: "1",
        bucketVersion: "",
        points: [
            {
                start: 0,
                depth: 0,
                end: 1,
                axis_start: 0,
                axis_end: 2,
                axis_value_start: 0,
                axis_value_end: 4,
                goal_start: 0,
                goal_end: 1,
                bucket_start: 0,
                bucket_end: 4,
                target: 4,
                target_buckets: 4,
                name: "clash_coverpoint",
                description: "",
            },
        ],
        axes: [
            {
                start: 0,
                value_start: 0,
                value_end: 2,
                name: "kind",
                description: "",
            },
            {
                start: 1,
                value_start: 2,
                value_end: 4,
                name: clashAxisName,
                description: "",
            },
        ],
        axisValues: [
            { start: 0, value: "A" },
            { start: 1, value: "B" },
            { start: 2, value: "lo" },
            { start: 3, value: "hi" },
        ],
        goals: [{ start: 0, name: "DEFAULT", description: "", target: 10 }],
        bucketGoals: [
            { start: 0, goal: 0 },
            { start: 1, goal: 0 },
            { start: 2, goal: 0 },
            { start: 3, goal: 0 },
        ],
        pointHits: [{ start: 0, depth: 0, hits: 20, hit_buckets: 2, full_buckets: 2 }],
        bucketHits: [
            { start: 0, hits: 10 },
            { start: 1, hits: 0 },
            { start: 2, hits: 10 },
            { start: 3, hits: 0 },
        ],
    });
}

describe("buildBucketRecords", () => {
    test.each(RESERVED_AXIS_NAMES)(
        "keeps numeric metrics when an axis is named %s",
        (clashAxisName) => {
            const tree = CoverageTree.fromReadouts([readoutWithClashAxis(clashAxisName)]);
            const node = tree.getRoots()[0];
            const { buckets, axisNames } = buildBucketRecords(node as never);

            expect(axisNames).toEqual(["kind", clashAxisName]);
            expect(buckets).toHaveLength(4);
            for (const bucket of buckets) {
                expect(bucket.goalTarget).toBe(10);
                expect(typeof bucket.hitCount).toBe("number");
                expect(bucket.axes[clashAxisName] === "lo" || bucket.axes[clashAxisName] === "hi").toBe(
                    true,
                );
            }
            expect(buckets.map((b) => b.hitCount)).toEqual([10, 0, 10, 0]);
        },
    );
});

describe("aggregatePivotCells", () => {
    test.each(RESERVED_AXIS_NAMES)(
        "aggregates numeric cells when an axis is named %s",
        (clashAxisName) => {
            const tree = CoverageTree.fromReadouts([readoutWithClashAxis(clashAxisName)]);
            const { buckets } = buildBucketRecords(tree.getRoots()[0] as never);
            const { cellMap, rowKeys, colKeys } = aggregatePivotCells(
                buckets,
                ["kind"],
                [clashAxisName],
            );

            expect(rowKeys).toEqual(["A", "B"]);
            expect(colKeys).toEqual(["hi", "lo"]);

            const cellALo = cellMap.get("A\tlo");
            expect(cellALo).toEqual({
                sumHits: 10,
                sumTargets: 10,
                bucketCount: 1,
                waivedCount: 0,
            });
            expect(typeof cellALo!.sumTargets).toBe("number");

            const cellAHi = cellMap.get("A\thi");
            expect(cellAHi).toEqual({
                sumHits: 0,
                sumTargets: 10,
                bucketCount: 1,
                waivedCount: 0,
            });

            // Ratio used by the table renderer must be finite (not NaN from string concat).
            for (const cell of cellMap.values()) {
                const ratio = cell.sumTargets !== 0 ? cell.sumHits / cell.sumTargets : Number.NaN;
                expect(Number.isFinite(ratio)).toBe(true);
            }
        },
    );
});

describe("axis value ordering", () => {
    const tree = CoverageTree.fromReadouts([readoutWithClashAxis("level")]);
    const { buckets, axisValueOrder } = buildBucketRecords(tree.getRoots()[0] as never);

    test("buildBucketRecords reports axis values in definition order", () => {
        expect(axisValueOrder).toEqual({ kind: ["A", "B"], level: ["lo", "hi"] });
    });

    test("keys follow the definition order when it is supplied", () => {
        const { rowKeys, colKeys } = aggregatePivotCells(
            buckets,
            ["level"],
            ["kind", "level"],
            undefined,
            axisValueOrder,
        );
        expect(rowKeys).toEqual(["lo", "hi"]);
        expect(colKeys).toEqual(["Alo", "Ahi", "Blo", "Bhi"]);
    });

    test("unknown values fall back to a natural sort rather than an alphabetical one", () => {
        const ranges = ["1", "2-3", "4-6", "7-10", "11-16", "17-32", "33+"];
        const records = ranges.map((value, bucketIndex) => ({
            axes: { range: value },
            bucketIndex,
            hitCount: 0,
            goalTarget: 1,
        }));
        const { rowKeys } = aggregatePivotCells(records, ["range"], []);
        expect(rowKeys).toEqual(ranges);
    });
});

describe("compare mode", () => {
    /**
     * Two axes (kind: A/B, level: lo/hi), so buckets 0..3 run in kind-major order.
     * Bucket 3 uses a target-0 goal so the comparison marks it "ignore".
     */
    function compareReadout(sourceKey: string, bucketHits: number[]): InMemoryReadout {
        return new InMemoryReadout({
            defSha: "def",
            recSha: `rec-${sourceKey}`,
            source: "test",
            sourceKey,
            bucketVersion: "",
            points: [
                {
                    start: 0,
                    depth: 0,
                    end: 1,
                    axis_start: 0,
                    axis_end: 2,
                    axis_value_start: 0,
                    axis_value_end: 4,
                    goal_start: 0,
                    goal_end: 2,
                    bucket_start: 0,
                    bucket_end: 4,
                    target_buckets: 3,
                    target: 30,
                    name: "cmp_coverpoint",
                    description: "",
                },
            ],
            axes: [
                { start: 0, value_start: 0, value_end: 2, name: "kind", description: "" },
                { start: 1, value_start: 2, value_end: 4, name: "level", description: "" },
            ],
            axisValues: [
                { start: 0, value: "A" },
                { start: 1, value: "B" },
                { start: 2, value: "lo" },
                { start: 3, value: "hi" },
            ],
            goals: [
                { start: 0, name: "DEFAULT", description: "", target: 10 },
                { start: 1, name: "IGNORE", description: "", target: 0 },
            ],
            bucketGoals: [
                { start: 0, goal: 0 },
                { start: 1, goal: 0 },
                { start: 2, goal: 0 },
                { start: 3, goal: 1 },
            ],
            pointHits: [{ start: 0, depth: 0, hits: 0, hit_buckets: 0, full_buckets: 0 }],
            bucketHits: bucketHits.map((hits, start) => ({ start, hits })),
        });
    }

    function metaFor(id: string, readout: InMemoryReadout): CompareRecordMeta {
        return {
            id,
            label: id,
            source: readout.get_source(),
            sourceKey: readout.get_source_key(),
            defSha: readout.get_def_sha(),
            recSha: readout.get_rec_sha(),
        };
    }

    // Per bucket: 0 is both, 1 is B only, 2 is A only, 3 is ignored.
    const readoutA = compareReadout("a", [10, 0, 4, 5]);
    const readoutB = compareReadout("b", [10, 10, 0, 5]);
    const bucketsOf = (readout: InMemoryReadout) =>
        buildBucketRecords(CoverageTree.fromReadouts([readout]).getRoots()[0] as never).buckets;
    const compare = (definition: "any_hit" | "met_goal") =>
        buildComparison(
            readoutA,
            readoutB,
            metaFor("a", readoutA),
            metaFor("b", readoutB),
            definition,
        );

    test("buildBucketRecords keeps the global bucket index", () => {
        expect(bucketsOf(readoutA).map((b) => b.bucketIndex)).toEqual([0, 1, 2, 3]);
    });

    test("a cell mixing an A-only and a B-only bucket is categorised as both", () => {
        // Row "A" holds bucket 0 (both) and bucket 1 (B only); row "B" holds
        // bucket 2 (A only) and the ignored bucket 3.
        const { cellMap } = aggregatePivotCells(
            bucketsOf(readoutA),
            ["kind"],
            [],
            compare("any_hit"),
        );

        expect(cellMap.get("A\t")).toEqual({
            sumHits: 10,
            sumTargets: 20,
            bucketCount: 2,
            waivedCount: 0,
            compare: { validBuckets: 2, hitsA: 10, hitsB: 20, target: 20, category: "both" },
        });
        // The ignored bucket counts towards bucketCount but not towards the comparison.
        expect(cellMap.get("B\t")).toEqual({
            sumHits: 9,
            sumTargets: 10,
            bucketCount: 2,
            waivedCount: 0,
            compare: { validBuckets: 1, hitsA: 4, hitsB: 0, target: 10, category: "a_only" },
        });
    });

    test("combining across every axis yields a single both cell", () => {
        const { cellMap } = aggregatePivotCells(bucketsOf(readoutA), [], [], compare("any_hit"));
        expect(cellMap.get("\t")?.compare).toEqual({
            validBuckets: 3,
            hitsA: 14,
            hitsB: 20,
            target: 30,
            category: "both",
        });
    });

    test("met_goal judges the combined cell against its combined target", () => {
        const { cellMap } = aggregatePivotCells(
            bucketsOf(readoutA),
            ["kind"],
            [],
            compare("met_goal"),
        );
        // Row "A": 10 of 20 hit in A, 20 of 20 in B, so only B met the goal.
        expect(cellMap.get("A\t")?.compare?.category).toBe("b_only");
        // Row "B": 4 of 10 in A, 0 in B, so neither.
        expect(cellMap.get("B\t")?.compare?.category).toBe("neither");
    });

    test("cells holding only ignored buckets have no category or tint", () => {
        const { cellMap } = aggregatePivotCells(
            bucketsOf(readoutA),
            ["kind", "level"],
            [],
            compare("any_hit"),
        );
        const cell = cellMap.get("B\u001fhi\t");
        expect(cell?.compare).toEqual({ validBuckets: 0, hitsA: 0, hitsB: 0, target: 0 });
        expect(getCompareCellBackground(cell?.compare, "all")).toBeUndefined();
    });

    test("aggregatePivotCells omits compare info outside compare mode", () => {
        const { cellMap } = aggregatePivotCells(bucketsOf(readoutA), ["kind"], []);
        expect(cellMap.get("A\t")).not.toHaveProperty("compare");
    });

    test("getCompareCellBackground uses the strong tint only for the selected set mode", () => {
        const info = { validBuckets: 1, hitsA: 1, hitsB: 1, target: 1, category: "both" as const };
        expect(getCompareCellBackground(info, "all")).toBe("rgba(22, 163, 74, 0.35)");
        expect(getCompareCellBackground(info, "both")).toBe("rgba(22, 163, 74, 0.35)");
        expect(getCompareCellBackground(info, "a_only")).toBe("rgba(22, 163, 74, 0.12)");
    });
});

describe("waived buckets in pivot cells", () => {
    test("waived buckets are counted but excluded from hit/target sums", () => {
        const buckets = [
            { axes: { kind: "A" }, bucketIndex: 0, hitCount: 10, goalTarget: 10 },
            { axes: { kind: "A" }, bucketIndex: 1, hitCount: 7, goalTarget: 10, waived: true },
            { axes: { kind: "B" }, bucketIndex: 2, hitCount: 0, goalTarget: 10, waived: true },
        ];
        const { cellMap } = aggregatePivotCells(buckets, ["kind"], []);
        expect(cellMap.get("A\t")).toEqual({
            sumHits: 10,
            sumTargets: 10,
            bucketCount: 2,
            waivedCount: 1,
        });
        // A cell made only of waived buckets has nothing to score.
        expect(cellMap.get("B\t")).toEqual({
            sumHits: 0,
            sumTargets: 0,
            bucketCount: 1,
            waivedCount: 1,
        });
    });
});
