/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import type {
    BucketDetail,
    ComparisonResult,
    CoverageDefinition,
} from "@/types/coverageCompare";

export type ComparePatternCategory = "a_only" | "b_only";

export type ComparePatternKind = "exact" | "range";

/** One record covered, the other not — the only patterns we surface in reports. */
export type ComparePatternSignal = {
    type: "category";
    category: ComparePatternCategory;
};

export type ComparePattern = {
    kind: ComparePatternKind;
    signal: ComparePatternSignal;
    pointPath: string;
    pointName: string;
    conditions: Record<string, string>;
    rangeAxis?: string;
    rangeLabel?: string;
    bucketCount: number;
    description: string;
};

const ASYMMETRIC_CATEGORIES: ComparePatternCategory[] = ["a_only", "b_only"];

export type ComparePatternDetailLevel = "fast" | "medium" | "detailed";

/** Which asymmetric direction(s) to include in pattern search and reports. */
export type ComparePatternSideFilter = "both" | "a_only" | "b_only";

export type ComparePatternSearchOptions = {
    detailLevel?: ComparePatternDetailLevel;
    sideFilter?: ComparePatternSideFilter;
};

type PatternSearchConfig = {
    maxPatterns: number;
    maxCoverpoints: number | null;
    maxAxisCombo: number;
    earlyStop: boolean;
    minExactBuckets: number;
    categories: ComparePatternCategory[];
};

function categoriesForSideFilter(sideFilter: ComparePatternSideFilter): ComparePatternCategory[] {
    switch (sideFilter) {
        case "a_only":
            return ["a_only"];
        case "b_only":
            return ["b_only"];
        default:
            return ["a_only", "b_only"];
    }
}

function normalizePatternSearchOptions(
    detailOrOptions: ComparePatternDetailLevel | ComparePatternSearchOptions = "detailed",
): Required<ComparePatternSearchOptions> {
    const options = typeof detailOrOptions === "string" ? { detailLevel: detailOrOptions } : detailOrOptions;
    return {
        detailLevel: options.detailLevel ?? "detailed",
        sideFilter: options.sideFilter ?? "both",
    };
}

function getPatternSearchConfig(
    level: ComparePatternDetailLevel,
    sideFilter: ComparePatternSideFilter,
): PatternSearchConfig {
    const categories = categoriesForSideFilter(sideFilter);
    switch (level) {
        case "fast":
            return {
                maxPatterns: 25,
                maxCoverpoints: 30,
                maxAxisCombo: 2,
                earlyStop: true,
                minExactBuckets: 3,
                categories,
            };
        case "medium":
            return {
                maxPatterns: 120,
                maxCoverpoints: null,
                maxAxisCombo: 3,
                earlyStop: false,
                minExactBuckets: 2,
                categories,
            };
        default:
            return {
                maxPatterns: Number.POSITIVE_INFINITY,
                maxCoverpoints: null,
                maxAxisCombo: 3,
                earlyStop: false,
                minExactBuckets: 2,
                categories,
            };
    }
}

const MIN_RANGE_SPAN = 2;

function asymmetricBucketCount(
    buckets: BucketDetail[],
    categories: ComparePatternCategory[] = ASYMMETRIC_CATEGORIES,
): number {
    return buckets.filter((bucket) => categories.includes(bucket.category as ComparePatternCategory))
        .length;
}

/** Readable pattern slice for report tables (no bucket counts or record labels). */
export function formatPatternSummary(pattern: ComparePattern): string {
    const parts: string[] = [];
    const filters = formatConditions(pattern.conditions);
    if (filters) {
        parts.push(filters);
    }
    if (pattern.kind === "range" && pattern.rangeLabel) {
        parts.push(pattern.rangeLabel);
    }
    return parts.join(", ") || "All buckets";
}

class PatternCollector {
    private items: ComparePattern[] = [];

    constructor(private readonly maxPatterns: number) {}

    addMany(candidates: ComparePattern[]): void {
        const sorted = [...candidates].sort((a, b) => b.bucketCount - a.bucketCount);
        for (const candidate of sorted) {
            this.add(candidate);
        }
    }

