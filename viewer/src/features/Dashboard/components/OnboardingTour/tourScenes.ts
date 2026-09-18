/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import {
    coverageRatio,
    effectiveTargetBuckets,
    getPointNodeCoverageMetrics,
} from "../../lib/coveragemetrics";
import Tree, { TreeKey } from "../../lib/tree";
import type { PointNode } from "../../lib/coveragetree";

export const TOUR_SCENES = [
    "records",
    "views",
    "buckets",
    "pivot",
    "waivers",
    "compare",
] as const;

export type TourScene = (typeof TOUR_SCENES)[number];

export function tourSceneAt(index: number): TourScene | undefined {
    return TOUR_SCENES[index];
}

function axisCount(node: PointNode): number {
    const point = node.data?.point;
    if (!point) {
        return 0;
    }
    return Math.max(0, point.axis_end - point.axis_start);
}

/** Higher is a clearer on-screen pivot: 2–3 axes, mixed hits, compact table. */
function pivotTourScore(node: PointNode): number {
    const axes = axisCount(node);
    if (axes < 2) {
        return Number.NEGATIVE_INFINITY;
    }
    const metrics = getPointNodeCoverageMetrics(node);
    const buckets = effectiveTargetBuckets(metrics) || metrics.target_buckets;
    if (buckets < 8) {
        return Number.NEGATIVE_INFINITY;
    }

    const covered = coverageRatio(metrics.full_buckets, buckets);
    const mix = 1 - Math.abs(covered - 0.5) * 2;
    const axisFit = axes === 2 ? 1 : axes === 3 ? 0.9 : axes === 4 ? 0.35 : 0.15;
    const sizeFit = 1 / (1 + Math.abs(Math.log2(Math.max(buckets, 1) / 80)));
    return mix * 8 + axisFit * 3 + sizeFit * 2;
}

export function findTourSummaryNode(tree: Tree): PointNode | undefined {
    const roots = tree.getRoots() as PointNode[];
    return roots.find((node) => (node.children?.length ?? 0) > 0) ?? roots[0];
}

export function findTourCoverpoint(tree: Tree): PointNode | undefined {
    let firstLeaf: PointNode | undefined;
    let mostAxes: PointNode | undefined;
    let mostAxesCount = 0;
    let best: PointNode | undefined;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const [node] of tree.walk()) {
        const point = node as PointNode;
        if ((point.children?.length ?? 0) > 0) {
            continue;
        }
        if (!firstLeaf) {
            firstLeaf = point;
        }
        const axes = axisCount(point);
        if (axes > mostAxesCount) {
            mostAxes = point;
            mostAxesCount = axes;
        }
        const score = pivotTourScore(point);
        if (score > bestScore) {
            best = point;
            bestScore = score;
        }
    }

    if (best && Number.isFinite(bestScore)) {
        return best;
    }
    return (mostAxesCount >= 2 ? mostAxes : undefined) ?? firstLeaf;
}

export function expandedKeysForTourNode(tree: Tree, key: TreeKey): TreeKey[] {
    return tree
        .getAncestorsByKey(key)
        .map((node) => node.key)
        .filter((ancestorKey) => ancestorKey !== Tree.ROOT);
}
