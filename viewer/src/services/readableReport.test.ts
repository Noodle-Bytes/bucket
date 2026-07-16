/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";
import { InMemoryReadout } from "@/services/readoutUtils";
import {
    buildReadableReportHtml,
    buildReportModel,
    compactAxisValues,
    serializeReportHtml,
} from "@/services/readableReport";

function createNestedReadout(overrides?: {
    source?: string;
    recSha?: string;
    leafName?: string;
    leafDescription?: string;
    tags?: string;
}): Readout {
    // top (group) > dogs (group, no prose) > chew_toys (coverpoint with
    // 2 axes: breed[labrador,pug] x toy[ball,rope,bone] = 6 buckets,
    // 5 targeted at 10 hits each, 1 illegal).
    return new InMemoryReadout({
        defSha: "def-sha-1234",
        recSha: overrides?.recSha ?? "rec-sha-5678",
        source: overrides?.source ?? "regression",
        sourceKey: "run-42",
        bucketVersion: "1.2.3",
        points: [
            {
                start: 0,
                depth: 0,
                end: 3,
                axis_start: 0,
                axis_end: 2,
                axis_value_start: 0,
                axis_value_end: 5,
                goal_start: 0,
                goal_end: 2,
                bucket_start: 0,
                bucket_end: 6,
                target: 50,
                target_buckets: 5,
                name: "top",
                description: "Top level coverage",
            },
            {
                start: 1,
                depth: 1,
                end: 3,
                axis_start: 0,
                axis_end: 2,
                axis_value_start: 0,
                axis_value_end: 5,
                goal_start: 0,
                goal_end: 2,
                bucket_start: 0,
                bucket_end: 6,
                target: 50,
                target_buckets: 5,
                name: "dogs",
                description: "",
            },
            {
                start: 2,
                depth: 2,
                end: 3,
                axis_start: 0,
                axis_end: 2,
                axis_value_start: 0,
                axis_value_end: 5,
                goal_start: 0,
                goal_end: 2,
                bucket_start: 0,
                bucket_end: 6,
                target: 50,
                target_buckets: 5,
                name: overrides?.leafName ?? "chew_toys",
                description: overrides?.leafDescription ?? "Toys chewed per breed",
                tier: 1,
                tags: overrides?.tags ?? '["toys","dogs"]',
                motivation: "Ensure all breeds chew all toys",
            },
        ],
        bucketGoals: [
            { start: 0, goal: 0 },
            { start: 1, goal: 0 },
            { start: 2, goal: 0 },
            { start: 3, goal: 0 },
            { start: 4, goal: 0 },
            { start: 5, goal: 1 },
        ],
        axes: [
            {
                start: 0,
                value_start: 0,
                value_end: 2,
                name: "breed",
                description: "Breed of dog",
            },
            {
                start: 1,
                value_start: 2,
                value_end: 5,
                name: "toy",
                description: "Toy chewed",
            },
        ],
        axisValues: [
            { start: 0, value: "labrador" },
            { start: 1, value: "pug" },
            { start: 2, value: "ball" },
            { start: 3, value: "rope" },
            { start: 4, value: "bone" },
        ],
        goals: [
            { start: 0, target: 10, name: "DEFAULT", description: "Default goal" },
            { start: 1, target: -1, name: "ILLEGAL", description: "Illegal bucket" },
        ],
        pointHits: [
            { start: 0, depth: 0, hits: 25, hit_buckets: 3, full_buckets: 2 },
            { start: 1, depth: 1, hits: 25, hit_buckets: 3, full_buckets: 2 },
            { start: 2, depth: 2, hits: 25, hit_buckets: 3, full_buckets: 2 },
        ],
        bucketHits: [
            { start: 0, hits: 10 },
            { start: 1, hits: 10 },
            { start: 2, hits: 5 },
            { start: 3, hits: 0 },
            { start: 4, hits: 0 },
            { start: 5, hits: 0 },
        ],
    });
}

