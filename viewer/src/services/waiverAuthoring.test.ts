/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";
import {
    emptyWaiverFile,
    parseWaiverFile,
    parseWaiverFileText,
    serializeWaiverFile,
    WaiverSpecError,
} from "./waiverSpec";
import {
    applyWaiverFileToReadout,
    fnmatchCase,
    matchWaiversWithReport,
    matchesPointPath,
} from "./matchWaivers";
import {
    inferWaiverRules,
    bucketsMatchingAxisFilters,
    toggleAxisFilterValue,
    mergeWaiverSpecs,
    wouldCondenseWaiverSpecs,
} from "./inferWaiverRules";
import { InMemoryReadout } from "./readoutUtils";

function tinyReadout(): Readout {
    // One coverpoint "top.point" with axes kind={A,B} and size={1,2} → 4 buckets.
    // targets all 1; hits only on bucket 0.
    return new InMemoryReadout({
        defSha: "def",
        recSha: "rec",
        source: null,
        sourceKey: null,
        bucketVersion: "test",
        formatVersion: 2,
        points: [
            {
                start: 0,
                depth: 0,
                end: 1,
                axis_start: 0,
                axis_end: 1,
                axis_value_start: 0,
                axis_value_end: 0,
                goal_start: 0,
                goal_end: 0,
                bucket_start: 0,
                bucket_end: 0,
                target: 0,
                target_buckets: 0,
                name: "top",
                description: "",
            },
            {
                start: 1,
                depth: 1,
                end: 2,
                axis_start: 0,
                axis_end: 2,
                axis_value_start: 0,
                axis_value_end: 4,
                goal_start: 0,
                goal_end: 1,
                bucket_start: 0,
                bucket_end: 4,
                target: 4,
                target_buckets: 4,
                name: "point",
                description: "",
            },
        ],
        axes: [
            { start: 0, value_start: 0, value_end: 2, name: "kind", description: "" },
            { start: 1, value_start: 2, value_end: 4, name: "size", description: "" },
        ],
        axisValues: [
            { start: 0, value: "A" },
            { start: 1, value: "B" },
            { start: 2, value: "1" },
            { start: 3, value: "2" },
        ],
        goals: [{ start: 0, target: 1, name: "hit", description: "" }],
        bucketGoals: [
            { start: 0, goal: 0 },
            { start: 1, goal: 0 },
            { start: 2, goal: 0 },
            { start: 3, goal: 0 },
        ],
        bucketHits: [
            { start: 0, hits: 3 },
            { start: 1, hits: 0 },
            { start: 2, hits: 0 },
            { start: 3, hits: 0 },
        ],
        pointHits: [
            {
                start: 0,
                depth: 0,
                hits: 1,
                hit_buckets: 1,
                full_buckets: 1,
                waived_buckets: 0,
                waived_target: 0,
            },
            {
                start: 1,
                depth: 1,
                hits: 1,
                hit_buckets: 1,
                full_buckets: 1,
                waived_buckets: 0,
                waived_target: 0,
            },
        ],
    });
}

describe("waiverSpec", () => {
    test("parses and serialises disabled rules", () => {
        const file = parseWaiverFileText(`{
            "waivers": [{
                "point": "top.point",
                "axes": {"kind": "A"},
                "reason": "gap",
                "disabled": true
            }]
        }`);
        expect(file.waivers[0].disabled).toBe(true);
        const withDisabled = serializeWaiverFile(file, { includeDisabled: true });
        expect(withDisabled).toContain('"disabled": true');
        const skipped = serializeWaiverFile(file, { includeDisabled: false });
        expect(skipped).toBe('{\n  "waivers": []\n}\n');
    });

    test("rejects coverage JSON", () => {
        expect(() => parseWaiverFile({ definitions: [], records: [] })).toThrow(WaiverSpecError);
    });

    test("empty file helper", () => {
        expect(emptyWaiverFile()).toEqual({ waivers: [] });
    });
});

