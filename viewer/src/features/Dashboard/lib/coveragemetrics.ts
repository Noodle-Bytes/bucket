/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import type { PointNode } from "./coveragetree";
import type { CategoryCounts, ComparisonResult } from "@/types/coverageCompare";

export type PointCoverageMetrics = {
    /** Raw hit target from the definition (includes waived buckets). */
    target: number;
    hits: number;
    /** Raw count of valid buckets from the definition (includes waived). */
    target_buckets: number;
    hit_buckets: number;
    full_buckets: number;
    /** Buckets excluded from scoring by a waiver, and their summed target. */
    waived_buckets: number;
    waived_target: number;
};

const EMPTY_METRICS: PointCoverageMetrics = {
    target: 0,
    hits: 0,
    target_buckets: 0,
    hit_buckets: 0,
    full_buckets: 0,
    waived_buckets: 0,
    waived_target: 0,
};

/** Hit target with waived buckets removed: the percentage denominator. */
export function effectiveTarget(metrics: PointCoverageMetrics): number {
    return Math.max(0, metrics.target - metrics.waived_target);
}

/** Valid bucket count with waived buckets removed: the percentage denominator. */
export function effectiveTargetBuckets(metrics: PointCoverageMetrics): number {
    return Math.max(0, metrics.target_buckets - metrics.waived_buckets);
}

/** `numerator / denominator`, or 0 when there is nothing to score. */
export function coverageRatio(numerator: number, denominator: number): number {
    return denominator > 0 ? numerator / denominator : 0;
}

const EMPTY_COMPARE_COUNTS: CategoryCounts = {
    a_only: 0,
    both: 0,
    b_only: 0,
    neither: 0,
    valid: 0,
    illegal: 0,
    ignore: 0,
    waived: 0,
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
            return { ...EMPTY_METRICS };
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

    const totals: PointCoverageMetrics = { ...EMPTY_METRICS };

    for (const child of children as PointNode[]) {
        const childMetrics = getPointNodeCoverageMetrics(child);
        totals.target += childMetrics.target;
        totals.hits += childMetrics.hits;
        totals.target_buckets += childMetrics.target_buckets;
        totals.hit_buckets += childMetrics.hit_buckets;
        totals.full_buckets += childMetrics.full_buckets;
        totals.waived_buckets += childMetrics.waived_buckets;
        totals.waived_target += childMetrics.waived_target;
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
    // Frozen so an accidental mutation by a consumer throws instead of
    // silently poisoning the cache for every other consumer.
    const metrics = Object.freeze(computePointNodeCoverageMetrics(node));
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
        totals.waived += childCounts.waived;
    }
    // Frozen so an accidental mutation by a consumer throws instead of
    // silently poisoning the cache. (Leaf counts above are owned by the
    // comparison result, so they are returned as-is.)
    return Object.freeze(totals);
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