describe("buildReportModel", () => {
    test("builds a nested tree with paths, groups, and counts", () => {
        const model = buildReportModel([createNestedReadout()]);

        expect(model.readouts).toHaveLength(1);
        const readout = model.readouts[0];
        expect(readout.title).toBe("regression");
        expect(readout.defSha).toBe("def-sha-1234");
        expect(readout.roots).toHaveLength(1);

        const top = readout.roots[0];
        expect(top.path).toBe("top");
        expect(top.isGroup).toBe(true);
        expect(top.children).toHaveLength(1);

        const dogs = top.children[0];
        expect(dogs.path).toBe("top.dogs");
        expect(dogs.isGroup).toBe(true);

        const leaf = dogs.children[0];
        expect(leaf.path).toBe("top.dogs.chew_toys");
        expect(leaf.isGroup).toBe(false);
        expect(leaf.bucketCount).toBe(6);
        expect(leaf.targetBuckets).toBe(5);
        expect(leaf.target).toBe(50);
        expect(leaf.tier).toBe(1);
        expect(leaf.tags).toEqual(["toys", "dogs"]);
        expect(leaf.axes.map((axis) => axis.name)).toEqual(["breed", "toy"]);
        expect(leaf.axes[1].values).toEqual(["ball", "rope", "bone"]);
        expect(leaf.goals.map((goal) => goal.target)).toEqual([10, -1]);
        expect(leaf.results).toBeNull();
    });

    test("falls back to the record sha when source is empty", () => {
        const model = buildReportModel([
            createNestedReadout({ source: "", recSha: "abcdef0123456789" }),
        ]);
        expect(model.readouts[0].title).toBe("Record abcdef012345");
    });

    test("decodes comma-separated tags", () => {
        const model = buildReportModel([createNestedReadout({ tags: "toys, dogs" })]);
        const leaf = model.readouts[0].roots[0].children[0].children[0];
        expect(leaf.tags).toEqual(["toys", "dogs"]);
    });

    test("caps axis values and reports the omitted count", () => {
        const model = buildReportModel([createNestedReadout()], { maxAxisValues: 2 });
        const leaf = model.readouts[0].roots[0].children[0].children[0];
        expect(leaf.axes[1].values).toEqual(["ball", "rope"]);
        expect(leaf.axes[1].omittedValues).toBe(1);
        expect(leaf.axes[1].valueCount).toBe(3);
    });

    test("includes results when requested", () => {
        const model = buildReportModel([createNestedReadout()], { results: true });
        const leaf = model.readouts[0].roots[0].children[0].children[0];
        expect(leaf.results).toEqual({ hits: 25, hitBuckets: 3, fullBuckets: 2 });
    });
});

function createFlatReadout(): Readout {
    // root (group) > alpha (tier 0, uart), beta (tier 1, axi),
    // gamma (tier 2, uart+axi). One 2-value axis / 2 buckets / target 10 each.
    const leaf = (
        idx: number,
        name: string,
        tier: number,
        tags: string,
    ): PointTuple => ({
        start: idx + 1,
        depth: 1,
        end: idx + 2,
        axis_start: idx,
        axis_end: idx + 1,
        axis_value_start: idx * 2,
        axis_value_end: idx * 2 + 2,
        goal_start: idx,
        goal_end: idx + 1,
        bucket_start: idx * 2,
        bucket_end: idx * 2 + 2,
        target: 10,
        target_buckets: 2,
        name,
        description: `${name} coverage`,
        tier,
        tags,
    });
    return new InMemoryReadout({
        defSha: "def-flat",
        recSha: "rec-flat",
        source: "flat",
        sourceKey: "",
        bucketVersion: "",
        points: [
            {
                start: 0,
                depth: 0,
                end: 4,
                axis_start: 0,
                axis_end: 3,
                axis_value_start: 0,
                axis_value_end: 6,
                goal_start: 0,
                goal_end: 3,
                bucket_start: 0,
                bucket_end: 6,
                target: 30,
                target_buckets: 6,
                name: "root",
                description: "",
            },
            leaf(0, "alpha", 0, '["uart"]'),
            leaf(1, "beta", 1, '["axi"]'),
            leaf(2, "gamma", 2, '["uart","axi"]'),
        ],
        bucketGoals: [0, 0, 1, 1, 2, 2].map((goal, start) => ({ start, goal })),
        axes: [0, 1, 2].map((idx) => ({
            start: idx,
            value_start: idx * 2,
            value_end: idx * 2 + 2,
            name: `ax${idx}`,
            description: "",
        })),
        axisValues: ["a", "b", "c", "d", "e", "f"].map((value, start) => ({
            start,
            value,
        })),
        goals: [0, 1, 2].map((idx) => ({
            start: idx,
            target: 5,
            name: "DEFAULT",
            description: "",
        })),
        pointHits: [
            { start: 0, depth: 0, hits: 13, hit_buckets: 3, full_buckets: 2 },
            { start: 1, depth: 1, hits: 10, hit_buckets: 2, full_buckets: 2 },
            { start: 2, depth: 1, hits: 3, hit_buckets: 1, full_buckets: 0 },
            { start: 3, depth: 1, hits: 0, hit_buckets: 0, full_buckets: 0 },
        ],
        bucketHits: [5, 5, 3, 0, 0, 0].map((hits, start) => ({ start, hits })),
    });
}

