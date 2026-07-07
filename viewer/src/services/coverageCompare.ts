/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { materializeReadout, mergeCompareReadoutsForDisplay } from "@/services/readoutUtils";
import type {
    BucketCategory,
    CategoryCounts,
    CompareRecordMeta,
    CompareCompatibility,
    CompareRecordOption,
    CompareSetMode,
    ComparisonResult,
    CoverageDefinition,
    PointCompare,
} from "@/types/coverageCompare";

function emptyCategoryCounts(): CategoryCounts {
    return {
        a_only: 0,
        both: 0,
        b_only: 0,
        neither: 0,
        valid: 0,
        illegal: 0,
        ignore: 0,
    };
}

function isBucketCovered(
    hits: number,
    target: number,
    definition: CoverageDefinition,
): boolean {
    if (target <= 0) {
        return false;
    }
    if (definition === "any_hit") {
        return hits > 0;
    }
    return hits >= target;
}

function classifyValidBucket(
    hitsA: number,
    hitsB: number,
    target: number,
    definition: CoverageDefinition,
): Exclude<BucketCategory, "illegal" | "ignore"> {
    const coveredA = isBucketCovered(hitsA, target, definition);
    const coveredB = isBucketCovered(hitsB, target, definition);
    if (coveredA && coveredB) {
        return "both";
    }
    if (coveredA) {
        return "a_only";
    }
    if (coveredB) {
        return "b_only";
    }
    return "neither";
}

function incrementCategory(counts: CategoryCounts, category: BucketCategory): void {
    counts[category] += 1;
    if (category !== "illegal" && category !== "ignore") {
        counts.valid += 1;
    }
}

function buildPointPaths(points: PointTuple[]): Map<number, string> {
    const paths = new Map<number, string>();
    const stack: string[] = [];
    for (const point of points) {
        stack.splice(point.depth);
        stack.push(point.name);
        paths.set(point.start, stack.join(" / "));
    }
    return paths;
}

function buildAxisModels(
    axes: AxisTuple[],
    axisValues: AxisValueTuple[],
    axisValueStart: number,
): Array<{ name: string; offset: number; size: number; stride: number }> {
    const models = axes.map((axis) => ({
        name: axis.name,
        offset: axis.value_start - axisValueStart,
        size: axis.value_end - axis.value_start,
        stride: 1,
    }));
    let stride = 1;
    for (let axisIdx = models.length - 1; axisIdx >= 0; axisIdx -= 1) {
        models[axisIdx].stride = stride;
        stride *= Math.max(models[axisIdx].size, 1);
    }
    return models;
}

function decodeAxisValues(
    bucketOffset: number,
    axisModels: Array<{ name: string; offset: number; size: number; stride: number }>,
    axisValues: AxisValueTuple[],
): Record<string, string> {
    const values: Record<string, string> = {};
    for (const axisModel of axisModels) {
        const valueIndex = Math.floor(bucketOffset / axisModel.stride) % axisModel.size;
        values[axisModel.name] = axisValues[axisModel.offset + valueIndex].value;
    }
    return values;
}

function isPathAncestor(ancestor: PointCompare, descendant: PointCompare): boolean {
    return (
        ancestor.pointStart !== descendant.pointStart
        && ancestor.depth < descendant.depth
        && descendant.path.startsWith(`${ancestor.path} / `)
    );
}

function rollupCovergroups(points: PointCompare[], leafPointStarts: Set<number>): void {
    const ancestorStarts = new Set<number>();
    for (const ancestor of points) {
        for (const descendant of points) {
            if (isPathAncestor(ancestor, descendant)) {
                ancestorStarts.add(ancestor.pointStart);
            }
        }
    }

    for (const point of points) {
        if (ancestorStarts.has(point.pointStart)) {
            point.counts = emptyCategoryCounts();
        }
    }

    for (const leaf of points) {
        if (!leafPointStarts.has(leaf.pointStart)) {
            continue;
        }
        for (const ancestor of points) {
            if (!isPathAncestor(ancestor, leaf)) {
                continue;
            }
            for (const key of [
                "a_only",
                "both",
                "b_only",
                "neither",
                "valid",
                "illegal",
                "ignore",
            ] as const) {
                ancestor.counts[key] += leaf.counts[key];
            }
        }
    }
}

