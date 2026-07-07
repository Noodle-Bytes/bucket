/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";
import type { PointNode } from "./coveragetree";
import { getPointNodeCompareCounts, getPointNodeCoverageMetrics } from "./coveragemetrics";
import type { ComparisonResult } from "@/types/coverageCompare";
import type { CategoryCounts } from "@/types/coverageCompare";

function leaf(key: string, target: number, hits: number, buckets: number, hitBuckets: number): PointNode {
    return {
        key,
        title: key,
        children: [],
        data: {
            readout: {} as Readout,
            point: {
                target,
                target_buckets: buckets,
            } as PointTuple,
            point_hit: {
                hits,
                hit_buckets: hitBuckets,
                full_buckets: 0,
            } as PointHitTuple,
        },
    } as PointNode;
}

describe("getPointNodeCoverageMetrics", () => {
    test("returns leaf metrics from point_hit", () => {
        const node = leaf("a", 10, 7, 4, 3);
        expect(getPointNodeCoverageMetrics(node)).toEqual({
            target: 10,
            hits: 7,
            target_buckets: 4,
            hit_buckets: 3,
            full_buckets: 0,
        });
    });

    test("sums descendant leaves for covergroups", () => {
        const covergroup = {
            key: "cg",
            title: "CG",
            children: [leaf("a", 10, 3, 2, 1), leaf("b", 20, 12, 5, 4)],
            data: {
                readout: {} as Readout,
                point: {
                    target: 10,
                    target_buckets: 2,
                } as PointTuple,
                point_hit: {
                    hits: 3,
                    hit_buckets: 1,
                    full_buckets: 0,
                } as PointHitTuple,
            },
        } as PointNode;

        expect(getPointNodeCoverageMetrics(covergroup)).toEqual({
            target: 30,
            hits: 15,
            target_buckets: 7,
            hit_buckets: 5,
            full_buckets: 0,
        });
    });
});

describe("getPointNodeCompareCounts", () => {
    test("sums compare counts for tree covergroups", () => {
        function leafCounts(
            start: number,
            counts: Partial<CategoryCounts>,
        ): PointNode {
            return {
                key: String(start),
                title: String(start),
                children: [],
                data: {
                    readout: {} as Readout,
                    point: { start } as PointTuple,
                    point_hit: {} as PointHitTuple,
                },
            } as PointNode;
        }

        const comparison = {
            pointsByStart: new Map([
                [
                    1,
                    {
                        counts: {
                            a_only: 1,
                            both: 2,
                            b_only: 3,
                            neither: 4,
                            valid: 10,
                            illegal: 0,
                            ignore: 0,
                        },
                    },
                ],
                [
                    2,
                    {
                        counts: {
                            a_only: 10,
                            both: 0,
                            b_only: 0,
                            neither: 0,
                            valid: 10,
                            illegal: 0,
                            ignore: 0,
                        },
                    },
                ],
            ]),
        } as unknown as ComparisonResult;

        const covergroup = {
            key: "cg",
            title: "CG",
            children: [leafCounts(1, {}), leafCounts(2, {})],
            data: {
                readout: {} as Readout,
                point: { start: 99 } as PointTuple,
                point_hit: {} as PointHitTuple,
            },
        } as PointNode;

        expect(getPointNodeCompareCounts(covergroup, comparison)).toEqual({
            a_only: 11,
            both: 2,
            b_only: 3,
            neither: 4,
            valid: 20,
            illegal: 0,
            ignore: 0,
        });
    });
});