describe("matchWaivers", () => {
    test("fnmatch and point ancestors", () => {
        expect(fnmatchCase("top.point", "top.*")).toBe(true);
        expect(matchesPointPath("Pets.dogs.stats", "Pets.dogs")).toBe(true);
        expect(matchesPointPath("Pets.dogs.stats", "pets.cats")).toBe(false);
    });

    test("applies rules and soft-fails bad axes", () => {
        const readout = tinyReadout();
        const report = matchWaiversWithReport(readout, {
            waivers: [
                {
                    point: "top.point",
                    axes: { kind: "A" },
                    reason: "A lane",
                    author: "",
                    disabled: false,
                },
                {
                    point: "top.point",
                    axes: { missing: "x" },
                    reason: "typo",
                    author: "",
                    disabled: false,
                },
                {
                    point: "nowhere",
                    axes: {},
                    reason: "unused",
                    author: "",
                    disabled: false,
                },
                {
                    point: "top.point",
                    axes: { kind: "B" },
                    reason: "off",
                    author: "",
                    disabled: true,
                },
            ],
        });
        // kind=A covers buckets 0 (A,1) and 1 (A,2) with stride size innermost.
        expect(report.matched.map((row) => row.start)).toEqual([0, 1]);
        expect(report.waivedWithHits).toBe(1);
        expect(report.diagnostics[0].status).toBe("applied");
        expect(report.diagnostics[1].status).toBe("bad_axis");
        expect(report.diagnostics[2].status).toBe("no_match");
        expect(report.diagnostics[3].status).toBe("disabled");

        const applied = applyWaiverFileToReadout(readout, {
            waivers: [
                {
                    point: "top.point",
                    axes: { kind: "A" },
                    reason: "A lane",
                    author: "",
                    disabled: false,
                },
            ],
        });
        const pointHit = Array.from(applied.readout.iter_point_hits())[1];
        expect(pointHit.waived_buckets).toBe(2);
        expect(pointHit.hits).toBe(0);
    });

    test("marks rules as covered when earlier rules already waive their buckets", () => {
        const readout = tinyReadout();
        const report = matchWaiversWithReport(readout, {
            waivers: [
                {
                    point: "top.point",
                    axes: { kind: "A", size: "1" },
                    reason: "a1",
                    author: "",
                    disabled: false,
                },
                {
                    point: "top.point",
                    axes: { kind: "A", size: "2" },
                    reason: "a2",
                    author: "",
                    disabled: false,
                },
                {
                    point: "top.point",
                    axes: { kind: "A" },
                    reason: "all A",
                    author: "",
                    disabled: false,
                },
            ],
        });
        expect(report.diagnostics[0].status).toBe("applied");
        expect(report.diagnostics[1].status).toBe("applied");
        expect(report.diagnostics[2].status).toBe("covered");
        expect(report.diagnostics[2].coveredByIndexes).toEqual([0, 1]);
        expect(report.diagnostics[2].message).toMatch(/already waived/i);
    });
});