describe("filtering", () => {
    test("maxTier keeps low tiers and recomputes group counts", () => {
        const model = buildReportModel([createFlatReadout()], { maxTier: 1 });
        const root = model.readouts[0].roots[0];
        expect(root.children.map((child) => child.name)).toEqual(["alpha", "beta"]);
        expect(root.bucketCount).toBe(4);
        expect(root.targetBuckets).toBe(4);
        expect(root.target).toBe(20);
    });

    test("tags keeps any-match coverpoints", () => {
        const model = buildReportModel([createFlatReadout()], { tags: ["uart"] });
        const root = model.readouts[0].roots[0];
        expect(root.children.map((child) => child.name)).toEqual(["alpha", "gamma"]);
    });

    test("point glob selects a leaf or a subtree", () => {
        const leafOnly = buildReportModel([createFlatReadout()], {
            point: "root.beta",
        });
        expect(
            leafOnly.readouts[0].roots[0].children.map((child) => child.name),
        ).toEqual(["beta"]);

        const subtree = buildReportModel([createFlatReadout()], { point: "root" });
        expect(subtree.readouts[0].roots[0].children).toHaveLength(3);
    });

    test("filters combine and recompute group results", () => {
        const model = buildReportModel([createFlatReadout()], {
            maxTier: 1,
            tags: ["uart"],
            results: true,
        });
        const root = model.readouts[0].roots[0];
        expect(root.children.map((child) => child.name)).toEqual(["alpha"]);
        expect(root.results).toEqual({ hits: 10, hitBuckets: 2, fullBuckets: 2 });
    });

    test("reports when nothing matches, with the filters described", () => {
        const html = buildReadableReportHtml([createFlatReadout()], {
            maxTier: 0,
            tags: ["axi"],
        });
        expect(html).toContain(
            "<strong>Filtered:</strong> tier ≤ 0 · tags: <code>axi</code>",
        );
        expect(html).toContain("No coverage points match the requested filters.");
        expect(html).not.toContain("<h3>Coverage tree</h3>");
    });
});