    add(candidate: ComparePattern): void {
        if (!shouldKeepExactPattern(candidate)) {
            return;
        }
        if (this.items.some((existing) => isRedundantNarrowPattern(candidate, existing))) {
            return;
        }
        this.items = this.items.filter((existing) => !isRedundantNarrowPattern(existing, candidate));
        if (
            this.items.some(
                (existing) =>
                    existing.pointPath === candidate.pointPath
                    && signalKey(existing.signal) === signalKey(candidate.signal)
                    && existing.kind === candidate.kind
                    && conditionsMatch(existing.conditions, candidate.conditions)
                    && existing.rangeLabel === candidate.rangeLabel,
            )
        ) {
            return;
        }
        this.items.push(candidate);
        this.items = dedupePatterns(this.items).slice(0, this.maxPatterns);
    }

    get minBucketCount(): number {
        if (!Number.isFinite(this.maxPatterns) || this.items.length < this.maxPatterns) {
            return 0;
        }
        return Math.min(...this.items.map((pattern) => pattern.bucketCount));
    }

    isFull(): boolean {
        return Number.isFinite(this.maxPatterns) && this.items.length >= this.maxPatterns;
    }

    toArray(): ComparePattern[] {
        return [...this.items].sort((a, b) => b.bucketCount - a.bucketCount);
    }
}

function pointNameFromPath(pointPath: string): string {
    const parts = pointPath.split(" / ");
    return parts[parts.length - 1] ?? pointPath;
}

function formatAxisAssignment(axis: string, value: string): string {
    return `${axis}=${value}`;
}

function formatAxisValueList(axis: string, values: string[]): string {
    if (values.length === 0) {
        return "";
    }
    if (values.length === 1) {
        return formatAxisAssignment(axis, values[0]);
    }
    return `${axis}=[${values.join(", ")}]`;
}

function formatConditions(conditions: Record<string, string>): string {
    return Object.entries(conditions)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([axis, value]) => formatAxisAssignment(axis, value))
        .join(", ");
}

function sortedBucketIndices(buckets: BucketDetail[]): number[] {
    return buckets.map((bucket) => bucket.bucketIndex).sort((left, right) => left - right);
}

function bucketIndicesMatch(left: number[], right: number[]): boolean {
    if (left.length !== right.length) {
        return false;
    }
    return left.every((index, idx) => index === right[idx]);
}

/** True when no axis condition can be removed while still describing the same bucket set. */
function isMinimallyStatedExact(
    allBuckets: BucketDetail[],
    conditions: Record<string, string>,
    matching: BucketDetail[],
    category: ComparePatternCategory,
): boolean {
    const targetIndices = sortedBucketIndices(matching);
    for (const axis of Object.keys(conditions)) {
        const reduced = { ...conditions };
        delete reduced[axis];
        const reducedMatching = allBuckets.filter((bucket) => bucketMatchesConditions(bucket, reduced));
        if (
            reducedMatching.length === matching.length
            && reducedMatching.every((bucket) => bucket.category === category)
            && bucketIndicesMatch(sortedBucketIndices(reducedMatching), targetIndices)
        ) {
            return false;
        }
    }
    return true;
}

function isMinimallyStatedRange(
    allBuckets: BucketDetail[],
    fixedConditions: Record<string, string>,
    rangeAxis: string,
    rangeBuckets: BucketDetail[],
    category: ComparePatternCategory,
    axisOrder: Record<string, string[]>,
): boolean {
    const targetIndices = sortedBucketIndices(rangeBuckets);
    const orderedValues = axisOrder[rangeAxis];
    if (!orderedValues) {
        return true;
    }

    for (const axis of Object.keys(fixedConditions)) {
        const reduced = { ...fixedConditions };
        delete reduced[axis];
        const scoped = allBuckets.filter((bucket) => bucketMatchesConditions(bucket, reduced));
        const groups = groupByRangeAxis(scoped, rangeAxis, orderedValues);
        const predicate = (groupBuckets: BucketDetail[]) =>
            groupBuckets.length > 0
            && groupBuckets.every((bucket) => bucket.category === category);

        for (const range of findContiguousRanges(groups, predicate)) {
            if (bucketIndicesMatch(sortedBucketIndices(range.buckets), targetIndices)) {
                return false;
            }
        }
    }
    return true;
}