export function getCompareCompatibility(
    records: Array<{ id: string; label: string; readout: Readout }>,
): CompareCompatibility {
    if (records.length < 2) {
        return {
            canCompare: false,
            compatibleGroups: [],
            message: "Load at least two coverage records to compare.",
        };
    }

    const byDefSha = new Map<string, CompareRecordOption[]>();
    for (const record of records) {
        const defSha = record.readout.get_def_sha();
        const group = byDefSha.get(defSha) ?? [];
        group.push({ id: record.id, label: record.label, defSha });
        byDefSha.set(defSha, group);
    }

    const compatibleGroups = Array.from(byDefSha.values()).filter((group) => group.length >= 2);
    if (compatibleGroups.length === 0) {
        return {
            canCompare: false,
            compatibleGroups: [],
            message: "No compatible record pairs found (records must share the same covertree definition).",
        };
    }

    return {
        canCompare: true,
        compatibleGroups,
        message: null,
    };
}

export function buildComparison(
    readoutA: Readout,
    readoutB: Readout,
    recordA: CompareRecordMeta,
    recordB: CompareRecordMeta,
    definition: CoverageDefinition,
): ComparisonResult {
    const dataA = materializeReadout(readoutA);
    const dataB = materializeReadout(readoutB);

    if (dataA.defSha !== dataB.defSha) {
        throw new Error("Cannot compare records with different covertree definitions.");
    }
    if (dataA.bucketGoals.length !== dataB.bucketGoals.length) {
        throw new Error("Cannot compare records with different bucket counts.");
    }

    const goalTargetByStart = new Map<number, number>();
    const goalNameByStart = new Map<number, string>();
    for (const goal of dataA.goals) {
        goalTargetByStart.set(goal.start, goal.target);
        goalNameByStart.set(goal.start, goal.name);
    }

    const hitsAByIndex = new Map<number, number>();
    for (const bucketHit of dataA.bucketHits) {
        hitsAByIndex.set(bucketHit.start, bucketHit.hits);
    }
    const hitsBByIndex = new Map<number, number>();
    for (const bucketHit of dataB.bucketHits) {
        hitsBByIndex.set(bucketHit.start, bucketHit.hits);
    }

    const global = emptyCategoryCounts();
    const bucketsByIndex = new Map<number, BucketCategory>();
    const bucketDetails: BucketDetail[] = [];
    const pointPaths = buildPointPaths(dataA.points);

    const leafPoints = dataA.points.filter((point) => point.end === point.start + 1);
    const points: PointCompare[] = dataA.points.map((point) => ({
        pointStart: point.start,
        name: point.name,
        path: pointPaths.get(point.start) ?? point.name,
        depth: point.depth,
        isCovergroup: point.end !== point.start + 1,
        counts: emptyCategoryCounts(),
        bucketStart: point.bucket_start,
        bucketEnd: point.bucket_end,
    }));

    const pointsByStart = new Map(points.map((point) => [point.pointStart, point]));
    const axisValueOrderByPoint = new Map<number, Record<string, string[]>>();
    const bucketGoalByStart = new Map<number, number>();
    for (const bucketGoal of dataA.bucketGoals) {
        bucketGoalByStart.set(bucketGoal.start, bucketGoal.goal);
    }

    for (const leaf of leafPoints) {
        const pointCompare = pointsByStart.get(leaf.start);
        if (!pointCompare) {
            continue;
        }

        const axes = dataA.axes.slice(leaf.axis_start, leaf.axis_end);
        const axisValues = dataA.axisValues.slice(leaf.axis_value_start, leaf.axis_value_end);
        const axisModels = buildAxisModels(axes, axisValues, leaf.axis_value_start);

        const axisOrder: Record<string, string[]> = {};
        for (const axis of axes) {
            axisOrder[axis.name] = axisValues
                .slice(axis.value_start - leaf.axis_value_start, axis.value_end - leaf.axis_value_start)
                .map((entry) => entry.value);
        }
        axisValueOrderByPoint.set(leaf.start, axisOrder);

        for (let bucketIdx = leaf.bucket_start; bucketIdx < leaf.bucket_end; bucketIdx += 1) {
            const goalIndex = bucketGoalByStart.get(bucketIdx);
            if (goalIndex === undefined) {
                continue;
            }
            const target = goalTargetByStart.get(goalIndex) ?? 0;
            const hitsA = hitsAByIndex.get(bucketIdx) ?? 0;
            const hitsB = hitsBByIndex.get(bucketIdx) ?? 0;

            let category: BucketCategory;
            if (target < 0) {
                category = "illegal";
            } else if (target === 0) {
                category = "ignore";
            } else {
                category = classifyValidBucket(hitsA, hitsB, target, definition);
            }

            bucketsByIndex.set(bucketIdx, category);
            incrementCategory(global, category);
            incrementCategory(pointCompare.counts, category);

            if (category !== "illegal" && category !== "ignore") {
                bucketDetails.push({
                    bucketIndex: bucketIdx,
                    pointStart: leaf.start,
                    pointPath: pointCompare.path,
                    category,
                    hitsA,
                    hitsB,
                    target,
                    goalName: goalNameByStart.get(goalIndex) ?? "",
                    axisValues: decodeAxisValues(
                        bucketIdx - leaf.bucket_start,
                        axisModels,
                        axisValues,
                    ),
                });
            }
        }
    }

    rollupCovergroups(points, new Set(leafPoints.map((leaf) => leaf.start)));

    return {
        recordA,
        recordB,
        definition,
        global,
        points,
        pointsByStart,
        bucketsByIndex,
        hitsAByIndex,
        hitsBByIndex,
        bucketDetails,
        axisValueOrderByPoint,
    };
}

