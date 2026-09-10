/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

/**
 * Infer compact waiver rules from a selected set of buckets on one coverpoint.
 *
 * Coverage is exact: the union of inferred rules matches the selection — every
 * selected bucket is covered, and no unselected waivable bucket is included.
 * Within that constraint, rules are condensed into axis products
 * (e.g. x∈{0,1}) wherever a rectangle fits inside the selection.
 */

import type { WaiverAxes, WaiverSpec } from "@/services/waiverSpec";

export type SelectedBucket = {
    /** Global bucket index. */
    start: number;
    axisValues: Record<string, string>;
    target: number;
    hits: number;
};

export type InferredWaiverRule = {
    point: string;
    axes: WaiverAxes;
    /** Buckets this rule would cover on the coverpoint (waivable only). */
    coversStarts: number[];
    /** Selected buckets covered by this rule. */
    selectedCovered: number;
    /** Extra waivable buckets matched beyond the selection (should stay 0). */
    extraCount: number;
};

function natCompareSafe(a: string, b: string): number {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function uniqueSorted(values: Iterable<string>): string[] {
    return [...new Set(values)].sort(natCompareSafe);
}

function patternList(value: string | string[]): string[] {
    return typeof value === "string" ? [value] : value;
}

function compactAxisPatterns(values: string[]): string | string[] {
    const sorted = uniqueSorted(values);
    return sorted.length === 1 ? sorted[0] : sorted;
}

function toWaiverAxes(
    filters: Record<string, string[]>,
    allWaivable: SelectedBucket[],
    axisNames: string[],
): WaiverAxes {
    const axes: WaiverAxes = {};
    for (const axis of axisNames) {
        const selectedValues = filters[axis] ?? [];
        if (selectedValues.length === 0) {
            continue;
        }
        const allValues = uniqueSorted(
            allWaivable.map((bucket) => bucket.axisValues[axis] ?? ""),
        );
        // Omit axes where every waivable value is selected (fully free).
        if (selectedValues.length >= allValues.length) {
            continue;
        }
        axes[axis] = selectedValues.length === 1 ? selectedValues[0] : selectedValues;
    }
    return axes;
}

function bucketsMatchingAxes(
    buckets: SelectedBucket[],
    axes: WaiverAxes,
): SelectedBucket[] {
    const entries = Object.entries(axes);
    if (entries.length === 0) {
        return [...buckets];
    }
    return buckets.filter((bucket) =>
        entries.every(([axis, patterns]) => {
            const value = bucket.axisValues[axis] ?? "";
            const list = typeof patterns === "string" ? [patterns] : patterns;
            return list.includes(value);
        }),
    );
}

function buildRule(
    pointPath: string,
    axes: WaiverAxes,
    allWaivable: SelectedBucket[],
    selectedStarts: Set<number>,
): InferredWaiverRule {
    const covers = bucketsMatchingAxes(allWaivable, axes);
    const coversStarts = covers.map((bucket) => bucket.start);
    const selectedCovered = coversStarts.filter((start) => selectedStarts.has(start)).length;
    return {
        point: pointPath,
        axes,
        coversStarts,
        selectedCovered,
        extraCount: coversStarts.length - selectedCovered,
    };
}

function singletonAxes(
    seed: SelectedBucket,
    axisNames: string[],
): WaiverAxes {
    return Object.fromEntries(
        axisNames.map((axis) => [axis, seed.axisValues[axis] ?? ""]),
    );
}

/** True when every waivable bucket inside the value product is selected. */
function productSubsetOfSelected(
    values: Record<string, Set<string>>,
    allWaivable: SelectedBucket[],
    selectedStarts: Set<number>,
    axisNames: string[],
): boolean {
    for (const bucket of allWaivable) {
        const inProduct = axisNames.every((axis) =>
            values[axis].has(bucket.axisValues[axis] ?? ""),
        );
        if (inProduct && !selectedStarts.has(bucket.start)) {
            return false;
        }
    }
    return true;
}

/**
 * When the selection is exactly the cartesian product of its per-axis value
 * sets (dropping fully covered axes), emit one condensed rule.
 */
function tryAxisProductRule(
    selected: SelectedBucket[],
    allWaivable: SelectedBucket[],
    pointPath: string,
    selectedStarts: Set<number>,
    axisNames: string[],
): InferredWaiverRule | null {
    const filters: Record<string, string[]> = {};
    for (const axis of axisNames) {
        filters[axis] = uniqueSorted(selected.map((bucket) => bucket.axisValues[axis] ?? ""));
    }
    const axes = toWaiverAxes(filters, allWaivable, axisNames);
    const rule = buildRule(pointPath, axes, allWaivable, selectedStarts);
    if (
        rule.extraCount === 0
        && rule.selectedCovered === selected.length
    ) {
        return rule;
    }
    return null;
}

/**
 * Merge rules that only differ by additional values on shared axes into one
 * multi-value rule, when the merge stays inside the selection.
 */
function mergeCompatibleRules(
    rules: InferredWaiverRule[],
    allWaivable: SelectedBucket[],
    selectedStarts: Set<number>,
): InferredWaiverRule[] {
    const merged = [...rules];
    let changed = true;
    while (changed) {
        changed = false;
        outer: for (let i = 0; i < merged.length; i += 1) {
            for (let j = i + 1; j < merged.length; j += 1) {
                const a = merged[i];
                const b = merged[j];
                if (a.point !== b.point) {
                    continue;
                }
                const keysA = Object.keys(a.axes).sort();
                const keysB = Object.keys(b.axes).sort();
                if (keysA.length !== keysB.length || keysA.some((key, idx) => key !== keysB[idx])) {
                    continue;
                }
                const combined: Record<string, string[]> = {};
                for (const axis of keysA) {
                    const left = a.axes[axis];
                    const right = b.axes[axis];
                    const leftList = typeof left === "string" ? [left] : left;
                    const rightList = typeof right === "string" ? [right] : right;
                    combined[axis] = uniqueSorted([...leftList, ...rightList]);
                }
                const axes: WaiverAxes = {};
                for (const [axis, values] of Object.entries(combined)) {
                    axes[axis] = values.length === 1 ? values[0] : values;
                }
                const candidate = buildRule(a.point, axes, allWaivable, selectedStarts);
                if (candidate.extraCount === 0) {
                    merged.splice(j, 1);
                    merged.splice(i, 1, candidate);
                    changed = true;
                    break outer;
                }
            }
        }
    }
    return merged;
}

/**
 * Partition the selection into exact axis-product rectangles: grow each seed
 * by adding axis values only while the product stays inside the selection.
 */
function exactCoverPartitionRules(
    selectedWaivable: SelectedBucket[],
    allWaivable: SelectedBucket[],
    pointPath: string,
    selectedStarts: Set<number>,
    axisNames: string[],
): InferredWaiverRule[] {
    const remaining = new Set(selectedStarts);
    const selectedByStart = new Map(
        selectedWaivable.map((bucket) => [bucket.start, bucket]),
    );
    const rules: InferredWaiverRule[] = [];

    while (remaining.size > 0) {
        const seedStart = remaining.values().next().value as number;
        const seed = selectedByStart.get(seedStart);
        if (!seed) {
            remaining.delete(seedStart);
            continue;
        }

        const values: Record<string, Set<string>> = {};
        for (const axis of axisNames) {
            values[axis] = new Set([seed.axisValues[axis] ?? ""]);
        }

        let grown = true;
        while (grown) {
            grown = false;
            for (const axis of axisNames) {
                const candidates = new Set<string>();
                for (const bucket of selectedWaivable) {
                    const matchesOthers = axisNames.every((name) => {
                        if (name === axis) {
                            return true;
                        }
                        return values[name].has(bucket.axisValues[name] ?? "");
                    });
                    if (matchesOthers) {
                        candidates.add(bucket.axisValues[axis] ?? "");
                    }
                }
                for (const value of candidates) {
                    if (values[axis].has(value)) {
                        continue;
                    }
                    values[axis].add(value);
                    if (
                        productSubsetOfSelected(
                            values,
                            allWaivable,
                            selectedStarts,
                            axisNames,
                        )
                    ) {
                        grown = true;
                    } else {
                        values[axis].delete(value);
                    }
                }
            }
        }

        const filters = Object.fromEntries(
            axisNames.map((axis) => [axis, uniqueSorted(values[axis])]),
        );
        const axes = toWaiverAxes(filters, allWaivable, axisNames);
        let rule = buildRule(pointPath, axes, allWaivable, selectedStarts);
        if (rule.extraCount > 0 || !rule.coversStarts.includes(seedStart)) {
            rule = buildRule(
                pointPath,
                singletonAxes(seed, axisNames),
                allWaivable,
                selectedStarts,
            );
        }

        rules.push(rule);
        for (const start of rule.coversStarts) {
            remaining.delete(start);
        }
        // Guaranteed progress even if the rule somehow missed the seed.
        remaining.delete(seedStart);
    }

    return rules;
}

export function inferWaiverRules(
    selected: SelectedBucket[],
    pointPath: string,
    allWaivable: SelectedBucket[],
): InferredWaiverRule[] {
    const selectedWaivable = selected.filter((bucket) => bucket.target > 0);
    if (selectedWaivable.length === 0) {
        return [];
    }

    const axisNames = Object.keys(selectedWaivable[0].axisValues);
    const selectedStarts = new Set(selectedWaivable.map((bucket) => bucket.start));

    const rectangular = tryAxisProductRule(
        selectedWaivable,
        allWaivable,
        pointPath,
        selectedStarts,
        axisNames,
    );
    if (rectangular) {
        return [rectangular];
    }

    const partitioned = exactCoverPartitionRules(
        selectedWaivable,
        allWaivable,
        pointPath,
        selectedStarts,
        axisNames,
    );
    return mergeCompatibleRules(partitioned, allWaivable, selectedStarts);
}

export function inferredRulesToSpecs(
    rules: InferredWaiverRule[],
    reason: string,
    author: string = "",
): WaiverSpec[] {
    return rules.map((rule) => ({
        point: rule.point,
        axes: rule.axes,
        reason,
        author,
        disabled: false,
    }));
}

/**
 * Union axis patterns when two rules share the same axis key set.
 * Returns null when key sets differ (not safe to condense).
 */
export function unionWaiverAxes(a: WaiverAxes, b: WaiverAxes): WaiverAxes | null {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length || keysA.some((key, index) => key !== keysB[index])) {
        return null;
    }
    const out: WaiverAxes = {};
    for (const axis of keysA) {
        out[axis] = compactAxisPatterns([
            ...patternList(a[axis]),
            ...patternList(b[axis]),
        ]);
    }
    return out;
}

