/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";
import type { PointNode } from "./coveragetree";
import {
    coverageRatio,
    effectiveTarget,
    effectiveTargetBuckets,
    getPointNodeCompareCounts,
    getPointNodeCoverageMetrics,
    type PointCoverageMetrics,
} from "./coveragemetrics";
import type { ComparisonResult } from "@/types/coverageCompare";

function leaf(
    key: string,
    target: number,
    hits: number,
    buckets: number,
    hitBuckets: number,
    waived?: { buckets: number; target: number },
): PointNode {
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
                ...(waived
                    ? { waived_buckets: waived.buckets, waived_target: waived.target }
                    : {}),
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
            waived_buckets: 0,
            waived_target: 0,
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
            waived_buckets: 0,
            waived_target: 0,
        });
    });

    test("waived counts aggregate and shrink the effective denominators", () => {
        // Leaf a: 4 buckets x 5 hits = target 20, one bucket waived (5).
        // Leaf b: no waivers. Legacy point_hit rows omit the fields (0).
        const covergroup = {
            key: "cg",
            title: "CG",
            children: [
                leaf("a", 20, 10, 4, 2, { buckets: 1, target: 5 }),
                leaf("b", 10, 10, 2, 2),
            ],
            data: {
                readout: {} as Readout,
                point: { target: 0, target_buckets: 0 } as PointTuple,
                point_hit: { hits: 0, hit_buckets: 0, full_buckets: 0 } as PointHitTuple,
            },
        } as PointNode;

        const metrics = getPointNodeCoverageMetrics(covergroup);
        expect(metrics.waived_buckets).toBe(1);
        expect(metrics.waived_target).toBe(5);
        expect(effectiveTarget(metrics)).toBe(25);
        expect(effectiveTargetBuckets(metrics)).toBe(5);
        expect(coverageRatio(metrics.hits, effectiveTarget(metrics))).toBeCloseTo(20 / 25);
        expect(coverageRatio(metrics.hit_buckets, effectiveTargetBuckets(metrics))).toBeCloseTo(
            4 / 5,
        );
        expect(coverageRatio(1, 0)).toBe(0);
    });

    const EMPTY: PointCoverageMetrics = {
        target: 0,
        hits: 0,
        target_buckets: 0,
        hit_buckets: 0,
        full_buckets: 0,
        waived_buckets: 0,
        waived_target: 0,
    };

    /** Reference implementation without memoization, for validating the cached path. */
    function referenceMetrics(node: PointNode): PointCoverageMetrics {
        const children = (node.children ?? []) as PointNode[];
        if (children.length === 0) {
            const { point, point_hit } = node.data ?? {};
            if (!point || !point_hit) {
                return { ...EMPTY };
            }
            return {
                target: point.target,
                hits: point_hit.hits,
                target_buckets: point.target_buckets,
                hit_buckets: point_hit.hit_buckets,
                full_buckets: point_hit.full_buckets,
                waived_buckets: point_hit.waived_buckets ?? 0,
                waived_target: point_hit.waived_target ?? 0,
            };
        }
        return children.map(referenceMetrics).reduce(
            (acc, m) => ({
                target: acc.target + m.target,
                hits: acc.hits + m.hits,
                target_buckets: acc.target_buckets + m.target_buckets,
                hit_buckets: acc.hit_buckets + m.hit_buckets,
                full_buckets: acc.full_buckets + m.full_buckets,
                waived_buckets: acc.waived_buckets + m.waived_buckets,
                waived_target: acc.waived_target + m.waived_target,
            }),
            { ...EMPTY },
        );
    }

    function group(key: string, children: PointNode[]): PointNode {
        return {
            key,
            title: key,
            children,
            data: {
                readout: {} as Readout,
                point: { target: 0, target_buckets: 0 } as PointTuple,
                point_hit: { hits: 0, hit_buckets: 0, full_buckets: 0 } as PointHitTuple,
            },
        } as PointNode;
    }

    test("cached results for nested covergroups match uncached computation", () => {
        const inner = group("inner", [leaf("a", 10, 3, 2, 1), leaf("b", 20, 12, 5, 4)]);
        const middle = group("middle", [inner, leaf("c", 5, 5, 3, 3)]);
        const root = group("root", [middle, leaf("d", 7, 0, 1, 0)]);

        // Query children first so the root aggregation exercises cached child entries.
        expect(getPointNodeCoverageMetrics(inner)).toEqual(referenceMetrics(inner));
        expect(getPointNodeCoverageMetrics(middle)).toEqual(referenceMetrics(middle));
        expect(getPointNodeCoverageMetrics(root)).toEqual(referenceMetrics(root));
        expect(getPointNodeCoverageMetrics(root)).toEqual({
            target: 42,
            hits: 20,
            target_buckets: 11,
            hit_buckets: 8,
            full_buckets: 0,
            waived_buckets: 0,
            waived_target: 0,
        });
    });

    test("repeated calls return the memoized result for the same node", () => {
        const covergroup = group("cg", [leaf("a", 10, 3, 2, 1), leaf("b", 20, 12, 5, 4)]);
        const first = getPointNodeCoverageMetrics(covergroup);
        const second = getPointNodeCoverageMetrics(covergroup);
        expect(second).toBe(first);
        expect(second).toEqual(referenceMetrics(covergroup));
    });

    test("cache is keyed on node identity, not structure", () => {
        const treeA = group("cg", [leaf("a", 10, 3, 2, 1)]);
        const treeB = group("cg", [leaf("a", 40, 25, 8, 6)]);
        expect(getPointNodeCoverageMetrics(treeA)).toEqual(referenceMetrics(treeA));
        expect(getPointNodeCoverageMetrics(treeB)).toEqual(referenceMetrics(treeB));
        expect(getPointNodeCoverageMetrics(treeB).target).toBe(40);
    });
});

