/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";

import type { TreeNode } from "./tree";
import {
    applyTagSuggestion,
    applyTierSuggestion,
    buildTreeSearchSuggestions,
    collectTreeTags,
    collectTreeTiers,
    filterTreeToMatches,
    matchingTreeKeysWithAncestors,
    nodeMatchesTreeSearch,
    parsePointTags,
    parseTreeSearchQuery,
    suggestTagsForPrefix,
    suggestTiersForPrefix,
    summaryFiltersFromTreeSearch,
    treeSearchIsActive,
} from "./treeSearch";

function pointNode(
    key: string,
    title: string,
    opts: { tags?: string; tier?: number | null; children?: TreeNode[] } = {},
): TreeNode {
    return {
        key,
        title,
        children: opts.children,
        data: {
            point: {
                tags: opts.tags ?? "",
                tier: opts.tier ?? null,
            },
        },
    };
}

describe("parsePointTags", () => {
    test("parses JSON and comma-separated tags", () => {
        expect(parsePointTags('["uart","axi"]')).toEqual(["uart", "axi"]);
        expect(parsePointTags("uart, axi")).toEqual(["uart", "axi"]);
        expect(parsePointTags("")).toEqual([]);
    });
});

describe("summaryFiltersFromTreeSearch", () => {
    test("drives Summary filters from completed tag/tier keywords only", () => {
        expect(summaryFiltersFromTreeSearch(parseTreeSearchQuery("compare"))).toEqual({
            drives: false,
            tags: [],
            tiers: [],
            tagMatchMode: "any",
        });
        expect(summaryFiltersFromTreeSearch(parseTreeSearchQuery("tag:fl"))).toEqual({
            drives: false,
            tags: [],
            tiers: [],
            tagMatchMode: "any",
        });
        expect(
            summaryFiltersFromTreeSearch(parseTreeSearchQuery("tag:flags tier:2 ")),
        ).toEqual({
            drives: true,
            tags: ["flags"],
            tiers: [2],
            tagMatchMode: "any",
        });
        expect(
            summaryFiltersFromTreeSearch(
                parseTreeSearchQuery("tag:flags tag:compare "),
            ),
        ).toEqual({
            drives: true,
            tags: ["flags", "compare"],
            tiers: [],
            tagMatchMode: "all",
        });
    });
});

describe("parseTreeSearchQuery", () => {
    test("parses name terms with tag and tier keywords", () => {
        expect(parseTreeSearchQuery("tag:flags tier:2 compare")).toEqual({
            nameTerms: ["compare"],
            tags: ["flags"],
            tiers: [2],
            tagPrefix: null,
            tierPrefix: null,
        });
        expect(parseTreeSearchQuery("compare tag:flags tier:2 ")).toEqual({
            nameTerms: ["compare"],
            tags: ["flags"],
            tiers: [2],
            tagPrefix: null,
            tierPrefix: null,
        });
    });

    test("exposes trailing incomplete tag: and tier: as prefixes", () => {
        expect(parseTreeSearchQuery("tag:fl")).toEqual({
            nameTerms: [],
            tags: [],
            tiers: [],
            tagPrefix: "fl",
            tierPrefix: null,
        });
        expect(parseTreeSearchQuery("tier:1")).toEqual({
            nameTerms: [],
            tags: [],
            tiers: [],
            tagPrefix: null,
            tierPrefix: "1",
        });
        expect(parseTreeSearchQuery("tier:1 tag:")).toEqual({
            nameTerms: [],
            tags: [],
            tiers: [1],
            tagPrefix: "",
            tierPrefix: null,
        });
    });

    test("completed tag tokens keep exact filters when spaced", () => {
        expect(parseTreeSearchQuery("tag:flags ")).toEqual({
            nameTerms: [],
            tags: ["flags"],
            tiers: [],
            tagPrefix: null,
            tierPrefix: null,
        });
    });
});

describe("nodeMatchesTreeSearch", () => {
    const leaf = pointNode("p", "flag_generation", {
        tags: '["compare","flags"]',
        tier: 2,
    });

    test("matches name, tag, and tier together", () => {
        expect(
            nodeMatchesTreeSearch(leaf, parseTreeSearchQuery("flag tag:compare tier:2 ")),
        ).toBe(true);
        expect(nodeMatchesTreeSearch(leaf, parseTreeSearchQuery("tag:missing"))).toBe(
            false,
        );
        expect(nodeMatchesTreeSearch(leaf, parseTreeSearchQuery("tier:1 "))).toBe(false);
    });

    test("soft-matches tag and tier prefixes while typing", () => {
        expect(nodeMatchesTreeSearch(leaf, parseTreeSearchQuery("tag:fla"))).toBe(true);
        expect(nodeMatchesTreeSearch(leaf, parseTreeSearchQuery("tag:xyz"))).toBe(false);
        expect(nodeMatchesTreeSearch(leaf, parseTreeSearchQuery("tier:2"))).toBe(true);
        expect(nodeMatchesTreeSearch(leaf, parseTreeSearchQuery("tier:9"))).toBe(false);
    });
});