describe("inferWaiverRules", () => {
    test("collapses a fully selected axis", () => {
        const all = [
            { start: 0, axisValues: { kind: "A", size: "1" }, target: 1, hits: 0 },
            { start: 1, axisValues: { kind: "A", size: "2" }, target: 1, hits: 0 },
            { start: 2, axisValues: { kind: "B", size: "1" }, target: 1, hits: 0 },
            { start: 3, axisValues: { kind: "B", size: "2" }, target: 1, hits: 0 },
        ];
        const selected = all.filter((bucket) => bucket.axisValues.kind === "A");
        const rules = inferWaiverRules(selected, "top.point", all);
        expect(rules).toHaveLength(1);
        expect(rules[0].axes).toEqual({ kind: "A" });
        expect(rules[0].extraCount).toBe(0);
        expect(rules[0].selectedCovered).toBe(2);
    });

    test("condenses multiple values on one axis into a single rule", () => {
        const all = [
            { start: 0, axisValues: { x: "0" }, target: 1, hits: 0 },
            { start: 1, axisValues: { x: "1" }, target: 1, hits: 0 },
            { start: 2, axisValues: { x: "2" }, target: 1, hits: 0 },
        ];
        const selected = all.filter((bucket) => bucket.axisValues.x !== "2");
        const rules = inferWaiverRules(selected, "top.point", all);
        expect(rules).toHaveLength(1);
        expect(rules[0].axes).toEqual({ x: ["0", "1"] });
        expect(rules[0].extraCount).toBe(0);
    });

    test("does not collapse to all-axes when every value appears but the product is incomplete", () => {
        // A×B grid; select 3 of 4 so both axis domains appear in the selection.
        const all = [
            { start: 0, axisValues: { kind: "A", size: "1" }, target: 1, hits: 0 },
            { start: 1, axisValues: { kind: "A", size: "2" }, target: 1, hits: 0 },
            { start: 2, axisValues: { kind: "B", size: "1" }, target: 1, hits: 0 },
            { start: 3, axisValues: { kind: "B", size: "2" }, target: 1, hits: 1 },
        ];
        const selected = all.filter((bucket) => bucket.hits === 0);
        const rules = inferWaiverRules(selected, "top.point", all);
        expect(rules.every((rule) => rule.extraCount === 0)).toBe(true);
        const covered = new Set(rules.flatMap((rule) => rule.coversStarts));
        expect([...covered].sort()).toEqual([0, 1, 2]);
        expect(covered.has(3)).toBe(false);
    });

    test("exact cover: union of rules matches the selection with no extras", () => {
        const all = [
            { start: 0, axisValues: { x: "0", y: "a" }, target: 1, hits: 0 },
            { start: 1, axisValues: { x: "0", y: "b" }, target: 1, hits: 0 },
            { start: 2, axisValues: { x: "1", y: "a" }, target: 1, hits: 0 },
            { start: 3, axisValues: { x: "1", y: "b" }, target: 1, hits: 0 },
            { start: 4, axisValues: { x: "2", y: "a" }, target: 1, hits: 0 },
            { start: 5, axisValues: { x: "2", y: "b" }, target: 1, hits: 0 },
        ];
        // Checkerboard-ish: (0,a), (0,b), (1,a), (2,b) — not a single rectangle.
        const selected = [all[0], all[1], all[2], all[5]];
        const rules = inferWaiverRules(selected, "top.point", all);
        expect(rules.every((rule) => rule.extraCount === 0)).toBe(true);
        const covered = new Set(rules.flatMap((rule) => rule.coversStarts));
        expect([...covered].sort()).toEqual([0, 1, 2, 5]);
        expect(rules.some((rule) => Object.keys(rule.axes).length === 0)).toBe(false);
    });
});