/**
 * Fold incoming rules into an existing draft. Rules condense into one multi-value
 * axis rule only when point, reason, author, and disabled match and axis keys align.
 * Different reasons never merge.
 */
export function mergeWaiverSpecs(
    existing: WaiverSpec[],
    incoming: WaiverSpec[],
): WaiverSpec[] {
    const result = [...existing];
    for (const rule of incoming) {
        let merged = false;
        for (let index = 0; index < result.length; index += 1) {
            const current = result[index];
            if (
                current.point !== rule.point
                || current.reason !== rule.reason
                || current.author !== rule.author
                || current.disabled !== rule.disabled
            ) {
                continue;
            }
            const axes = unionWaiverAxes(current.axes, rule.axes);
            if (!axes) {
                continue;
            }
            result[index] = { ...current, axes };
            merged = true;
            break;
        }
        if (!merged) {
            result.push(rule);
        }
    }
    return result;
}

/**
 * Axis-value rule builder: values on the same axis are OR'd (additive);
 * different axes are AND'd (constraining). Empty filters match nothing.
 */
export function bucketsMatchingAxisFilters(
    buckets: SelectedBucket[],
    filters: Record<string, string[]>,
): number[] {
    const constraints = Object.entries(filters).filter(([, values]) => values.length > 0);
    if (constraints.length === 0) {
        return [];
    }
    return buckets
        .filter((bucket) =>
            constraints.every(([axis, values]) =>
                values.includes(bucket.axisValues[axis] ?? ""),
            ),
        )
        .map((bucket) => bucket.start);
}

/** Toggle one axis value in a filter map (same-axis additive). */
export function toggleAxisFilterValue(
    filters: Record<string, string[]>,
    axis: string,
    value: string,
): Record<string, string[]> {
    const current = new Set(filters[axis] ?? []);
    if (current.has(value)) {
        current.delete(value);
    } else {
        current.add(value);
    }
    const next: Record<string, string[]> = { ...filters };
    if (current.size === 0) {
        delete next[axis];
    } else {
        next[axis] = [...current].sort(natCompareSafe);
    }
    return next;
}

/** Human-readable summary of axis filters for the create-waivers toolbar. */
export function formatAxisFilterSummary(filters: Record<string, string[]>): string {
    return Object.entries(filters)
        .filter(([, values]) => values.length > 0)
        .map(([axis, values]) =>
            values.length === 1 ? `${axis}=${values[0]}` : `${axis}∈{${values.join(", ")}}`,
        )
        .join(" ∧ ");
}
