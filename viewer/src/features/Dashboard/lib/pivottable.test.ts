/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";
import CoverageTree from "./coveragetree";
import { buildBucketRecords } from "./pivottable";
import { InMemoryReadout } from "@/services/readoutUtils";

describe("buildBucketRecords", () => {
    test("keeps goal targets when an axis is named target", () => {
        const readout = new InMemoryReadout({
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
                    name: "jump_operations",
                    description: "",
                },
            ],
            axes: [
                {
                    start: 0,
                    value_start: 0,
                    value_end: 2,
                    name: "jump_type",
                    description: "",
                },
                {
                    start: 1,
                    value_start: 2,
                    value_end: 4,
                    name: "target",
                    description: "",
                },
            ],
            axisValues: [
                { start: 0, value: "JAL" },
                { start: 1, value: "JALR" },
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

        const tree = CoverageTree.fromReadouts([readout]);
        const node = tree.getRoots()[0];
        expect(node).toBeTruthy();

        const { buckets, axisNames } = buildBucketRecords(node as never);
        expect(axisNames).toEqual(["jump_type", "target"]);
        expect(buckets).toHaveLength(4);
        for (const bucket of buckets) {
            expect(bucket.goalTarget).toBe(10);
            expect(typeof bucket.axes.target).toBe("string");
            expect(bucket.axes.target === "lo" || bucket.axes.target === "hi").toBe(true);
        }
        expect(buckets.map((b) => b.hitCount)).toEqual([10, 0, 10, 0]);

        // Pivot aggregation must stay numeric even with a "target" axis.
        let sumTargets = 0;
        for (const bucket of buckets) {
            sumTargets += bucket.goalTarget;
        }
        expect(sumTargets).toBe(40);
        expect(typeof sumTargets).toBe("number");
    });
});