describe("summary rollups", () => {
    test("tier and tag tables aggregate the definition", () => {
        const html = buildReadableReportHtml([createFlatReadout()]);
        expect(html).toContain("<h3>Summary</h3>");
        expect(html).toContain(
            '<tr><th>Tier</th><th class="num">Coverpoints</th><th class="num">Buckets</th>' +
                '<th class="num">Valid buckets</th><th class="num">Target hits</th></tr>',
        );
        expect(html).toContain(
            '<tr><td>0</td><td class="num">1</td><td class="num">2</td>' +
                '<td class="num">2</td><td class="num">10</td></tr>',
        );
        expect(html).toContain(
            '<tr><td>uart</td><td class="num">2</td><td class="num">4</td>' +
                '<td class="num">4</td><td class="num">20</td></tr>',
        );
    });

    test("results add hit columns to the rollups", () => {
        const html = buildReadableReportHtml([createFlatReadout()], {
            results: true,
        });
        expect(html).toContain('<th class="num">Hits</th><th class="num">Hit %</th>');
        expect(html).toContain(
            '<td class="num">10</td><td class="num"><span class="pct full">100.00%</span></td>',
        );
        expect(html).toContain(
            '<tr><td>uart</td><td class="num">2</td><td class="num">4</td>' +
                '<td class="num">4</td><td class="num">20</td><td class="num">10</td>' +
                '<td class="num"><span class="pct high">50.00%</span></td></tr>',
        );
    });

    test("summary=false removes the section", () => {
        const html = buildReadableReportHtml([createFlatReadout()], {
            summary: false,
        });
        expect(html).not.toContain("<h3>Summary</h3>");
    });

    test("tag table is omitted when nothing is tagged", () => {
        const html = buildReadableReportHtml([createNestedReadout({ tags: "" })]);
        expect(html).toContain("<th>Tier</th>");
        expect(html).not.toContain("<th>Tag</th>");
    });
});

describe("compactAxisValues", () => {
    test("collapses contiguous integer runs into ranges", () => {
        expect(compactAxisValues(["0", "1", "2", "3", "4"])).toEqual([
            { text: "0..4", count: 5 },
        ]);
    });

    test("collapses prefixed zero-padded runs", () => {
        const values = ["universe_00", "universe_01", "universe_02", "universe_03"];
        expect(compactAxisValues(values)).toEqual([
            { text: "universe_[00..03]", count: 4 },
        ]);
    });

    test("keeps short runs and non-numeric values as-is", () => {
        expect(compactAxisValues(["1", "2", "4", "5"])).toEqual([
            { text: "1", count: 1 },
            { text: "2", count: 1 },
            { text: "4", count: 1 },
            { text: "5", count: 1 },
        ]);
        expect(compactAxisValues(["ball", "rope", "bone"])).toEqual([
            { text: "ball", count: 1 },
            { text: "rope", count: 1 },
            { text: "bone", count: 1 },
        ]);
    });

    test("splits runs at gaps and pattern changes", () => {
        expect(
            compactAxisValues(["a_1", "a_2", "a_3", "b_4", "8", "9", "10", "11"]),
        ).toEqual([
            { text: "a_[1..3]", count: 3 },
            { text: "b_4", count: 1 },
            { text: "8..11", count: 4 },
        ]);
    });

    test("does not bridge zero-padding width changes", () => {
        expect(compactAxisValues(["x08", "x09", "x100"])).toEqual([
            { text: "x08", count: 1 },
            { text: "x09", count: 1 },
            { text: "x100", count: 1 },
        ]);
    });
});

