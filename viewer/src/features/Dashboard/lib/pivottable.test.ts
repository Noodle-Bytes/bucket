/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";
import CoverageTree from "./coveragetree";
import { aggregatePivotCells, buildBucketRecords } from "./pivottable";
import { InMemoryReadout } from "@/services/readoutUtils";

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
        pointHits: [{ start: 0, hits: 20, hit_buckets: 2, full_buckets: 2 }],
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
            });
            expect(typeof cellALo!.sumTargets).toBe("number");

            const cellAHi = cellMap.get("A\thi");
            expect(cellAHi).toEqual({
                sumHits: 0,
                sumTargets: 10,
                bucketCount: 1,
            });

            // Ratio used by the table renderer must be finite (not NaN from string concat).
            for (const cell of cellMap.values()) {
                const ratio = cell.sumTargets !== 0 ? cell.sumHits / cell.sumTargets : Number.NaN;
                expect(Number.isFinite(ratio)).toBe(true);
            }
        },
    );
});
