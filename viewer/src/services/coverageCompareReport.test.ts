/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";
import { InMemoryReadout } from "@/services/readoutUtils";
import { buildComparison } from "@/services/coverageCompare";
import {
    buildCompareExportSummary,
    buildCompareReportJson,
    exportCompareReportAsync,
    serializeCompareReportHtml,
    serializeCompareReportHtmlFromReport,
    serializeCompareReportJson,
} from "@/services/coverageCompareReport";
import type { CompareRecordMeta } from "@/types/coverageCompare";

function createReadout(bucketHits: number[]): Readout {
    return new InMemoryReadout({
        defSha: "def-a",
        recSha: "rec-a",
        source: "suite",
        sourceKey: "test",
        bucketVersion: "",
        points: [
            {
                start: 0,
                depth: 0,
                end: 1,
                axis_start: 0,
                axis_end: 1,
                axis_value_start: 0,
                axis_value_end: 2,
                goal_start: 0,
                goal_end: 1,
                bucket_start: 0,
                bucket_end: 2,
                target: 6,
                target_buckets: 2,
                name: "Root",
                description: "Root",
            },
        ],
        bucketGoals: [
            { start: 0, goal: 0 },
            { start: 1, goal: 0 },
        ],
        axes: [
            {
                start: 0,
                value_start: 0,
                value_end: 2,
                name: "axis",
                description: "axis desc",
            },
        ],
        axisValues: [
            { start: 0, value: "A" },
            { start: 1, value: "B" },
        ],
        goals: [{ start: 0, target: 3, name: "goal0", description: "g0" }],
        pointHits: [
            {
                start: 0,
                depth: 0,
                hits: 3,
                hit_buckets: 1,
                full_buckets: 1,
            },
        ],
        bucketHits: [
            { start: 0, hits: bucketHits[0] },
            { start: 1, hits: bucketHits[1] },
        ],
    });
}

function meta(id: string, readout: Readout): CompareRecordMeta {
    return {
        id,
        label: id,
        source: readout.get_source(),
        sourceKey: readout.get_source_key(),
        defSha: readout.get_def_sha(),
        recSha: readout.get_rec_sha(),
    };
}

describe("coverageCompareReport", () => {
    test("json report includes global, points, and bucket sections", () => {
        const readoutA = createReadout([3, 0]);
        const readoutB = createReadout([0, 2]);
        const comparison = buildComparison(
            readoutA,
            readoutB,
            meta("A", readoutA),
            meta("B", readoutB),
            "any_hit",
        );

        const report = buildCompareReportJson(comparison);
        expect(report.global.valid).toBe(2);
        expect(report.points.length).toBeGreaterThan(0);
        expect(report.bucketsByCategory.a_only).toHaveLength(1);
        expect(report.bucketsByCategory.b_only).toHaveLength(1);
        expect(report.globalPercentages.both).toBe("0.0%");
        expect(report.patterns.length).toBeGreaterThan(0);
        expect(report.patternDetail).toBe("detailed");
        expect(report.sideFilter).toBe("both");
    });

    test("buildCompareExportSummary composes options into one sentence", () => {
        const summary = buildCompareExportSummary({
            format: "html",
            patternDetail: "fast",
            sideFilter: "a_only",
        });

        expect(summary).toContain("HTML report");
        expect(summary).toContain("largest asymmetric patterns");
        expect(summary).toContain("what A covers that B does not");
    });

    test("buildCompareExportSummary describes the chosen definition", () => {
        expect(
            buildCompareExportSummary({ format: "html", definition: "met_goal" }),
        ).toContain("meets its goal");
        expect(
            buildCompareExportSummary({ format: "html", definition: "any_hit" }),
        ).toContain("any hit");
    });

    test("report definition option reclassifies buckets", () => {
        const readoutA = createReadout([3, 0]);
        const readoutB = createReadout([0, 2]);
        const comparison = buildComparison(
            readoutA,
            readoutB,
            meta("A", readoutA),
            meta("B", readoutB),
            "any_hit",
        );

        const anyHit = buildCompareReportJson(comparison, { definition: "any_hit" });
        expect(anyHit.definition).toBe("any_hit");
        expect(anyHit.global.a_only).toBe(1);
        expect(anyHit.global.b_only).toBe(1);
        expect(anyHit.global.neither).toBe(0);

        const metGoal = buildCompareReportJson(comparison, { definition: "met_goal" });
        expect(metGoal.definition).toBe("met_goal");
        expect(metGoal.global.a_only).toBe(1);
        expect(metGoal.global.b_only).toBe(0);
        expect(metGoal.global.neither).toBe(1);
    });

    test("html report labels partial and unhit buckets", () => {
        const readoutA = createReadout([3, 0]);
        const readoutB = createReadout([0, 2]);
        const comparison = buildComparison(
            readoutA,
            readoutB,
            meta("A", readoutA),
            meta("B", readoutB),
            "any_hit",
        );

        const report = buildCompareReportJson(comparison, { definition: "any_hit" });
        const html = new TextDecoder().decode(serializeCompareReportHtmlFromReport(report));
        expect(html).toContain("status-hit");
        expect(html).toContain("status-partial");
        expect(html).toContain("status-unhit");
        expect(html).toContain("Any hit (hits");
    });

    test("serializers produce non-empty bytes", () => {
        const readoutA = createReadout([3, 0]);
        const readoutB = createReadout([0, 2]);
        const comparison = buildComparison(
            readoutA,
            readoutB,
            meta("A", readoutA),
            meta("B", readoutB),
            "any_hit",
        );

        const jsonBytes = serializeCompareReportJson(comparison);
        const htmlBytes = serializeCompareReportHtml(comparison);
        expect(jsonBytes.length).toBeGreaterThan(100);
        expect(htmlBytes.length).toBeGreaterThan(100);
        expect(new TextDecoder().decode(htmlBytes)).toContain("Coverage Compare Report");
        expect(new TextDecoder().decode(htmlBytes)).toContain("Pattern scope:");
        expect(new TextDecoder().decode(htmlBytes)).toContain("Coverage direction:");
        expect(new TextDecoder().decode(htmlBytes)).toContain("<th>Pattern</th>");
    });

    test("async export can be canceled during pattern detection", async () => {
        const readoutA = createReadout([3, 0]);
        const readoutB = createReadout([0, 2]);
        const comparison = buildComparison(
            readoutA,
            readoutB,
            meta("A", readoutA),
            meta("B", readoutB),
            "any_hit",
        );

        const controller = new AbortController();
        controller.abort();

        await expect(
            exportCompareReportAsync(comparison, "json", { signal: controller.signal }),
        ).rejects.toMatchObject({ name: "AbortError" });
    });
});