function parseAxisNumeric(value: string): number | null {
    const trimmed = value.trim();
    if (trimmed.endsWith("+")) {
        const base = Number(trimmed.slice(0, -1));
        return Number.isFinite(base) ? base : null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatRangeOnAxis(
    orderedValues: string[],
    startIdx: number,
    endIdx: number,
    rangeAxis: string,
): string {
    const slice = orderedValues.slice(startIdx, endIdx + 1);
    const numerics = orderedValues.map(parseAxisNumeric);
    const allNumeric = numerics.every((entry) => entry !== null);

    if (allNumeric) {
        if (startIdx === 0 && endIdx < orderedValues.length - 1) {
            const next = numerics[endIdx + 1];
            if (next !== null) {
                return `never younger than ${next}`;
            }
        }
        if (endIdx === orderedValues.length - 1 && startIdx > 0) {
            const startNum = numerics[startIdx];
            if (startNum !== null && startNum > 0) {
                return `never older than ${startNum - 1}`;
            }
        }
        if (startIdx === endIdx) {
            return formatAxisAssignment(rangeAxis, orderedValues[startIdx]);
        }
        return `${rangeAxis}=${orderedValues[startIdx]}–${orderedValues[endIdx]}`;
    }

    return formatAxisValueList(rangeAxis, slice);
}

function describeExactPattern(
    category: ComparePatternCategory,
    pointName: string,
    conditions: Record<string, string>,
    bucketCount: number,
    _recordALabel: string,
    _recordBLabel: string,
): string {
    const subject = formatConditions(conditions);
    const bucketPhrase = bucketCount === 1 ? "1 bucket" : `${bucketCount} buckets`;
    const where = subject === "" ? `At ${pointName}` : `Where ${subject} at ${pointName}`;
    if (category === "a_only") {
        return `${where}: A hits, B does not (${bucketPhrase})`;
    }
    return `${where}: B hits, A does not (${bucketPhrase})`;
}

function describeRangePattern(
    category: ComparePatternCategory,
    pointName: string,
    conditions: Record<string, string>,
    rangeLabel: string,
    bucketCount: number,
    _recordALabel: string,
    _recordBLabel: string,
): string {
    const subject = formatConditions(conditions);
    const bucketPhrase = bucketCount === 1 ? "1 bucket" : `${bucketCount} buckets`;
    const where =
        subject === ""
            ? `At ${pointName}`
            : `Where ${subject} at ${pointName}`;

    if (category === "a_only") {
        return `${where}: ${rangeLabel} — A hits, B does not (${bucketPhrase})`;
    }
    return `${where}: ${rangeLabel} — B hits, A does not (${bucketPhrase})`;
}

function bucketMatchesConditions(
    bucket: BucketDetail,
    conditions: Record<string, string>,
): boolean {
    for (const [axisName, axisValue] of Object.entries(conditions)) {
        if (bucket.axisValues[axisName] !== axisValue) {
            return false;
        }
    }
    return true;
}

function conditionsMatch(a: Record<string, string>, b: Record<string, string>): boolean {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) {
        return false;
    }
    return aKeys.every((key) => a[key] === b[key]);
}

function signalKey(signal: ComparePatternSignal): string {
    return `category:${signal.category}`;
}

function conditionsAreSubsetOf(
    subset: Record<string, string>,
    superset: Record<string, string>,
): boolean {
    return Object.entries(subset).every(([key, value]) => superset[key] === value);
}

function patternSpecificity(pattern: ComparePattern): number {
    return Object.keys(pattern.conditions).length + (pattern.rangeAxis ? 1 : 0);
}

function patternsShareRangeShape(a: ComparePattern, b: ComparePattern): boolean {
    if (a.kind !== "range" || b.kind !== "range") {
        return a.kind === b.kind;
    }
    return a.rangeAxis === b.rangeAxis && a.rangeLabel === b.rangeLabel;
}

/**
 * A narrower pattern is redundant when a broader one at the same point already
 * explains the same (or a larger) bucket set. Broad single-axis patterns must not
 * be dropped in favour of multi-axis crosses; crosses are only kept when they
 * narrow a slice that the single-axis pattern cannot explain alone.
 */
function isRedundantNarrowPattern(narrow: ComparePattern, broad: ComparePattern): boolean {
    if (narrow.pointPath !== broad.pointPath || signalKey(narrow.signal) !== signalKey(broad.signal)) {
        return false;
    }
    if (!conditionsAreSubsetOf(broad.conditions, narrow.conditions)) {
        return false;
    }
    if (!patternsShareRangeShape(narrow, broad)) {
        return false;
    }
    if (patternSpecificity(narrow) <= patternSpecificity(broad)) {
        return false;
    }
    return broad.bucketCount >= narrow.bucketCount;
}

function enumerateFixedConditionCombos(
    fixedAxisNames: string[],
    buckets: BucketDetail[],
    maxAxisCombo: number,
): Record<string, string>[] {
    const combos: Record<string, string>[] = [{}];
    if (fixedAxisNames.length === 0 || maxAxisCombo <= 0) {
        return combos;
    }

    const seen = new Set<string>([JSON.stringify({})]);
    const addCombo = (conditions: Record<string, string>) => {
        const key = JSON.stringify(conditions);
        if (!seen.has(key)) {
            seen.add(key);
            combos.push(conditions);
        }
    };

    for (const conditions of enumerateConditionCombos(fixedAxisNames, buckets, 1)) {
        addCombo(conditions);
    }
    if (maxAxisCombo >= 2) {
        for (let comboSize = 2; comboSize <= Math.min(maxAxisCombo, fixedAxisNames.length); comboSize += 1) {
            for (const conditions of enumerateConditionCombos(fixedAxisNames, buckets, comboSize)) {
                addCombo(conditions);
            }
        }
    }

    return combos;
}

function enumerateConditionCombos(
    axisNames: string[],
    buckets: BucketDetail[],
    comboSize: number,
): Record<string, string>[] {
    if (comboSize <= 0 || axisNames.length === 0) {
        return [{}];
    }

    const combos: Record<string, string>[] = [];
    const seen = new Set<string>();

    if (comboSize === 1) {
        for (const axisName of axisNames) {
            const values = new Set<string>();
            for (const bucket of buckets) {
                const value = bucket.axisValues[axisName];
                if (value !== undefined) {
                    values.add(value);
                }
            }
            for (const value of values) {
                const conditions = { [axisName]: value };
                const key = JSON.stringify(conditions);
                if (!seen.has(key)) {
                    seen.add(key);
                    combos.push(conditions);
                }
            }
        }
        return combos;
    }

    for (let start = 0; start <= axisNames.length - comboSize; start += 1) {
        const axisSubset = axisNames.slice(start, start + comboSize);
        const valueLists = axisSubset.map((axisName) => {
            const values = new Set<string>();
            for (const bucket of buckets) {
                const value = bucket.axisValues[axisName];
                if (value !== undefined) {
                    values.add(value);
                }
            }
            return Array.from(values);
        });

        const walk = (axisIdx: number, current: Record<string, string>) => {
            if (axisIdx >= axisSubset.length) {
                const key = JSON.stringify(current);
                if (!seen.has(key)) {
                    seen.add(key);
                    combos.push({ ...current });
                }
                return;
            }
            for (const value of valueLists[axisIdx]) {
                current[axisSubset[axisIdx]] = value;
                walk(axisIdx + 1, current);
            }
        };
        walk(0, {});
    }

    return combos;
}

type ValueBucketGroup = {
    value: string;
    valueIndex: number;
    buckets: BucketDetail[];
};

function groupByRangeAxis(
    buckets: BucketDetail[],
    rangeAxis: string,
    orderedValues: string[],
): ValueBucketGroup[] {
    return orderedValues.map((value, valueIndex) => ({
        value,
        valueIndex,
        buckets: buckets.filter((bucket) => bucket.axisValues[rangeAxis] === value),
    }));
}

type ContiguousRange = {
    startIdx: number;
    endIdx: number;
    buckets: BucketDetail[];
};

function findContiguousRanges(
    groups: ValueBucketGroup[],
    predicate: (groupBuckets: BucketDetail[]) => boolean,
): ContiguousRange[] {
    const ranges: ContiguousRange[] = [];
    let rangeStart: number | null = null;
    let accumulated: BucketDetail[] = [];

    const flush = (endIdx: number) => {
        if (rangeStart === null) {
            return;
        }
        ranges.push({
            startIdx: rangeStart,
            endIdx,
            buckets: accumulated,
        });
        rangeStart = null;
        accumulated = [];
    };

    for (const group of groups) {
        if (group.buckets.length === 0) {
            flush(group.valueIndex - 1);
            continue;
        }
        if (predicate(group.buckets)) {
            if (rangeStart === null) {
                rangeStart = group.valueIndex;
            }
            accumulated.push(...group.buckets);
        } else {
            flush(group.valueIndex - 1);
        }
    }
    if (rangeStart !== null) {
        flush(groups[groups.length - 1]?.valueIndex ?? rangeStart);
    }

    return ranges;
}

function shouldEmitRange(startIdx: number, endIdx: number, orderedLength: number): boolean {
    const span = endIdx - startIdx + 1;
    if (span >= MIN_RANGE_SPAN) {
        return true;
    }
    return startIdx === 0 || endIdx === orderedLength - 1;
}

/** Drop isolated single-bucket observations on one axis — usually noise. */
function shouldKeepExactPattern(pattern: ComparePattern): boolean {
    if (pattern.kind !== "exact") {
        return true;
    }
    const axisCount = Object.keys(pattern.conditions).length;
    if (axisCount >= 2) {
        return true;
    }
    return pattern.bucketCount >= 2;
}

function findExactPatternsForPoint(
    pointPath: string,
    buckets: BucketDetail[],
    recordALabel: string,
    recordBLabel: string,
    search: PatternSearchConfig,
): ComparePattern[] {
    if (buckets.length === 0) {
        return [];
    }

    const pointName = pointNameFromPath(pointPath);
    const axisNames = Array.from(
        buckets.reduce((names, bucket) => {
            for (const name of Object.keys(bucket.axisValues)) {
                names.add(name);
            }
            return names;
        }, new Set<string>()),
    ).sort();

    const patterns: ComparePattern[] = [];
    const maxCombo = Math.min(search.maxAxisCombo, axisNames.length);

    for (const category of search.categories) {
        const categoryBuckets = buckets.filter((bucket) => bucket.category === category);
        if (categoryBuckets.length === 0) {
            continue;
        }

        for (let comboSize = 1; comboSize <= maxCombo; comboSize += 1) {
            for (const conditions of enumerateConditionCombos(axisNames, categoryBuckets, comboSize)) {
                const matching = buckets.filter((bucket) => bucketMatchesConditions(bucket, conditions));
                if (matching.length === 0 || !matching.every((bucket) => bucket.category === category)) {
                    continue;
                }
                if (
                    comboSize === 1
                    && Object.keys(conditions).length === 1
                    && matching.length < search.minExactBuckets
                ) {
                    continue;
                }
                if (!isMinimallyStatedExact(buckets, conditions, matching, category)) {
                    continue;
                }

                patterns.push({
                    kind: "exact",
                    signal: { type: "category", category },
                    pointPath,
                    pointName,
                    conditions,
                    bucketCount: matching.length,
                    description: describeExactPattern(
                        category,
                        pointName,
                        conditions,
                        matching.length,
                        recordALabel,
                        recordBLabel,
                    ),
                });
            }
        }
    }

    return patterns.sort((a, b) => b.bucketCount - a.bucketCount);
}

function findRangePatternsForPoint(
    pointPath: string,
    buckets: BucketDetail[],
    axisOrder: Record<string, string[]>,
    recordALabel: string,
    recordBLabel: string,
    categories: ComparePatternCategory[],
    maxAxisCombo: number,
): ComparePattern[] {
    if (buckets.length === 0) {
        return [];
    }

    const pointName = pointNameFromPath(pointPath);
    const axisNames = Object.keys(axisOrder).sort();
    if (axisNames.length === 0) {
        return [];
    }

    const patterns: ComparePattern[] = [];

    for (const rangeAxis of axisNames) {
        const orderedValues = axisOrder[rangeAxis];
        if (!orderedValues || orderedValues.length === 0) {
            continue;
        }

        const fixedAxisNames = axisNames.filter((name) => name !== rangeAxis);
        const fixedCombos = enumerateFixedConditionCombos(fixedAxisNames, buckets, maxAxisCombo);

        for (const fixedConditions of fixedCombos) {
            const scoped = buckets.filter((bucket) => bucketMatchesConditions(bucket, fixedConditions));
            if (scoped.length === 0) {
                continue;
            }

            const groups = groupByRangeAxis(scoped, rangeAxis, orderedValues);

            for (const category of categories) {
                const predicate = (groupBuckets: BucketDetail[]) =>
                    groupBuckets.length > 0
                    && groupBuckets.every((bucket) => bucket.category === category);

                for (const range of findContiguousRanges(groups, predicate).sort(
                    (a, b) => b.buckets.length - a.buckets.length,
                )) {
                    if (!shouldEmitRange(range.startIdx, range.endIdx, orderedValues.length)) {
                        continue;
                    }
                    if (
                        !isMinimallyStatedRange(
                            buckets,
                            fixedConditions,
                            rangeAxis,
                            range.buckets,
                            category,
                            axisOrder,
                        )
                    ) {
                        continue;
                    }
                    const rangeLabel = formatRangeOnAxis(
                        orderedValues,
                        range.startIdx,
                        range.endIdx,
                        rangeAxis,
                    );
                    patterns.push({
                        kind: "range",
                        signal: { type: "category", category },
                        pointPath,
                        pointName,
                        conditions: fixedConditions,
                        rangeAxis,
                        rangeLabel,
                        bucketCount: range.buckets.length,
                        description: describeRangePattern(
                            category,
                            pointName,
                            fixedConditions,
                            rangeLabel,
                            range.buckets.length,
                            recordALabel,
                            recordBLabel,
                        ),
                    });
                }
            }
        }
    }

    return patterns.sort((a, b) => b.bucketCount - a.bucketCount);
}

function dedupePatterns(patterns: ComparePattern[]): ComparePattern[] {
    const sorted = [...patterns].sort((a, b) => {
        const bucketDiff = b.bucketCount - a.bucketCount;
        if (bucketDiff !== 0) {
            return bucketDiff;
        }
        const kindDiff = (b.kind === "range" ? 1 : 0) - (a.kind === "range" ? 1 : 0);
        if (kindDiff !== 0) {
            return kindDiff;
        }
        const condDiff =
            Object.keys(a.conditions).length
            + (a.rangeAxis ? 1 : 0)
            - Object.keys(b.conditions).length
            - (b.rangeAxis ? 1 : 0);
        return condDiff;
    });

    const kept: ComparePattern[] = [];
    for (const candidate of sorted) {
        if (!shouldKeepExactPattern(candidate)) {
            continue;
        }
        if (kept.some((existing) => isRedundantNarrowPattern(candidate, existing))) {
            continue;
        }
        for (let idx = kept.length - 1; idx >= 0; idx -= 1) {
            if (isRedundantNarrowPattern(kept[idx], candidate)) {
                kept.splice(idx, 1);
            }
        }
        if (
            kept.some(
                (existing) =>
                    existing.pointPath === candidate.pointPath
                    && signalKey(existing.signal) === signalKey(candidate.signal)
                    && existing.kind === candidate.kind
                    && conditionsMatch(existing.conditions, candidate.conditions)
                    && existing.rangeLabel === candidate.rangeLabel,
            )
        ) {
            continue;
        }
        kept.push(candidate);
    }

    return kept.sort((a, b) => b.bucketCount - a.bucketCount);
}

function orderCoverpointsForSearch(
    entries: Array<[string, { pointStart: number; buckets: BucketDetail[] }]>,
    categories: ComparePatternCategory[],
): Array<[string, { pointStart: number; buckets: BucketDetail[] }]> {
    return [...entries].sort(
        (a, b) => asymmetricBucketCount(b[1].buckets, categories) - asymmetricBucketCount(a[1].buckets, categories),
    );
}

async function findComparePatternsWithConfig(
    comparison: ComparisonResult,
    search: PatternSearchConfig,
    options?: {
        signal?: AbortSignal;
        onProgress?: (completed: number, total: number, message: string) => void;
    },
): Promise<ComparePattern[]> {
    const byPoint = new Map<string, { pointStart: number; buckets: BucketDetail[] }>();
    for (const detail of comparison.bucketDetails) {
        const group = byPoint.get(detail.pointPath) ?? {
            pointStart: detail.pointStart,
            buckets: [],
        };
        group.buckets.push(detail);
        byPoint.set(detail.pointPath, group);
    }

    const recordALabel = comparison.recordA.label || "A";
    const recordBLabel = comparison.recordB.label || "B";
    let entries = orderCoverpointsForSearch(Array.from(byPoint.entries()), search.categories);
    if (search.maxCoverpoints !== null) {
        entries = entries.slice(0, search.maxCoverpoints);
    }

    const total = entries.length;
    const collector = new PatternCollector(search.maxPatterns);

    for (let idx = 0; idx < entries.length; idx += 1) {
        if (options?.signal?.aborted) {
            throw new DOMException("Pattern detection canceled", "AbortError");
        }

        const [pointPath, { pointStart, buckets }] = entries[idx];
        const pointName = pointNameFromPath(pointPath);
        const progressMessage =
            total > 1
                ? `Analyzing ${pointName} (${idx + 1} of ${total})…`
                : `Analyzing ${pointName} (${buckets.length.toLocaleString()} buckets)…`;
        options?.onProgress?.(idx + 1, total, progressMessage);
        await yieldToMain();

        const axisOrder = comparison.axisValueOrderByPoint.get(pointStart) ?? {};
        const rangePatterns = findRangePatternsForPoint(
            pointPath,
            buckets,
            axisOrder,
            recordALabel,
            recordBLabel,
            search.categories,
            search.maxAxisCombo,
        );
        await yieldToMain();
        options?.onProgress?.(
            idx + 1,
            total,
            total > 1
                ? `Finding axis slices in ${pointName} (${idx + 1} of ${total})…`
                : `Finding axis slices in ${pointName}…`,
        );
        const exactPatterns = findExactPatternsForPoint(
            pointPath,
            buckets,
            recordALabel,
            recordBLabel,
            search,
        );

        if (search.earlyStop) {
            collector.addMany(rangePatterns);
            for (const pattern of exactPatterns) {
                if (collector.isFull() && pattern.bucketCount < collector.minBucketCount) {
                    break;
                }
                collector.add(pattern);
            }
        } else {
            collector.addMany([...rangePatterns, ...exactPatterns]);
        }

        if (search.earlyStop && collector.isFull()) {
            const maxRemaining = entries
                .slice(idx + 1)
                .reduce(
                    (max, [, group]) => Math.max(max, asymmetricBucketCount(group.buckets, search.categories)),
                    0,
                );
            if (maxRemaining < collector.minBucketCount) {
                break;
            }
        }

        if (options) {
            await yieldToMain();
        }
    }

    return collector.toArray();
}

export function findComparePatterns(
    comparison: ComparisonResult,
    detailOrOptions: ComparePatternDetailLevel | ComparePatternSearchOptions = "detailed",
): ComparePattern[] {
    const { detailLevel, sideFilter } = normalizePatternSearchOptions(detailOrOptions);
    const search = getPatternSearchConfig(detailLevel, sideFilter);
    const byPoint = new Map<string, { pointStart: number; buckets: BucketDetail[] }>();
    for (const detail of comparison.bucketDetails) {
        const group = byPoint.get(detail.pointPath) ?? {
            pointStart: detail.pointStart,
            buckets: [],
        };
        group.buckets.push(detail);
        byPoint.set(detail.pointPath, group);
    }

    const recordALabel = comparison.recordA.label || "A";
    const recordBLabel = comparison.recordB.label || "B";
    let entries = orderCoverpointsForSearch(Array.from(byPoint.entries()), search.categories);
    if (search.maxCoverpoints !== null) {
        entries = entries.slice(0, search.maxCoverpoints);
    }

    const collector = new PatternCollector(search.maxPatterns);
    for (const [pointPath, { pointStart, buckets }] of entries) {
        const axisOrder = comparison.axisValueOrderByPoint.get(pointStart) ?? {};
        const rangePatterns = findRangePatternsForPoint(
            pointPath,
            buckets,
            axisOrder,
            recordALabel,
            recordBLabel,
            search.categories,
            search.maxAxisCombo,
        );
        const exactPatterns = findExactPatternsForPoint(
            pointPath,
            buckets,
            recordALabel,
            recordBLabel,
            search,
        );
        if (search.earlyStop) {
            collector.addMany(rangePatterns);
            for (const pattern of exactPatterns) {
                if (collector.isFull() && pattern.bucketCount < collector.minBucketCount) {
                    break;
                }
                collector.add(pattern);
            }
        } else {
            collector.addMany([...rangePatterns, ...exactPatterns]);
        }
    }

    return collector.toArray();
}

function yieldToMain(): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

export async function findComparePatternsAsync(
    comparison: ComparisonResult,
    options?: {
        signal?: AbortSignal;
        onProgress?: (completed: number, total: number, message: string) => void;
        detailLevel?: ComparePatternDetailLevel;
        sideFilter?: ComparePatternSideFilter;
    },
): Promise<ComparePattern[]> {
    const normalized = normalizePatternSearchOptions({
        detailLevel: options?.detailLevel,
        sideFilter: options?.sideFilter,
    });
    const search = getPatternSearchConfig(normalized.detailLevel, normalized.sideFilter);
    return findComparePatternsWithConfig(comparison, search, options);
}

export function getComparePatternSignalLabel(pattern: ComparePattern): string {
    return pattern.signal.category === "a_only" ? "A only" : "B only";
}
