/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

/**
 * Unhit / coverage-gap pattern detection for single-record reports.
 *
 * Reuses the compare pattern engine by mapping uncovered buckets to the
 * asymmetric "a_only" category (covered → "both"), then rewriting pattern
 * text so reports talk about gaps instead of A-vs-B.
 */

import { buildComparison } from "@/services/coverageCompare";
import {
    findComparePatterns,
    findComparePatternsAsync,
    formatPatternSummary,
    type ComparePattern,
    type ComparePatternDetailLevel,
} from "@/services/coverageComparePatterns";
import { InMemoryReadout, materializeReadout } from "@/services/readoutUtils";
import type {
    BucketCategory,
    CategoryCounts,
    CompareRecordMeta,
    ComparisonResult,
    CoverageDefinition,
} from "@/types/coverageCompare";

export type CoveragePatternDetailLevel = "off" | ComparePatternDetailLevel;

export type UnhitPattern = ComparePattern;

export type CoveragePatternSearchOptions = {
    detailLevel?: Exclude<CoveragePatternDetailLevel, "off">;
};

function withZeroHits(readout: Readout): Readout {
    const data = materializeReadout(readout);
    return new InMemoryReadout({
        ...data,
        bucketHits: data.bucketHits.map((bucketHit) => ({ ...bucketHit, hits: 0 })),
        pointHits: data.pointHits.map((pointHit) => ({
            ...pointHit,
            hits: 0,
            hit_buckets: 0,
            full_buckets: 0,
        })),
    });
}

/** Map compare-vs-empty categories onto gap categories used by pattern search. */
function remapGapCategory(category: BucketCategory): BucketCategory {
    // Covered vs empty → a_only; uncovered → neither. Flip for pattern search.
    if (category === "a_only") {
        return "both";
    }
    if (category === "neither") {
        return "a_only";
    }
    return category;
}

function remapGapCounts(counts: CategoryCounts): CategoryCounts {
    return {
        a_only: counts.neither,
        both: counts.a_only,
        b_only: 0,
        neither: 0,
        valid: counts.valid,
        illegal: counts.illegal,
        ignore: counts.ignore,
    };
}

/**
 * Build a comparison-shaped analysis of one record where:
 * - uncovered (gap) buckets are `a_only`
 * - covered buckets are `both`
 *
 * Illegal / ignore buckets keep their categories.
 */
export function buildCoverageGapComparison(
    readout: Readout,
    record: CompareRecordMeta,
    definition: CoverageDefinition,
): ComparisonResult {
    const emptyMeta: CompareRecordMeta = {
        id: `${record.id}__gap_baseline`,
        label: "uncovered",
        source: null,
        sourceKey: null,
        defSha: record.defSha,
        recSha: "",
    };
    const raw = buildComparison(readout, withZeroHits(readout), record, emptyMeta, definition);

    const bucketsByIndex = new Map<number, BucketCategory>();
    for (const [bucketIndex, category] of raw.bucketsByIndex) {
        bucketsByIndex.set(bucketIndex, remapGapCategory(category));
    }

    const points = raw.points.map((point) => ({
        ...point,
        counts: remapGapCounts(point.counts),
    }));

    return {
        recordA: record,
        recordB: emptyMeta,
        definition,
        global: remapGapCounts(raw.global),
        points,
        pointsByStart: new Map(points.map((point) => [point.pointStart, point])),
        bucketsByIndex,
        hitsAByIndex: raw.hitsAByIndex,
        hitsBByIndex: new Map(),
        bucketDetails: raw.bucketDetails.map((detail) => ({
            ...detail,
            category: remapGapCategory(detail.category),
            hitsB: 0,
        })),
        axisValueOrderByPoint: raw.axisValueOrderByPoint,
    };
}

function rewriteUnhitDescription(description: string): string {
    return description
        .replace(/: A hits, B does not \(/g, ": not covered (")
        .replace(/ — A hits, B does not \(/g, " — not covered (")
        .replace(/: B hits, A does not \(/g, ": not covered (")
        .replace(/ — B hits, A does not \(/g, " — not covered (");
}

export function toUnhitPattern(pattern: ComparePattern): UnhitPattern {
    return {
        ...pattern,
        description: rewriteUnhitDescription(pattern.description),
    };
}

export function getUnhitPatternSignalLabel(_pattern: UnhitPattern): string {
    return "Unhit";
}

export { formatPatternSummary };

export function findUnhitPatterns(
    gapComparison: ComparisonResult,
    detailLevel: Exclude<CoveragePatternDetailLevel, "off"> = "detailed",
): UnhitPattern[] {
    return findComparePatterns(gapComparison, {
        detailLevel,
        sideFilter: "a_only",
    }).map(toUnhitPattern);
}

export async function findUnhitPatternsAsync(
    gapComparison: ComparisonResult,
    options?: {
        signal?: AbortSignal;
        onProgress?: (completed: number, total: number, message: string) => void;
        detailLevel?: Exclude<CoveragePatternDetailLevel, "off">;
    },
): Promise<UnhitPattern[]> {
    const patterns = await findComparePatternsAsync(gapComparison, {
        signal: options?.signal,
        onProgress: options?.onProgress,
        detailLevel: options?.detailLevel ?? "detailed",
        sideFilter: "a_only",
    });
    return patterns.map(toUnhitPattern);
}

export function patternDetailLabel(detail: CoveragePatternDetailLevel): string {
    switch (detail) {
        case "off":
            return "No pattern analysis";
        case "fast":
            return "Largest only";
        case "medium":
            return "Balanced";
        default:
            return "All unhit";
    }
}
