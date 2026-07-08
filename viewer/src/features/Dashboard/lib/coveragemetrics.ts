/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import type { PointNode } from "./coveragetree";
import type { CategoryCounts, ComparisonResult } from "@/types/coverageCompare";

export type PointCoverageMetrics = {
    target: number;
    hits: number;
    target_buckets: number;
    hit_buckets: number;
    full_buckets: number;
};

const EMPTY_COMPARE_COUNTS: CategoryCounts = {
    a_only: 0,
    both: 0,
    b_only: 0,
    neither: 0,
    valid: 0,
    illegal: 0,
    ignore: 0,
};

/**
 * Cache of aggregated metrics keyed on node identity. Tree nodes (and their
 * readout tuples) are immutable once CoverageTree construction completes, and a
 * data refresh always builds fresh node objects, so results never go stale.
 * Using a WeakMap means dropped trees are garbage collected along with their
 * cached metrics.
 */
const coverageMetricsByNode = new WeakMap<PointNode, PointCoverageMetrics>();

function computePointNodeCoverageMetrics(node: PointNode): PointCoverageMetrics {
    const children = node.children ?? [];
    if (children.length === 0) {
        const { point, point_hit } = node.data ?? {};
        if (!point || !point_hit) {
            return {
                target: 0,
                hits: 0,
                target_buckets: 0,
                hit_buckets: 0,
                full_buckets: 0,
            };
        }
        return {
            target: point.target,
            hits: point_hit.hits,
            target_buckets: point.target_buckets,
            hit_buckets: point_hit.hit_buckets,
            full_buckets: point_hit.full_buckets,
        };
    }

    const totals: PointCoverageMetrics = {
        target: 0,
        hits: 0,
        target_buckets: 0,
        hit_buckets: 0,
        full_buckets: 0,
    };

    for (const child of children as PointNode[]) {
        const childMetrics = getPointNodeCoverageMetrics(child);
        totals.target += childMetrics.target;
        totals.hits += childMetrics.hits;
        totals.target_buckets += childMetrics.target_buckets;
        totals.hit_buckets += childMetrics.hit_buckets;
        totals.full_buckets += childMetrics.full_buckets;
    }

    return totals;
}

/**
 * Leaf nodes use readout point_hit; covergroups sum descendant leaf coverpoints.
 *
 * Results are memoized per node (bottom-up: aggregating a covergroup caches
 * every descendant too), so walking a tree costs O(nodes) overall instead of
 * O(depth x nodes). Callers must treat the returned object as read-only.
 */
export function getPointNodeCoverageMetrics(node: PointNode): PointCoverageMetrics {
    const cached = coverageMetricsByNode.get(node);
    if (cached) {
        return cached;
    }
    const metrics = computePointNodeCoverageMetrics(node);
    coverageMetricsByNode.set(node, metrics);
    return metrics;
}

/**
 * Compare counts cache, keyed first on the comparison (results differ per
 * comparison) and then on node identity. Both keys are stable object
 * identities: a re-run compare produces a new ComparisonResult, and a data
 * refresh produces new tree nodes.
 */
const compareCountsByComparison = new WeakMap<
    ComparisonResult,
    WeakMap<PointNode, CategoryCounts | undefined>
>();

function computePointNodeCompareCounts(
    node: PointNode,
    comparison: ComparisonResult,
): CategoryCounts | undefined {
    const children = node.children ?? [];
    if (children.length === 0) {
        return comparison.pointsByStart.get(node.data.point.start)?.counts;
    }

    const totals: CategoryCounts = { ...EMPTY_COMPARE_COUNTS };
    for (const child of children as PointNode[]) {
        const childCounts = getPointNodeCompareCounts(child, comparison);
        if (!childCounts) {
            continue;
        }
        totals.a_only += childCounts.a_only;
        totals.both += childCounts.both;
        totals.b_only += childCounts.b_only;
        totals.neither += childCounts.neither;
        totals.valid += childCounts.valid;
        totals.illegal += childCounts.illegal;
        totals.ignore += childCounts.ignore;
    }
    return totals;
}

/**
 * Compare category counts for a tree node. Covergroups sum descendant coverpoints
 * (tree structure), since readout leaf/covergroup flags do not always match the UI tree.
 *
 * Results are memoized per (comparison, node) pair; callers must treat the
 * returned object as read-only.
 */
export function getPointNodeCompareCounts(
    node: PointNode,
    comparison: ComparisonResult | undefined,
): CategoryCounts | undefined {
    if (!comparison) {
        return undefined;
    }

    let countsByNode = compareCountsByComparison.get(comparison);
    if (!countsByNode) {
        countsByNode = new WeakMap();
        compareCountsByComparison.set(comparison, countsByNode);
    }
    if (countsByNode.has(node)) {
        return countsByNode.get(node);
    }
    const counts = computePointNodeCompareCounts(node, comparison);
    countsByNode.set(node, counts);
    return counts;
}
