/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import {
    buildReadableReportHtml,
    buildReportModel,
    type ReportGapAnalysis,
    type ReadableReportOptions,
} from "@/services/readableReport";
import {
    buildCoverageGapComparison,
    findUnhitPatternsAsync,
    formatPatternSummary,
    patternDetailLabel,
    type CoveragePatternDetailLevel,
} from "@/services/coverageUnhitPatterns";
import { saveCompareReportBytes, type CompareReportFormat } from "@/services/exportSaver";
import type { CompareRecordMeta, CoverageDefinition } from "@/types/coverageCompare";

export type CoverageReportExportOptions = {
    patternDetail?: CoveragePatternDetailLevel;
    definition?: CoverageDefinition;
    /** Scope filters forwarded to the readable report body. */
    reportOptions?: Omit<ReadableReportOptions, "gapAnalysis">;
};

export type CoverageReportExportPhase = "buckets" | "patterns" | "serialize" | "save";

export type CoverageReportExportProgress = {
    phase: CoverageReportExportPhase;
    message: string;
};

export type CoverageReportRecordInput = {
    readout: Readout;
    record: CompareRecordMeta;
    title?: string;
};

function definitionPhrase(definition: CoverageDefinition): string {
    return definition === "met_goal"
        ? "counting a bucket as covered only when it meets its goal"
        : "counting a bucket as covered on any hit";
}

function definitionLabelText(definition: CoverageDefinition): string {
    return definition === "met_goal" ? "Met goal (hits ≥ target)" : "Any hit (hits > 0)";
}

export function buildCoverageExportSummary(
    options: CoverageReportExportOptions & {
        format: CompareReportFormat;
    },
): string {
    const patternDetail = options.patternDetail ?? "medium";
    const definition = options.definition ?? "any_hit";

    const formatPhrase =
        options.format === "html" ? "Save an HTML report" : "Save a JSON report";

    if (patternDetail === "off") {
        return `${formatPhrase}, ${definitionPhrase(definition)}, without unhit pattern analysis.`;
    }

    const scopePhrase =
        patternDetail === "fast"
            ? "including only the largest unhit patterns, stopping once smaller ones cannot rank higher"
            : patternDetail === "medium"
              ? "including a balanced set of unhit patterns across all coverpoints"
              : "including every detected unhit pattern with no pattern cap";

    return `${formatPhrase}, ${definitionPhrase(definition)}, ${scopePhrase}.`;
}

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

function recordTitle(input: CoverageReportRecordInput): string {
    return input.title ?? input.record.label ?? "Coverage record";
}

async function buildGapAnalysis(
    inputs: CoverageReportRecordInput[],
    definition: CoverageDefinition,
    patternDetail: Exclude<CoveragePatternDetailLevel, "off">,
    options?: {
        signal?: AbortSignal;
        onProgress?: (progress: CoverageReportExportProgress) => void;
    },
): Promise<ReportGapAnalysis> {
    const records: ReportGapAnalysis["records"] = [];

    for (let idx = 0; idx < inputs.length; idx += 1) {
        const input = inputs[idx];
        const title = recordTitle(input);
        options?.onProgress?.({
            phase: "buckets",
            message:
                inputs.length > 1
                    ? `Preparing gaps for ${title} (${idx + 1} of ${inputs.length})…`
                    : `Preparing coverage gaps for ${title}…`,
        });
        throwIfAborted(options?.signal);
        await yieldToMain();

        const gapComparison = buildCoverageGapComparison(input.readout, input.record, definition);

        options?.onProgress?.({
            phase: "patterns",
            message:
                inputs.length > 1
                    ? `Detecting unhit patterns in ${title} (${idx + 1} of ${inputs.length})…`
                    : "Detecting unhit patterns…",
        });
        await yieldToMain();

        const patterns = await findUnhitPatternsAsync(gapComparison, {
            signal: options?.signal,
            detailLevel: patternDetail,
            onProgress: (_completed, _total, message) => {
                options?.onProgress?.({
                    phase: "patterns",
                    message,
                });
            },
        });

        records.push({
            title,
            unhitBuckets: gapComparison.global.a_only,
            coveredBuckets: gapComparison.global.both,
            patterns: patterns.map((pattern) => ({
                pointName: pattern.pointName,
                pointPath: pattern.pointPath,
                bucketCount: pattern.bucketCount,
                summary: formatPatternSummary(pattern),
                description: pattern.description,
            })),
        });
    }

    return {
        definitionLabel: definitionLabelText(definition),
        patternScopeLabel: patternDetailLabel(patternDetail),
        records,
    };
}

export async function exportCoverageReportAsync(
    inputs: CoverageReportRecordInput[],
    format: CompareReportFormat,
    options?: {
        signal?: AbortSignal;
        onProgress?: (progress: CoverageReportExportProgress) => void;
    } & CoverageReportExportOptions,
): Promise<void> {
    if (inputs.length === 0) {
        throw new Error("Select at least one record to generate a report.");
    }

    const patternDetail = options?.patternDetail ?? "medium";
    const definition = options?.definition ?? "any_hit";
    const emit = (progress: CoverageReportExportProgress) => {
        options?.onProgress?.(progress);
    };

    let gapAnalysis: ReportGapAnalysis | null = null;
    if (patternDetail !== "off") {
        gapAnalysis = await buildGapAnalysis(inputs, definition, patternDetail, {
            signal: options?.signal,
            onProgress: emit,
        });
    }

    throwIfAborted(options?.signal);
    emit({
        phase: "serialize",
        message:
            gapAnalysis === null
                ? "Assembling report…"
                : `Assembling report (${gapAnalysis.records
                      .reduce((sum, record) => sum + record.patterns.length, 0)
                      .toLocaleString()} patterns)…`,
    });
    await yieldToMain();

    const readouts = inputs.map((input) => input.readout);
    const reportOptions: ReadableReportOptions = {
        ...(options?.reportOptions ?? {}),
        gapAnalysis,
    };

    emit({
        phase: "serialize",
        message: format === "json" ? "Encoding JSON…" : "Rendering HTML…",
    });
    await yieldToMain();
    throwIfAborted(options?.signal);

    const bytes =
        format === "json"
            ? new TextEncoder().encode(
                  JSON.stringify(
                      {
                          generatedAt: new Date().toISOString(),
                          definition,
                          patternDetail,
                          model: buildReportModel(readouts, reportOptions),
                      },
                      null,
                      2,
                  ),
              )
            : new TextEncoder().encode(buildReadableReportHtml(readouts, reportOptions));

    emit({
        phase: "save",
        message: "Saving file…",
    });
    await yieldToMain();
    throwIfAborted(options?.signal);

    await saveCompareReportBytes(bytes, format, getDefaultCoverageReportFileName(format));

    emit({
        phase: "save",
        message: "Complete",
    });
}

export function getDefaultCoverageReportFileName(format: CompareReportFormat): string {
    const now = new Date();
    const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0"),
        String(now.getSeconds()).padStart(2, "0"),
    ].join("");
    return `bucket_coverage_report_${stamp}.${format}`;
}
