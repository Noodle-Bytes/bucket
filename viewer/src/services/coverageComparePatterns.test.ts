/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";
import { buildComparison } from "@/services/coverageCompare";
import { findComparePatterns, formatPatternSummary } from "@/services/coverageComparePatterns";
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

describe("findComparePatterns", () => {
    test("detects combined axis pattern when a single-axis slice is mixed", () => {
        const readoutA = createTwoAxisReadout([
            [5, 0],
            [0, 0],
        ]);
        const readoutB = createTwoAxisReadout([
            [0, 0],
            [0, 3],
        ]);

        const comparison = buildComparison(
            readoutA,
            readoutB,
            meta("Run A", readoutA),
            meta("Run B", readoutB),
            "any_hit",
        );

        const patterns = findComparePatterns(comparison);
        const cliveSlipper = patterns.find(
            (pattern) =>
                pattern.signal.category === "a_only"
                && pattern.conditions.name === "Clive"
                && pattern.conditions.favourite_toy === "Slipper",
        );

        expect(cliveSlipper).toBeDefined();
        expect(cliveSlipper?.description).toContain("favourite_toy=Slipper, name=Clive");
        expect(cliveSlipper?.description).toContain("A hits, B does not");
    });

    test("surfaces broad single-axis patterns and drops redundant crosses", () => {
        const readoutA = createTwoAxisReadout([
            [5, 5],
            [0, 0],
        ]);
        const readoutB = createTwoAxisReadout([
            [0, 0],
            [3, 3],
        ]);

        const comparison = buildComparison(
            readoutA,
            readoutB,
            meta("Run A", readoutA),
            meta("Run B", readoutB),
            "any_hit",
        );

        const patterns = findComparePatterns(comparison, "detailed");
        const cliveOnly = patterns.find(
            (pattern) =>
                pattern.conditions.name === "Clive" && Object.keys(pattern.conditions).length === 1,
        );
        const barbaraOnly = patterns.find(
            (pattern) =>
                pattern.conditions.name === "Barbara" && Object.keys(pattern.conditions).length === 1,
        );

        expect(cliveOnly).toBeDefined();
        expect(cliveOnly?.bucketCount).toBe(2);
        expect(barbaraOnly).toBeDefined();
        expect(barbaraOnly?.bucketCount).toBe(2);
        expect(
            patterns.find(
                (pattern) =>
                    pattern.conditions.name === "Clive"
                    && pattern.conditions.favourite_toy === "Slipper",
            ),
        ).toBeUndefined();
        expect(
            patterns.find(
                (pattern) =>
                    pattern.conditions.name === "Barbara"
                    && pattern.conditions.favourite_toy === "Ball",
            ),
        ).toBeUndefined();
    });

    test("keeps multi-axis patterns when they narrow a mixed single-axis slice", () => {
        const readoutA = createTwoAxisReadout([
            [5, 0],
            [0, 0],
        ]);
        const readoutB = createTwoAxisReadout([
            [0, 0],
            [0, 3],
        ]);

        const comparison = buildComparison(
            readoutA,
            readoutB,
            meta("Run A", readoutA),
            meta("Run B", readoutB),
            "any_hit",
        );

        const patterns = findComparePatterns(comparison, "detailed");
        const cliveSlipper = patterns.find(
            (pattern) =>
                pattern.signal.category === "a_only"
                && pattern.conditions.name === "Clive"
                && pattern.conditions.favourite_toy === "Slipper",
        );

        expect(
            patterns.find(
                (pattern) =>
                    pattern.kind === "exact"
                    && pattern.conditions.name === "Clive"
                    && Object.keys(pattern.conditions).length === 1,
            ),
        ).toBeUndefined();
        expect(cliveSlipper).toBeDefined();
    });

    test("excludes neither, both, and isolated single-bucket axis patterns", () => {
        const readoutA = createTwoAxisReadout([
            [5, 0],
            [0, 0],
        ]);
        const readoutB = createTwoAxisReadout([
            [5, 0],
            [0, 0],
        ]);

        const comparison = buildComparison(
            readoutA,
            readoutB,
            meta("Run A", readoutA),
            meta("Run B", readoutB),
            "any_hit",
        );

        const patterns = findComparePatterns(comparison);
        expect(patterns).toHaveLength(0);
    });

    test("detects numeric age range never covered by A or B", () => {
        const ages = Array.from({ length: 12 }, (_, idx) => String(idx));
        const names = ["Clive", "Barbara"];
        const bucketCount = names.length * ages.length;

        function buildDogStatsReadout(hitsByAgeForClive: number[], hitsByAgeForBarbara: number[]): Readout {
            const bucketGoals = Array.from({ length: bucketCount }, (_, idx) => ({
                start: idx,
                goal: 0,
            }));
            const bucketHits: Array<{ start: number; hits: number }> = [];

            for (const [nameIdx, name] of names.entries()) {
                for (const [ageIdx, age] of ages.entries()) {
                    const bucketIdx = nameIdx * ages.length + ageIdx;
                    const hits =
                        name === "Clive"
                            ? (hitsByAgeForClive[ageIdx] ?? 0)
                            : (hitsByAgeForBarbara[ageIdx] ?? 0);
                    bucketHits.push({ start: bucketIdx, hits });
                }
            }

            return new InMemoryReadout({
                defSha: "def-dog-stats",
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
                        axis_value_end: names.length + ages.length,
                        goal_start: 0,
                        goal_end: 1,
                        bucket_start: 0,
                        bucket_end: bucketCount,
                        target: bucketCount * 10,
                        target_buckets: bucketCount,
                        name: "Doggy stats",
                        description: "Dog stats",
                    },
                ],
                bucketGoals,
                axes: [
                    {
                        start: 0,
                        value_start: 0,
                        value_end: names.length,
                        name: "name",
                        description: "name",
                    },
                    {
                        start: 1,
                        value_start: names.length,
                        value_end: names.length + ages.length,
                        name: "age",
                        description: "age",
                    },
                ],
                axisValues: [
                    ...names.map((value, idx) => ({ start: idx, value })),
                    ...ages.map((value, idx) => ({ start: names.length + idx, value })),
                ],
                goals: [{ start: 0, target: 10, name: "DEFAULT", description: "Default" }],
                pointHits: [
                    {
                        start: 0,
                        depth: 0,
                        hits: bucketHits.reduce((sum, entry) => sum + Math.min(entry.hits, 10), 0),
                        hit_buckets: bucketHits.filter((entry) => entry.hits > 0).length,
                        full_buckets: bucketHits.filter((entry) => entry.hits >= 10).length,
                    },
                ],
                bucketHits,
            });
        }

        const hitsAClive = ages.map((_, idx) => (idx < 4 ? 0 : 5));
        const hitsBClive = ages.map((_, idx) => (idx > 9 ? 0 : 3));
        const readoutA = buildDogStatsReadout(hitsAClive, ages.map(() => 0));
        const readoutB = buildDogStatsReadout(hitsBClive, ages.map(() => 0));

        const comparison = buildComparison(
            readoutA,
            readoutB,
            meta("Run A", readoutA),
            meta("Run B", readoutB),
            "any_hit",
        );

        const patterns = findComparePatterns(comparison);

        const youngerThanFourInB = patterns.find(
            (pattern) =>
                pattern.kind === "range"
                && pattern.signal.category === "b_only"
                && pattern.conditions.name === "Clive"
                && pattern.rangeLabel?.includes("never younger than 4"),
        );
        const olderThanNineInA = patterns.find(
            (pattern) =>
                pattern.kind === "range"
                && pattern.signal.category === "a_only"
                && pattern.conditions.name === "Clive"
                && pattern.rangeLabel?.includes("never older than 9"),
        );

        expect(youngerThanFourInB).toBeDefined();
        expect(youngerThanFourInB?.description).toContain("B hits, A does not");
        expect(olderThanNineInA).toBeDefined();
        expect(olderThanNineInA?.description).toContain("A hits, B does not");
    });

    test("patterns are ordered by bucket count descending", () => {
        const readoutA = createTwoAxisReadout([
            [5, 0],
            [0, 0],
        ]);
        const readoutB = createTwoAxisReadout([
            [0, 0],
            [0, 3],
        ]);

        const comparison = buildComparison(
            readoutA,
            readoutB,
            meta("Run A", readoutA),
            meta("Run B", readoutB),
            "any_hit",
        );

        const patterns = findComparePatterns(comparison, "detailed");
        for (let idx = 1; idx < patterns.length; idx += 1) {
            expect(patterns[idx - 1].bucketCount).toBeGreaterThanOrEqual(patterns[idx].bucketCount);
        }
    });

    test("fast detail level caps patterns and still finds large ranges", () => {
        const ages = Array.from({ length: 12 }, (_, idx) => String(idx));
        const names = ["Clive"];
        const bucketCount = names.length * ages.length;

        function buildDogStatsReadout(hitsByAgeForClive: number[]): Readout {
            const bucketGoals = Array.from({ length: bucketCount }, (_, idx) => ({
                start: idx,
                goal: 0,
            }));
            const bucketHits = ages.map((_, ageIdx) => ({
                start: ageIdx,
                hits: hitsByAgeForClive[ageIdx] ?? 0,
            }));

            return new InMemoryReadout({
                defSha: "def-dog-stats",
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
                        axis_value_end: names.length + ages.length,
                        goal_start: 0,
                        goal_end: 1,
                        bucket_start: 0,
                        bucket_end: bucketCount,
                        target: bucketCount * 10,
                        target_buckets: bucketCount,
                        name: "Doggy stats",
                        description: "Dog stats",
                    },
                ],
                bucketGoals,
                axes: [
                    {
                        start: 0,
                        value_start: 0,
                        value_end: names.length,
                        name: "name",
                        description: "name",
                    },
                    {
                        start: 1,
                        value_start: names.length,
                        value_end: names.length + ages.length,
                        name: "age",
                        description: "age",
                    },
                ],
                axisValues: [
                    ...names.map((value, idx) => ({ start: idx, value })),
                    ...ages.map((value, idx) => ({ start: names.length + idx, value })),
                ],
                goals: [{ start: 0, target: 10, name: "DEFAULT", description: "Default" }],
                pointHits: [
                    {
                        start: 0,
                        depth: 0,
                        hits: bucketHits.reduce((sum, entry) => sum + Math.min(entry.hits, 10), 0),
                        hit_buckets: bucketHits.filter((entry) => entry.hits > 0).length,
                        full_buckets: bucketHits.filter((entry) => entry.hits >= 10).length,
                    },
                ],
                bucketHits,
            });
        }

        const hitsAClive = ages.map((_, idx) => (idx < 4 ? 0 : 5));
        const hitsBClive = ages.map((_, idx) => (idx > 9 ? 0 : 3));
        const readoutA = buildDogStatsReadout(hitsAClive);
        const readoutB = buildDogStatsReadout(hitsBClive);

        const comparison = buildComparison(
            readoutA,
            readoutB,
            meta("Run A", readoutA),
            meta("Run B", readoutB),
            "any_hit",
        );

        const fast = findComparePatterns(comparison, "fast");
        const detailed = findComparePatterns(comparison, "detailed");

        expect(fast.length).toBeLessThanOrEqual(25);
        expect(detailed.length).toBeGreaterThanOrEqual(fast.length);
        expect(
            fast.some(
                (pattern) =>
                    pattern.kind === "range"
                    && pattern.rangeLabel?.includes("never younger than 4"),
            ),
        ).toBe(true);
    });

    test("drops axis conditions that do not change which buckets are described", () => {
        const readoutA = createTwoAxisReadout([
            [5, 5],
            [0, 0],
        ]);
        const readoutB = createTwoAxisReadout([
            [0, 0],
            [3, 3],
        ]);

        const comparison = buildComparison(
            readoutA,
            readoutB,
            meta("Run A", readoutA),
            meta("Run B", readoutB),
            "any_hit",
        );

        const patterns = findComparePatterns(comparison, "detailed");
        const clive = patterns.find(
            (pattern) =>
                pattern.kind === "exact"
                && pattern.conditions.name === "Clive"
                && Object.keys(pattern.conditions).length === 1,
        );
        expect(clive).toBeDefined();
        expect(formatPatternSummary(clive!)).toBe("name=Clive");
    });

    test("formatPatternSummary produces readable one-liners", () => {
        const readoutA = createTwoAxisReadout([
            [5, 0],
            [0, 0],
        ]);
        const readoutB = createTwoAxisReadout([
            [0, 0],
            [0, 3],
        ]);

        const comparison = buildComparison(
            readoutA,
            readoutB,
            meta("Run A", readoutA),
            meta("Run B", readoutB),
            "any_hit",
        );

        const pattern = findComparePatterns(comparison, "detailed").find(
            (entry) =>
                entry.conditions.name === "Clive" && entry.conditions.favourite_toy === "Slipper",
        );

        expect(pattern).toBeDefined();
        expect(formatPatternSummary(pattern!)).toBe("favourite_toy=Slipper, name=Clive");
    });

    test("formatPatternSummary uses axis=value consistently for mixed exact and range slices", () => {
        const summary = formatPatternSummary({
            kind: "range",
            signal: { type: "category", category: "a_only" },
            pointPath: "pets / stats",
            pointName: "stats",
            conditions: { name: "Graham", favourite_toy: "Laser" },
            rangeAxis: "breed",
            rangeLabel: "breed=[Persian, Siamese, Burmese]",
            bucketCount: 3,
            description: "",
        });

        expect(summary).toBe("favourite_toy=Laser, name=Graham, breed=[Persian, Siamese, Burmese]");
        expect(summary).not.toContain(" is ");
        expect(summary).not.toContain("through");
    });

    test("string axis ranges list values instead of through-phrasing", () => {
        const breeds = ["Persian", "Siamese", "Burmese", "Labrador"];
        const toys = ["Laser", "Ball", "Slipper", "Bone"];
        const bucketCount = breeds.length * toys.length;

        function buildPetReadout(hits: number[][]): Readout {
            const bucketGoals = Array.from({ length: bucketCount }, (_, idx) => ({
                start: idx,
                goal: 0,
            }));
            const bucketHits = hits.flatMap((row, breedIdx) =>
                row.map((hitCount, toyIdx) => ({
                    start: breedIdx * toys.length + toyIdx,
                    hits: hitCount,
                })),
            );

            return new InMemoryReadout({
                defSha: "def-pets",
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
                        axis_value_end: breeds.length + toys.length,
                        goal_start: 0,
                        goal_end: 1,
                        bucket_start: 0,
                        bucket_end: bucketCount,
                        target: bucketCount * 10,
                        target_buckets: bucketCount,
                        name: "pet_stats",
                        description: "Pet stats",
                    },
                ],
                bucketGoals,
                axes: [
                    {
                        start: 0,
                        value_start: 0,
                        value_end: breeds.length,
                        name: "breed",
                        description: "breed",
                    },
                    {
                        start: 1,
                        value_start: breeds.length,
                        value_end: breeds.length + toys.length,
                        name: "favourite_toy",
                        description: "favourite toy",
                    },
                ],
                axisValues: [
                    ...breeds.map((value, idx) => ({ start: idx, value })),
                    ...toys.map((value, idx) => ({ start: breeds.length + idx, value })),
                ],
                goals: [{ start: 0, target: 10, name: "DEFAULT", description: "Default" }],
                pointHits: [
                    {
                        start: 0,
                        depth: 0,
                        hits: bucketHits.reduce((sum, entry) => sum + Math.min(entry.hits, 10), 0),
                        hit_buckets: bucketHits.filter((entry) => entry.hits > 0).length,
                        full_buckets: bucketHits.filter((entry) => entry.hits >= 10).length,
                    },
                ],
                bucketHits,
            });
        }

        const readoutA = buildPetReadout([
            [5, 5, 0, 0],
            [5, 5, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ]);
        const readoutB = buildPetReadout([
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 3, 3],
            [0, 0, 3, 3],
        ]);

        const comparison = buildComparison(
            readoutA,
            readoutB,
            meta("Run A", readoutA),
            meta("Run B", readoutB),
            "any_hit",
        );

        const patterns = findComparePatterns(comparison, "detailed");
        const breedRange = patterns.find(
            (pattern) =>
                pattern.kind === "range"
                && pattern.rangeAxis === "breed"
                && pattern.conditions.favourite_toy === "Laser",
        );

        expect(breedRange).toBeDefined();
        expect(formatPatternSummary(breedRange!)).toBe("favourite_toy=Laser, breed=[Persian, Siamese]");
        expect(formatPatternSummary(breedRange!)).not.toContain("through");
    });

    test("side filter limits patterns to one asymmetric direction", () => {
        const readoutA = createTwoAxisReadout([
            [5, 0],
            [0, 0],
        ]);
        const readoutB = createTwoAxisReadout([
            [0, 0],
            [0, 3],
        ]);

        const comparison = buildComparison(
            readoutA,
            readoutB,
            meta("Run A", readoutA),
            meta("Run B", readoutB),
            "any_hit",
        );

        const both = findComparePatterns(comparison, { detailLevel: "detailed", sideFilter: "both" });
        const aOnly = findComparePatterns(comparison, { detailLevel: "detailed", sideFilter: "a_only" });
        const bOnly = findComparePatterns(comparison, { detailLevel: "detailed", sideFilter: "b_only" });

        expect(aOnly.every((pattern) => pattern.signal.category === "a_only")).toBe(true);
        expect(bOnly.every((pattern) => pattern.signal.category === "b_only")).toBe(true);
        expect(aOnly.length).toBeGreaterThan(0);
        expect(bOnly.length).toBeGreaterThan(0);
        expect(both.length).toBeGreaterThanOrEqual(aOnly.length + bOnly.length);
    });
});