export function getBucketCategoryForIndex(
    comparison: ComparisonResult,
    bucketIndex: number,
): BucketCategory {
    return comparison.bucketsByIndex.get(bucketIndex) ?? "neither";
}

export type BucketHitStatus = "hit" | "partial" | "unhit";

/**
 * Classify a single side's hits against its target:
 * - hit: meets the goal (hits >= target)
 * - partial: hit at least once but short of the goal (0 < hits < target)
 * - unhit: never hit (hits <= 0)
 */
export function getBucketHitStatus(hits: number, target: number): BucketHitStatus {
    if (hits <= 0) {
        return "unhit";
    }
    if (target > 0 && hits < target) {
        return "partial";
    }
    return "hit";
}

/**
 * Re-derive a comparison under a different coverage definition, reusing the
 * already-materialized hits/targets so we don't need the source readouts again.
 * Illegal/ignore buckets keep their status; only valid buckets are reclassified.
 */
export function recompareWithDefinition(
    comparison: ComparisonResult,
    definition: CoverageDefinition,
): ComparisonResult {
    if (comparison.definition === definition) {
        return comparison;
    }

    const global = emptyCategoryCounts();
    const bucketsByIndex = new Map<number, BucketCategory>(comparison.bucketsByIndex);

    const leafPointStarts = new Set(
        comparison.points.filter((point) => !point.isCovergroup).map((point) => point.pointStart),
    );

    const points: PointCompare[] = comparison.points.map((point) => {
        if (leafPointStarts.has(point.pointStart)) {
            const counts = emptyCategoryCounts();
            counts.illegal = point.counts.illegal;
            counts.ignore = point.counts.ignore;
            return { ...point, counts };
        }
        return { ...point, counts: emptyCategoryCounts() };
    });
    const pointsByStart = new Map(points.map((point) => [point.pointStart, point]));

    const bucketDetails: BucketDetail[] = comparison.bucketDetails.map((detail) => {
        const category = classifyValidBucket(
            detail.hitsA,
            detail.hitsB,
            detail.target,
            definition,
        );
        bucketsByIndex.set(detail.bucketIndex, category);
        incrementCategory(global, category);
        const point = pointsByStart.get(detail.pointStart);
        if (point) {
            incrementCategory(point.counts, category);
        }
        return { ...detail, category };
    });

    global.illegal = comparison.global.illegal;
    global.ignore = comparison.global.ignore;

    rollupCovergroups(points, leafPointStarts);

    return {
        ...comparison,
        definition,
        global,
        points,
        pointsByStart,
        bucketsByIndex,
        bucketDetails,
    };
}

export function matchesCompareSetMode(
    category: BucketCategory,
    setMode: CompareSetMode,
): boolean {
    if (setMode === "all") {
        return category === "a_only"
            || category === "both"
            || category === "b_only"
            || category === "neither";
    }
    return category === setMode;
}

export function formatCategoryPercent(count: number, valid: number): string {
    if (valid === 0) {
        return "0.0%";
    }
    return `${((count / valid) * 100).toFixed(1)}%`;
}

/** Readout whose bucket/point hits match what the active compare set mode should display. */
export function buildCompareDisplayReadout(
    readoutA: Readout,
    readoutB: Readout,
    setMode: CompareSetMode,
): Readout {
    switch (setMode) {
        case "b_only":
            return readoutB;
        case "both":
            return mergeCompareReadoutsForDisplay(readoutA, readoutB);
        default:
            return readoutA;
    }
}
