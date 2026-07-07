/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import {
    formatCategoryPercent,
    getBucketHitStatus,
    recompareWithDefinition,
} from "@/services/coverageCompare";
import {
    findComparePatterns,
    findComparePatternsAsync,
    formatPatternSummary,
    getComparePatternSignalLabel,
    type ComparePattern,
    type ComparePatternDetailLevel,
    type ComparePatternSideFilter,
} from "@/services/coverageComparePatterns";
import type {
    BucketCategory,
    ComparisonResult,
    CoverageDefinition,
} from "@/types/coverageCompare";
import { saveCompareReportBytes } from "@/services/exportSaver";

export type CompareReportExportOptions = {
    patternDetail?: ComparePatternDetailLevel;
    sideFilter?: ComparePatternSideFilter;
    definition?: CoverageDefinition;
};

function definitionPhrase(definition: CoverageDefinition): string {
    return definition === "met_goal"
        ? "counting a bucket as covered only when it meets its goal"
        : "counting a bucket as covered on any hit";
}

export function buildCompareExportSummary(
    options: CompareReportExportOptions & {
        format: "json" | "html";
    },
): string {
    const patternDetail = options.patternDetail ?? "medium";
    const sideFilter = options.sideFilter ?? "both";
    const definition = options.definition ?? "any_hit";

    const formatPhrase =
        options.format === "html" ? "Save an HTML report" : "Save a JSON report";

    const scopePhrase =
        patternDetail === "fast"
            ? "including only the largest asymmetric patterns, stopping once smaller ones cannot rank higher"
            : patternDetail === "medium"
              ? "including a balanced set of asymmetric patterns across all coverpoints"
              : "including every detected asymmetric mismatch with no pattern cap";

    const sidePhrase =
        sideFilter === "a_only"
            ? "focusing on what A covers that B does not"
            : sideFilter === "b_only"
              ? "focusing on what B covers that A does not"
              : "covering gaps in both directions between A and B";

    return `${formatPhrase}, ${definitionPhrase(definition)}, ${scopePhrase}, ${sidePhrase}.`;
}

function definitionLabelText(definition: CoverageDefinition): string {
    return definition === "met_goal" ? "Met goal (hits ≥ target)" : "Any hit (hits > 0)";
}

function hitStatusLabel(hits: number, target: number): string {
    switch (getBucketHitStatus(hits, target)) {
        case "hit":
            return "hit";
        case "partial":
            return "partial";
        default:
            return "unhit";
    }
}

function patternDetailLabel(detail: ComparePatternDetailLevel): string {
    switch (detail) {
        case "fast":
            return "Largest only";
        case "medium":
            return "Balanced";
        default:
            return "All mismatches";
    }
}

function sideFilterLabel(sideFilter: ComparePatternSideFilter): string {
    switch (sideFilter) {
        case "a_only":
            return "A only";
        case "b_only":
            return "B only";
        default:
            return "Both directions";
    }
}

const HTML_BUCKET_LIST_LIMIT = 10_000;

export type CompareReportExportPhase = "buckets" | "patterns" | "serialize" | "save";

export type CompareReportExportProgress = {
    phase: CompareReportExportPhase;
    message: string;
};

function yieldToMain(): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw new DOMException("Report export canceled", "AbortError");
    }
}

type CompareReportJson = {
    generatedAt: string;
    patternDetail: ComparePatternDetailLevel;
    sideFilter: ComparePatternSideFilter;
    definition: ComparisonResult["definition"];
    recordA: ComparisonResult["recordA"];
    recordB: ComparisonResult["recordB"];
    global: ComparisonResult["global"];
    globalPercentages: Record<"a_only" | "both" | "b_only" | "neither", string>;
    points: Array<{
        path: string;
        name: string;
        isCovergroup: boolean;
        counts: ComparisonResult["global"];
        percentages: Record<"a_only" | "both" | "b_only" | "neither", string>;
    }>;
    bucketsByCategory: Record<
        Exclude<BucketCategory, "illegal" | "ignore">,
        ComparisonResult["bucketDetails"]
    >;
    patterns: ComparePattern[];
};

function buildGlobalPercentages(
    global: ComparisonResult["global"],
): Record<"a_only" | "both" | "b_only" | "neither", string> {
    return {
        a_only: formatCategoryPercent(global.a_only, global.valid),
        both: formatCategoryPercent(global.both, global.valid),
        b_only: formatCategoryPercent(global.b_only, global.valid),
        neither: formatCategoryPercent(global.neither, global.valid),
    };
}

