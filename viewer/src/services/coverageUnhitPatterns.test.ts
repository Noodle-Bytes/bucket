/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";
import {
    buildCoverageGapComparison,
    findUnhitPatterns,
} from "@/services/coverageUnhitPatterns";
import { buildCoverageExportSummary } from "@/services/coverageReportExport";
import { buildReadableReportHtml } from "@/services/readableReport";
import { InMemoryReadout } from "@/services/readoutUtils";
import type { CompareRecordMeta } from "@/types/coverageCompare";

function createTwoAxisReadout(bucketHits: number[][]): Readout {
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
                axis_end: 2,
                axis_value_start: 0,
                axis_value_end: 4,
                goal_start: 0,
                goal_end: 1,
                bucket_start: 0,
                bucket_end: 4,
                target: 40,
                target_buckets: 4,
                name: "chew_toys_by_age",
                description: "Chew toys",
            },
        ],
        bucketGoals: [
            { start: 0, goal: 0 },
            { start: 1, goal: 0 },
            { start: 2, goal: 0 },
            { start: 3, goal: 0 },
        ],
        axes: [
            {
                start: 0,
                value_start: 0,
                value_end: 2,
                name: "name",
                description: "Pet name",
            },
            {
                start: 1,
                value_start: 2,
                value_end: 4,
                name: "favourite_toy",
                description: "Toy",
            },
        ],
        axisValues: [
            { start: 0, value: "Clive" },
            { start: 1, value: "Barbara" },
            { start: 2, value: "Slipper" },
            { start: 3, value: "Ball" },
        ],
        goals: [{ start: 0, target: 10, name: "DEFAULT", description: "Default" }],
        pointHits: [
            {
                start: 0,
                depth: 0,
                hits: bucketHits.flat().reduce((sum, hits) => sum + Math.min(hits, 10), 0),
                hit_buckets: bucketHits.flat().filter((hits) => hits > 0).length,
                full_buckets: bucketHits.flat().filter((hits) => hits >= 10).length,
            },
        ],
        bucketHits: bucketHits.flatMap((row, rowIdx) =>
            row.map((hits, colIdx) => ({
                start: rowIdx * row.length + colIdx,
                hits,
            })),
        ),
    });
}

function meta(readout: Readout): CompareRecordMeta {
    return {
        id: "rec",
        label: "Record",
        source: readout.get_source(),
        sourceKey: readout.get_source_key(),
        defSha: readout.get_def_sha(),
        recSha: readout.get_rec_sha(),
    };
}

describe("buildCoverageGapComparison", () => {
    test("maps unhit buckets to a_only and covered to both", () => {
        // Clive/Slipper and Clive/Ball hit; Barbara rows unhit
        const readout = createTwoAxisReadout([
            [10, 5],
            [0, 0],
        ]);
        const gap = buildCoverageGapComparison(readout, meta(readout), "any_hit");
        expect(gap.global.a_only).toBe(2);
        expect(gap.global.both).toBe(2);
        expect(gap.bucketDetails.filter((bucket) => bucket.category === "a_only")).toHaveLength(2);
    });
});

describe("findUnhitPatterns", () => {
    test("surfaces Barbara as an unhit axis pattern", () => {
        const readout = createTwoAxisReadout([
            [10, 10],
            [0, 0],
        ]);
        const gap = buildCoverageGapComparison(readout, meta(readout), "any_hit");
        const patterns = findUnhitPatterns(gap, "detailed");
        const barbara = patterns.find((pattern) => pattern.conditions.name === "Barbara");
        expect(barbara).toBeDefined();
        expect(barbara?.bucketCount).toBe(2);
        expect(barbara?.description).toContain("not covered");
        expect(barbara?.description).not.toContain("A hits");
    });
});

describe("buildCoverageExportSummary", () => {
    test("describes off / balanced / met_goal choices", () => {
        expect(
            buildCoverageExportSummary({
                format: "html",
                patternDetail: "off",
                definition: "any_hit",
            }),
        ).toContain("without unhit pattern analysis");

        expect(
            buildCoverageExportSummary({
                format: "json",
                patternDetail: "medium",
                definition: "met_goal",
            }),
        ).toMatch(/JSON report.*meets its goal.*balanced set of unhit patterns/);
    });
});

describe("readable report gap analysis", () => {
    test("injects unhit patterns section when gapAnalysis is provided", () => {
        const html = buildReadableReportHtml([createTwoAxisReadout([[10, 0], [0, 0]])], {
            gapAnalysis: {
                definitionLabel: "Any hit (hits > 0)",
                patternScopeLabel: "Balanced",
                records: [
                    {
                        title: "Demo",
                        unhitBuckets: 3,
                        coveredBuckets: 1,
                        patterns: [
                            {
                                pointName: "chew_toys_by_age",
                                pointPath: "chew_toys_by_age",
                                bucketCount: 2,
                                summary: "name=Barbara",
                                description: "Where name=Barbara: not covered (2 buckets)",
                            },
                        ],
                    },
                ],
            },
        });
        expect(html).toContain("Unhit coverage patterns");
        expect(html).toContain("name=Barbara");
        expect(html).toContain("Pattern scope: Balanced");
    });
});