describe("mergeWaiverSpecs", () => {
    test("merges same-reason axis values and keeps different reasons separate", () => {
        const existing = [
            {
                point: "top.point",
                axes: { x: "0" },
                reason: "corner",
                author: "a",
                disabled: false,
            },
            {
                point: "top.point",
                axes: { x: "2" },
                reason: "other",
                author: "a",
                disabled: false,
            },
        ];
        const incoming = [
            {
                point: "top.point",
                axes: { x: "1" },
                reason: "corner",
                author: "a",
                disabled: false,
            },
        ];
        const merged = mergeWaiverSpecs(existing, incoming);
        expect(merged).toEqual([
            {
                point: "top.point",
                axes: { x: ["0", "1"] },
                reason: "corner",
                author: "a",
                disabled: false,
            },
            {
                point: "top.point",
                axes: { x: "2" },
                reason: "other",
                author: "a",
                disabled: false,
            },
        ]);
    });

    test("does not merge when reasons differ", () => {
        const merged = mergeWaiverSpecs(
            [
                {
                    point: "top.point",
                    axes: { x: "0" },
                    reason: "a",
                    author: "",
                    disabled: false,
                },
            ],
            [
                {
                    point: "top.point",
                    axes: { x: "1" },
                    reason: "b",
                    author: "",
                    disabled: false,
                },
            ],
        );
        expect(merged).toHaveLength(2);
    });

    test("wouldCondenseWaiverSpecs detects merges", () => {
        const existing = [
            {
                point: "top.point",
                axes: { x: "0" },
                reason: "corner",
                author: "a",
                disabled: false,
            },
        ];
        const incoming = [
            {
                point: "top.point",
                axes: { x: "1" },
                reason: "corner",
                author: "a",
                disabled: false,
            },
        ];
        expect(wouldCondenseWaiverSpecs(existing, incoming)).toBe(true);
        expect(
            wouldCondenseWaiverSpecs(existing, [
                { ...incoming[0], reason: "other" },
            ]),
        ).toBe(false);
    });

    test("does not merge rules that differ on two axes (would waive product corners)", () => {
        // Diagonal unhit cells must stay separate — unioning both axes would
        // also match the off-diagonal (often hit) buckets.
        const existing = [
            {
                point: "top.point",
                axes: { x: "0", y: "a" },
                reason: "unhit",
                author: "",
                disabled: false,
            },
        ];
        const incoming = [
            {
                point: "top.point",
                axes: { x: "1", y: "b" },
                reason: "unhit",
                author: "",
                disabled: false,
            },
        ];
        expect(wouldCondenseWaiverSpecs(existing, incoming)).toBe(false);
        expect(mergeWaiverSpecs(existing, incoming)).toEqual([
            ...existing,
            ...incoming,
        ]);
    });

    test("still merges when only one axis differs", () => {
        const existing = [
            {
                point: "top.point",
                axes: { x: "0", y: "a" },
                reason: "unhit",
                author: "",
                disabled: false,
            },
        ];
        const incoming = [
            {
                point: "top.point",
                axes: { x: "1", y: "a" },
                reason: "unhit",
                author: "",
                disabled: false,
            },
        ];
        expect(mergeWaiverSpecs(existing, incoming)).toEqual([
            {
                point: "top.point",
                axes: { x: ["0", "1"], y: "a" },
                reason: "unhit",
                author: "",
                disabled: false,
            },
        ]);
    });

    test("does not fold diagonal inferred rules into each other on empty session", () => {
        const incoming = [
            {
                point: "top.point",
                axes: { x: "0", y: "a" },
                reason: "unhit",
                author: "",
                disabled: false,
            },
            {
                point: "top.point",
                axes: { x: "1", y: "b" },
                reason: "unhit",
                author: "",
                disabled: false,
            },
        ];
        expect(wouldCondenseWaiverSpecs([], incoming)).toBe(false);
        expect(mergeWaiverSpecs([], incoming)).toEqual(incoming);
    });
});

describe("axis value filters", () => {
    const all = [
        { start: 0, axisValues: { kind: "A", size: "1" }, target: 1, hits: 0 },
        { start: 1, axisValues: { kind: "A", size: "2" }, target: 1, hits: 0 },
        { start: 2, axisValues: { kind: "B", size: "1" }, target: 1, hits: 0 },
        { start: 3, axisValues: { kind: "B", size: "2" }, target: 1, hits: 0 },
    ];

    test("same axis is additive; other axes constrain", () => {
        expect(bucketsMatchingAxisFilters(all, { kind: ["A"] })).toEqual([0, 1]);
        expect(bucketsMatchingAxisFilters(all, { kind: ["A", "B"] })).toEqual([0, 1, 2, 3]);
        expect(bucketsMatchingAxisFilters(all, { kind: ["A"], size: ["1"] })).toEqual([0]);
        expect(bucketsMatchingAxisFilters(all, { kind: ["A", "B"], size: ["2"] })).toEqual([
            1, 3,
        ]);
    });

    test("toggleAxisFilterValue adds and removes", () => {
        let filters = toggleAxisFilterValue({}, "kind", "A");
        expect(filters).toEqual({ kind: ["A"] });
        filters = toggleAxisFilterValue(filters, "kind", "B");
        expect(filters).toEqual({ kind: ["A", "B"] });
        filters = toggleAxisFilterValue(filters, "size", "1");
        expect(filters).toEqual({ kind: ["A", "B"], size: ["1"] });
        filters = toggleAxisFilterValue(filters, "kind", "A");
        expect(filters).toEqual({ kind: ["B"], size: ["1"] });
        filters = toggleAxisFilterValue(filters, "kind", "B");
        expect(filters).toEqual({ size: ["1"] });
    });
});