describe("getPointNodeCompareCounts", () => {
    function compareLeaf(start: number): PointNode {
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

    function compareGroup(children: PointNode[]): PointNode {
        return {
            key: "cg",
            title: "CG",
            children,
            data: {
                readout: {} as Readout,
                point: { start: 99 } as PointTuple,
                point_hit: {} as PointHitTuple,
            },
        } as PointNode;
    }

    test("sums compare counts for tree covergroups", () => {
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
                            waived: 0,
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
                            waived: 0,
                        },
                    },
                ],
            ]),
        } as unknown as ComparisonResult;

        const covergroup = compareGroup([compareLeaf(1), compareLeaf(2)]);

        expect(getPointNodeCompareCounts(covergroup, comparison)).toEqual({
            a_only: 11,
            both: 2,
            b_only: 3,
            neither: 4,
            valid: 20,
            illegal: 0,
            ignore: 0,
            waived: 0,
        });

        // Memoized: repeated calls with the same (node, comparison) pair reuse the result.
        expect(getPointNodeCompareCounts(covergroup, comparison)).toBe(
            getPointNodeCompareCounts(covergroup, comparison),
        );
    });

    test("cache is keyed on the comparison, not just the node", () => {
        function makeComparison(aOnly: number): ComparisonResult {
            return {
                pointsByStart: new Map([
                    [
                        1,
                        {
                            counts: {
                                a_only: aOnly,
                                both: 0,
                                b_only: 0,
                                neither: 0,
                                valid: aOnly,
                                illegal: 0,
                                ignore: 0,
                                waived: 0,
                            },
                        },
                    ],
                ]),
            } as unknown as ComparisonResult;
        }

        const covergroup = compareGroup([compareLeaf(1)]);

        const comparisonA = makeComparison(5);
        const comparisonB = makeComparison(9);

        expect(getPointNodeCompareCounts(covergroup, comparisonA)?.a_only).toBe(5);
        expect(getPointNodeCompareCounts(covergroup, comparisonB)?.a_only).toBe(9);
        // Re-query the first comparison to ensure it was not overwritten.
        expect(getPointNodeCompareCounts(covergroup, comparisonA)?.a_only).toBe(5);
        expect(getPointNodeCompareCounts(covergroup, undefined)).toBeUndefined();
    });
});