describe("serializeReportHtml", () => {
    test("default report contains tree, cards, axes, goals, and no results", () => {
        const html = buildReadableReportHtml([createNestedReadout()]);

        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("<h1>Coverage report</h1>");
        expect(html).toContain("<h2>regression</h2>");
        expect(html).toContain("<dt>Source key</dt><dd>run-42</dd>");
        expect(html).toContain("<dt>Bucket version</dt><dd>1.2.3</dd>");

        // Tree navigation (sidebar on wide screens) links to the detail cards.
        expect(html).toContain('<aside class="toc"><h3>Coverage tree</h3>');
        expect(html).toContain('<div class="record-main">');
        expect(html).toContain(">chew_toys</a>");
        // Sidebar entries stay lean: no bucket counts in the tree.
        expect(html).not.toContain("6 buckets (5 valid)");
        // Enhancements are inline script; the document must not need them.
        expect(html).toContain("IntersectionObserver");
        expect(html).toContain("<script>");

        // Coverpoint card with full content; ancestor path muted, name bold.
        expect(html).toContain("<h3>Coverage details</h3>");
        expect(html).toContain(
            '<span class="crumb">top.dogs.</span><span class="leaf">chew_toys</span>',
        );
        expect(html).toContain("Toys chewed per breed");
        expect(html).toContain("<em>Motivation:</em> Ensure all breeds chew all toys");
        expect(html).toContain('Tier <span class="chip">1</span>');
        expect(html).toContain('<span class="chip">toys</span>');
        expect(html).toContain("<code>labrador</code>, <code>pug</code>");
        expect(html).toContain("<td>DEFAULT</td><td>Default goal</td>");
        expect(html).toContain("Buckets: 6 total, 5 valid · Target hits: 50");
        expect(html).not.toContain('class="results"');

        // Covergroups are labelled container cards; coverpoints nest inside.
        expect(html).toContain(
            '<span class="leaf">top</span></span><span class="badge">covergroup</span>',
        );
        // One tinted container card per covergroup, coloured by depth, with
        // folder/file icons telling groups and points apart at a glance.
        expect(html).toContain('class="card group-card tint-0 shade-0"');
        expect(html).toContain('class="card group-card tint-1 shade-0"');
        expect(html).toContain('class="icon icon-group"');
        expect(html).toContain('class="icon icon-point"');
        expect(
            (html.match(/class="card group-card tint-\d shade-\d"/g) ?? []).length,
        ).toBe(2);
        const dogsIdx = html.indexOf('id="point-1-top-dogs"');
        const leafIdx = html.indexOf('id="point-2-top-dogs-chew_toys"');
        expect(dogsIdx).toBeGreaterThan(-1);
        expect(leafIdx).toBeGreaterThan(dogsIdx);
        // The leaf card sits inside the dogs group card, before it closes.
        expect(html.slice(dogsIdx, leafIdx)).not.toContain("</details>");
    });

    test("results option adds coloured hit information", () => {
        const html = buildReadableReportHtml([createNestedReadout()], {
            results: true,
        });
        expect(html).toContain(
            '25/50 hits <span class="pct high">50.00%</span> · ' +
                '3/5 buckets hit <span class="pct high">60.00%</span> · ' +
                '2 full <span class="pct low">40.00%</span>',
        );
        expect(html).toContain('<span class="fill high" style="width:50.00%">');
        // The sidebar tree stays lean — no stats, just names.
        expect(html).not.toContain('class="tree-stats"');
    });

    test("section options remove their content", () => {
        const html = buildReadableReportHtml([createNestedReadout()], {
            description: false,
            motivation: false,
            tierTags: false,
            axes: false,
            goals: false,
            bucketCounts: false,
        });
        expect(html).not.toContain("Toys chewed per breed");
        expect(html).not.toContain("Motivation:");
        expect(html).not.toContain("Tier ");
        expect(html).not.toContain('<table class="axes">');
        expect(html).not.toContain('<table class="goals">');
        expect(html).not.toContain("Buckets:");
        // Group container cards remain (without prose), and names always remain.
        expect(html).toContain('<span class="badge">covergroup</span>');
        expect(html).not.toContain("Top level coverage");
        expect(html).toContain(
            '<span class="crumb">top.dogs.</span><span class="leaf">chew_toys</span>',
        );
    });

    test("axisValues=false lists counts instead of values", () => {
        const html = buildReadableReportHtml([createNestedReadout()], {
            axisValues: false,
        });
        expect(html).toContain("<th class='num'>Count</th></tr>");
        expect(html).toContain('<td class="num">3</td>');
        expect(html).not.toContain("<code>ball</code>");
    });

    test("caps axis values in the table", () => {
        const html = buildReadableReportHtml([createNestedReadout()], {
            maxAxisValues: 2,
        });
        expect(html).toContain(
            '<code>ball</code>, <code>rope</code>, <span class="muted">+1 more</span>',
        );
    });

    test("escapes HTML in user-provided text", () => {
        const html = buildReadableReportHtml([
            createNestedReadout({
                leafName: "chew<b>&toys",
                leafDescription: 'Says "<script>"',
            }),
        ]);
        expect(html).toContain("chew&lt;b&gt;&amp;toys");
        expect(html).toContain("Says &quot;&lt;script&gt;&quot;");
        // The report's own enhancement script exists, but user text must
        // never reach the page unescaped.
        expect(html).not.toContain('Says "<script>');
    });

    test("sibling covergroups alternate shades", () => {
        // root (group) > g1 (group) > leaf_a, and g2 (group) > leaf_b:
        // g1 and g2 are siblings at the same depth and must differ in shade.
        const leafRanges = (idx: number) => ({
            axis_start: idx,
            axis_end: idx + 1,
            axis_value_start: idx * 2,
            axis_value_end: idx * 2 + 2,
            goal_start: idx,
            goal_end: idx + 1,
            bucket_start: idx * 2,
            bucket_end: idx * 2 + 2,
            target: 10,
            target_buckets: 2,
        });
        const readout = new InMemoryReadout({
            defSha: "def-sib",
            recSha: "rec-sib",
            source: "siblings",
            sourceKey: "",
            bucketVersion: "",
            points: [
                {
                    start: 0,
                    depth: 0,
                    end: 5,
                    axis_start: 0,
                    axis_end: 2,
                    axis_value_start: 0,
                    axis_value_end: 4,
                    goal_start: 0,
                    goal_end: 2,
                    bucket_start: 0,
                    bucket_end: 4,
                    target: 20,
                    target_buckets: 4,
                    name: "root",
                    description: "",
                },
                { start: 1, depth: 1, end: 3, ...leafRanges(0), name: "g1", description: "" },
                { start: 2, depth: 2, end: 3, ...leafRanges(0), name: "leaf_a", description: "" },
                { start: 3, depth: 1, end: 5, ...leafRanges(1), name: "g2", description: "" },
                { start: 4, depth: 2, end: 5, ...leafRanges(1), name: "leaf_b", description: "" },
            ],
            bucketGoals: [0, 0, 1, 1].map((goal, start) => ({ start, goal })),
            axes: [0, 1].map((idx) => ({
                start: idx,
                value_start: idx * 2,
                value_end: idx * 2 + 2,
                name: `ax${idx}`,
                description: "",
            })),
            axisValues: ["a", "b", "c", "d"].map((value, start) => ({ start, value })),
            goals: [0, 1].map((idx) => ({
                start: idx,
                target: 5,
                name: "DEFAULT",
                description: "",
            })),
            pointHits: [
                { start: 0, depth: 0, hits: 0, hit_buckets: 0, full_buckets: 0 },
                { start: 1, depth: 1, hits: 0, hit_buckets: 0, full_buckets: 0 },
                { start: 2, depth: 2, hits: 0, hit_buckets: 0, full_buckets: 0 },
                { start: 3, depth: 1, hits: 0, hit_buckets: 0, full_buckets: 0 },
                { start: 4, depth: 2, hits: 0, hit_buckets: 0, full_buckets: 0 },
            ],
            bucketHits: [0, 0, 0, 0].map((hits, start) => ({ start, hits })),
        });

        const html = buildReadableReportHtml([readout]);
        expect(html).toContain('class="card group-card tint-0 shade-0"');
        expect(html).toContain('class="card group-card tint-1 shade-0"');
        expect(html).toContain('class="card group-card tint-1 shade-1"');
    });

    test("multiple readouts produce one section each", () => {
        const html = buildReadableReportHtml([
            createNestedReadout({ source: "run_a" }),
            createNestedReadout({ source: "run_b" }),
        ]);
        expect(html).toContain("<h2>run_a</h2>");
        expect(html).toContain("<h2>run_b</h2>");
    });

    test("serializeReportHtml composes with buildReportModel", () => {
        const model = buildReportModel([createNestedReadout()]);
        expect(serializeReportHtml(model)).toBe(
            buildReadableReportHtml([createNestedReadout()]),
        );
    });
});