function buildBucketsByCategory(
    comparison: ComparisonResult,
): CompareReportJson["bucketsByCategory"] {
    const bucketsByCategory: CompareReportJson["bucketsByCategory"] = {
        a_only: [],
        both: [],
        b_only: [],
        neither: [],
    };

    for (const detail of comparison.bucketDetails) {
        if (
            detail.category === "a_only"
            || detail.category === "both"
            || detail.category === "b_only"
            || detail.category === "neither"
        ) {
            bucketsByCategory[detail.category].push(detail);
        }
    }

    return bucketsByCategory;
}

export function buildCompareReportJson(
    comparison: ComparisonResult,
    options?: {
        patterns?: ComparePattern[];
        patternDetail?: ComparePatternDetailLevel;
        sideFilter?: ComparePatternSideFilter;
        definition?: CoverageDefinition;
    },
): CompareReportJson {
    const patternDetail = options?.patternDetail ?? "detailed";
    const sideFilter = options?.sideFilter ?? "both";
    const resolved =
        options?.definition && options.definition !== comparison.definition
            ? recompareWithDefinition(comparison, options.definition)
            : comparison;
    return {
        generatedAt: new Date().toISOString(),
        patternDetail,
        sideFilter,
        definition: resolved.definition,
        recordA: resolved.recordA,
        recordB: resolved.recordB,
        global: resolved.global,
        globalPercentages: buildGlobalPercentages(resolved.global),
        patterns:
            options?.patterns
            ?? findComparePatterns(resolved, { detailLevel: patternDetail, sideFilter }),
        points: resolved.points
            .filter((point) => point.counts.valid > 0 || !point.isCovergroup)
            .map((point) => ({
                path: point.path,
                name: point.name,
                isCovergroup: point.isCovergroup,
                counts: point.counts,
                percentages: {
                    a_only: formatCategoryPercent(point.counts.a_only, point.counts.valid),
                    both: formatCategoryPercent(point.counts.both, point.counts.valid),
                    b_only: formatCategoryPercent(point.counts.b_only, point.counts.valid),
                    neither: formatCategoryPercent(point.counts.neither, point.counts.valid),
                },
            })),
        bucketsByCategory: buildBucketsByCategory(resolved),
    };
}

export function serializeCompareReportJsonFromReport(report: CompareReportJson): Uint8Array {
    const text = JSON.stringify(report, null, 2);
    return new TextEncoder().encode(text);
}