describe("suggestTagsForPrefix", () => {
    test("prefers prefix hits and skips already selected tags", () => {
        expect(
            suggestTagsForPrefix(["compare", "flags", "control", "flow"], "f", [
                "flags",
            ]),
        ).toEqual(["flow"]);
        expect(suggestTagsForPrefix(["compare", "flags"], "ag")).toEqual(["flags"]);
    });
});

describe("suggestTiersForPrefix", () => {
    test("filters known tiers by prefix", () => {
        expect(suggestTiersForPrefix([0, 1, 2, 12], "1")).toEqual([1, 12]);
        expect(suggestTiersForPrefix([0, 1, 2], "", [1])).toEqual([0, 2]);
    });
});

describe("apply suggestions", () => {
    test("replaces trailing tag prefix or free text", () => {
        expect(applyTagSuggestion("tag:fl", "flags")).toBe("tag:flags ");
        expect(applyTagSuggestion("x tag:fl", "flags")).toBe("x tag:flags ");
        expect(applyTagSuggestion("fla", "flags")).toBe("tag:flags ");
        expect(applyTagSuggestion("compare fla", "flags")).toBe("compare tag:flags ");
    });

    test("replaces trailing tier prefix", () => {
        expect(applyTierSuggestion("tier:1", 12)).toBe("tier:12 ");
        expect(applyTierSuggestion("x tier:", 2)).toBe("x tier:2 ");
    });
});

describe("buildTreeSearchSuggestions", () => {
    const tags = ["compare", "flags", "control"];
    const tiers = [0, 1, 2];

    test("suggests tags for tag: and free text, tiers for tier:", () => {
        expect(
            buildTreeSearchSuggestions("tag:fl", parseTreeSearchQuery("tag:fl"), tags, tiers),
        ).toEqual([{ kind: "tag", value: "flags" }]);

        expect(
            buildTreeSearchSuggestions("tier:", parseTreeSearchQuery("tier:"), tags, tiers),
        ).toEqual([
            { kind: "tier", value: 0 },
            { kind: "tier", value: 1 },
            { kind: "tier", value: 2 },
        ]);

        expect(
            buildTreeSearchSuggestions("fla", parseTreeSearchQuery("fla"), tags, tiers),
        ).toEqual([{ kind: "tag", value: "flags" }]);

        expect(
            buildTreeSearchSuggestions("2", parseTreeSearchQuery("2"), tags, tiers),
        ).toEqual([{ kind: "tier", value: 2 }]);
    });
});

describe("tree filter helpers", () => {
    test("collects tags/tiers and prunes to matching paths", () => {
        const root = pointNode("root", "StressTest", {
            children: [
                pointNode("g", "compare", {
                    children: [
                        pointNode("a", "flag_generation", {
                            tags: '["flags"]',
                            tier: 2,
                        }),
                        pointNode("b", "compare_operations", {
                            tags: '["compare"]',
                            tier: 1,
                        }),
                    ],
                }),
            ],
        });

        function* walk(
            nodes: TreeNode[] = [root],
            parent: TreeNode | null = null,
        ): Generator<[TreeNode, TreeNode | null]> {
            for (const node of nodes) {
                yield [node, parent];
                if (node.children) {
                    yield* walk(node.children, node);
                }
            }
        }

        expect(collectTreeTags(walk())).toEqual(["compare", "flags"]);
        expect(collectTreeTiers(walk())).toEqual([1, 2]);

        const query = parseTreeSearchQuery("tag:flags ");
        expect(treeSearchIsActive(query)).toBe(true);
        const { matchKeys, expandKeys } = matchingTreeKeysWithAncestors(walk(), query);
        expect(matchKeys.has("a")).toBe(true);
        expect(matchKeys.has("b")).toBe(false);
        expect(expandKeys.has("g")).toBe(true);
        expect(expandKeys.has("root")).toBe(true);

        const filtered = filterTreeToMatches([root], matchKeys);
        expect(filtered).toHaveLength(1);
        expect(filtered[0].children?.[0].children?.map((n) => n.key)).toEqual(["a"]);
    });
});