export function serializeCompareReportJson(comparison: ComparisonResult): Uint8Array {
    return serializeCompareReportJsonFromReport(buildCompareReportJson(comparison));
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function formatAxisValues(axisValues: Record<string, string>): string {
    return Object.entries(axisValues)
        .map(([name, value]) => `${name}=${value}`)
        .join(", ");
}

function statusBadge(hits: number, target: number): string {
    const status = hitStatusLabel(hits, target);
    return `<span class="status status-${status}">${status}</span>`;
}

function renderBucketRows(
    buckets: ComparisonResult["bucketDetails"],
    limit: number,
): string {
    const slice = buckets.slice(0, limit);
    const rows = slice
        .map(
            (bucket) => `
        <tr>
            <td>${escapeHtml(bucket.pointPath)}</td>
            <td>${escapeHtml(formatAxisValues(bucket.axisValues))}</td>
            <td>${bucket.hitsA} ${statusBadge(bucket.hitsA, bucket.target)}</td>
            <td>${bucket.hitsB} ${statusBadge(bucket.hitsB, bucket.target)}</td>
            <td>${bucket.target}</td>
            <td>${escapeHtml(bucket.goalName)}</td>
        </tr>`,
        )
        .join("");
    const truncated =
        buckets.length > limit
            ? `<tr><td colspan="6"><em>Showing ${limit} of ${buckets.length} buckets. Export JSON for the full list.</em></td></tr>`
            : "";
    return rows + truncated;
}

export function serializeCompareReportHtmlFromReport(
    report: CompareReportJson,
    _comparison?: ComparisonResult,
): Uint8Array {
    const definitionLabel = escapeHtml(definitionLabelText(report.definition));

    const statCard = (label: string, count: number, pct: string, color: string) => `
        <div class="stat-card" style="border-top: 4px solid ${color}">
            <div class="stat-label">${escapeHtml(label)}</div>
            <div class="stat-value">${count}</div>
            <div class="stat-pct">${escapeHtml(pct)} of valid buckets</div>
        </div>`;

    const pointRows = report.points
        .filter((point) => !point.isCovergroup && point.counts.valid > 0)
        .slice(0, 100)
        .map(
            (point) => `
        <tr>
            <td>${escapeHtml(point.path)}</td>
            <td>${point.counts.a_only}</td>
            <td>${point.counts.both}</td>
            <td>${point.counts.b_only}</td>
            <td>${point.counts.neither}</td>
        </tr>`,
        )
        .join("");

    const patternRows = report.patterns
        .map(
            (pattern, index) => `
        <tr>
            <td>${index + 1}</td>
            <td><strong>${pattern.bucketCount}</strong></td>
            <td>${escapeHtml(getComparePatternSignalLabel(pattern))}</td>
            <td>${escapeHtml(pattern.pointName)}</td>
            <td>${escapeHtml(formatPatternSummary(pattern))}</td>
        </tr>`,
        )
        .join("");

    const patternScopeLabel = patternDetailLabel(report.patternDetail);
    const patternSideLabel = sideFilterLabel(report.sideFilter);

    const categorySection = (
        title: string,
        category: Exclude<BucketCategory, "illegal" | "ignore">,
        color: string,
    ) => {
        const buckets = report.bucketsByCategory[category];
        return `
        <section class="category-section">
            <h2 style="border-left: 4px solid ${color}; padding-left: 12px;">${escapeHtml(title)} (${buckets.length})</h2>
            <table>
                <thead>
                    <tr>
                        <th>Coverpoint</th>
                        <th>Axes</th>
                        <th>A (hits &amp; status)</th>
                        <th>B (hits &amp; status)</th>
                        <th>Target</th>
                        <th>Goal</th>
                    </tr>
                </thead>
                <tbody>
                    ${renderBucketRows(buckets, HTML_BUCKET_LIST_LIMIT)}
                </tbody>
            </table>
        </section>`;
    };

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>Coverage Compare Report</title>
    <style>
        body { font-family: system-ui, sans-serif; margin: 24px; color: #1a1a1a; background: #fafafa; }
        h1 { margin-bottom: 8px; }
        .meta { color: #555; margin-bottom: 24px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin: 24px 0; }
        .stat-card { background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
        .stat-label { font-size: 13px; color: #666; }
        .stat-value { font-size: 28px; font-weight: 700; margin: 4px 0; }
        .stat-pct { font-size: 12px; color: #888; }
        table { width: 100%; border-collapse: collapse; background: #fff; margin-bottom: 24px; }
        th, td { border: 1px solid #e5e5e5; padding: 8px 10px; text-align: left; font-size: 13px; }
        th { background: #f0f0f0; }
        section { margin-bottom: 32px; }
        .category-section { margin-top: 32px; }
        .patterns-table td:nth-child(2) { font-variant-numeric: tabular-nums; }
        .patterns-table td:last-child { line-height: 1.45; }
        .status { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 10px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
        .status-hit { background: #dcfce7; color: #166534; }
        .status-partial { background: #fef9c3; color: #854d0e; }
        .status-unhit { background: #fee2e2; color: #991b1b; }
    </style>
</head>
<body>
    <h1>Coverage Compare Report</h1>
    <div class="meta">
        <div>Generated: ${escapeHtml(report.generatedAt)}</div>
        <div>Definition mode: ${definitionLabel}</div>
        <div>Record A: ${escapeHtml(report.recordA.label)} (${escapeHtml(report.recordA.defSha.slice(0, 12))}…)</div>
        <div>Record B: ${escapeHtml(report.recordB.label)} (${escapeHtml(report.recordB.defSha.slice(0, 12))}…)</div>
        <div>Valid buckets compared: ${report.global.valid}</div>
        <div>Pattern scope: ${escapeHtml(patternScopeLabel)} (${report.patterns.length} patterns)</div>
        <div>Coverage direction: ${escapeHtml(patternSideLabel)}</div>
    </div>
    <p class="status-legend">Bucket status vs. its goal: <span class="status status-hit">hit</span> meets goal · <span class="status status-partial">partial</span> hit but below goal · <span class="status status-unhit">unhit</span> never hit.</p>
    <div class="stats">
        ${statCard("A only", report.global.a_only, report.globalPercentages.a_only, "#2563eb")}
        ${statCard("Both", report.global.both, report.globalPercentages.both, "#16a34a")}
        ${statCard("B only", report.global.b_only, report.globalPercentages.b_only, "#ea580c")}
        ${statCard("Neither", report.global.neither, report.globalPercentages.neither, "#6b7280")}
    </div>
    <section>
        <h2>Asymmetric coverage patterns</h2>
        <p class="pattern-intro">Ranked by how many buckets match.</p>
        ${
            report.patterns.length === 0
                ? "<p>No asymmetric A-vs-B patterns detected for this comparison.</p>"
                : `<table class="patterns-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Buckets</th>
                    <th>Side</th>
                    <th>Coverpoint</th>
                    <th>Pattern</th>
                </tr>
            </thead>
            <tbody>${patternRows}</tbody>
        </table>`
        }
    </section>
    <section>
        <h2>Coverpoints with differences</h2>
        <table>
            <thead>
                <tr>
                    <th>Path</th>
                    <th>A only</th>
                    <th>Both</th>
                    <th>B only</th>
                    <th>Neither</th>
                </tr>
            </thead>
            <tbody>${pointRows}</tbody>
        </table>
    </section>
    ${report.sideFilter !== "b_only" ? categorySection("A covers, B does not", "a_only", "#2563eb") : ""}
    ${report.sideFilter === "both" ? categorySection("Both cover", "both", "#16a34a") : ""}
    ${report.sideFilter !== "a_only" ? categorySection("B covers, A does not", "b_only", "#ea580c") : ""}
    ${report.sideFilter === "both" ? categorySection("Neither covers", "neither", "#6b7280") : ""}
</body>
</html>`;

    return new TextEncoder().encode(html);
}

export function serializeCompareReportHtml(comparison: ComparisonResult): Uint8Array {
    return serializeCompareReportHtmlFromReport(buildCompareReportJson(comparison), comparison);
}

export async function exportCompareReportAsync(
    comparison: ComparisonResult,
    format: "json" | "html",
    options?: {
        signal?: AbortSignal;
        onProgress?: (progress: CompareReportExportProgress) => void;
    } & CompareReportExportOptions,
): Promise<void> {
    const patternDetail = options?.patternDetail ?? "detailed";
    const sideFilter = options?.sideFilter ?? "both";
    const definition = options?.definition ?? comparison.definition;
    const emit = (progress: CompareReportExportProgress) => {
        options?.onProgress?.(progress);
    };

    emit({
        phase: "buckets",
        message: `Grouping ${comparison.bucketDetails.length.toLocaleString()} buckets…`,
    });
    throwIfAborted(options?.signal);
    await yieldToMain();

    const resolved =
        definition !== comparison.definition
            ? recompareWithDefinition(comparison, definition)
            : comparison;

    emit({
        phase: "patterns",
        message: "Starting pattern detection…",
    });
    await yieldToMain();
    const patterns = await findComparePatternsAsync(resolved, {
        signal: options?.signal,
        detailLevel: patternDetail,
        sideFilter,
        onProgress: (completed, total, message) => {
            emit({
                phase: "patterns",
                message,
            });
        },
    });

    throwIfAborted(options?.signal);
    emit({
        phase: "serialize",
        message: `Assembling report (${patterns.length.toLocaleString()} patterns)…`,
    });
    await yieldToMain();

    const report = buildCompareReportJson(resolved, {
        patterns,
        patternDetail,
        sideFilter,
        definition,
    });

    emit({
        phase: "serialize",
        message: format === "json" ? "Encoding JSON…" : "Rendering HTML…",
    });
    await yieldToMain();
    throwIfAborted(options?.signal);

    const bytes =
        format === "json"
            ? serializeCompareReportJsonFromReport(report)
            : serializeCompareReportHtmlFromReport(report, comparison);

    emit({
        phase: "save",
        message: "Saving file…",
    });
    await yieldToMain();
    throwIfAborted(options?.signal);

    await saveCompareReportBytes(bytes, format, getDefaultCompareReportFileName(format));

    emit({
        phase: "save",
        message: "Complete",
    });
}

export function getDefaultCompareReportFileName(format: "json" | "html"): string {
    const now = new Date();
    const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0"),
        String(now.getSeconds()).padStart(2, "0"),
    ].join("");
    return `bucket_compare_${stamp}.${format}`;
}
