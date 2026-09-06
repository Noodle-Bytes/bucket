/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import type { TreeKey, TreeNode } from "./tree";

/** Decode stored point tags: JSON array first, comma-separated fallback. */
export function parsePointTags(tags: string | null | undefined): string[] {
    if (!tags) {
        return [];
    }
    try {
        const decoded: unknown = JSON.parse(tags);
        if (Array.isArray(decoded)) {
            return decoded
                .map((tag) => String(tag).trim())
                .filter((tag) => tag.length > 0);
        }
    } catch {
        // Fall back to legacy comma-separated format.
    }
    return tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
}

export type TreeSearchQuery = {
    /** Free-text fragments matched against node titles (AND). */
    nameTerms: string[];
    /** Completed `tag:` values; node must carry every tag (case-insensitive). */
    tags: string[];
    /** Completed `tier:` values; node tier must be one of these. */
    tiers: number[];
    /**
     * Incomplete `tag:<prefix>` at the end of the input (no trailing space).
     * Used for autocomplete; also soft-filters tags that contain the prefix.
     */
    tagPrefix: string | null;
    /**
     * Incomplete `tier:<prefix>` at the end of the input (no trailing space).
     * Used for autocomplete; also soft-filters matching tiers.
     */
    tierPrefix: string | null;
};

export type TreeSearchSuggestion =
    | { kind: "tag"; value: string }
    | { kind: "tier"; value: number };

const KEYWORD_RE = /^(tag|tier):(.*)$/i;

/**
 * Parse coverage-tree search text.
 *
 * Keywords: `tag:name`, `tier:N`. Remaining tokens are name substrings.
 * A trailing `tag:` / `tier:` / partial keyword (no space after) is exposed as
 * a prefix for autocomplete.
 */
export function parseTreeSearchQuery(raw: string): TreeSearchQuery {
    const empty: TreeSearchQuery = {
        nameTerms: [],
        tags: [],
        tiers: [],
        tagPrefix: null,
        tierPrefix: null,
    };
    const trimmed = raw.trim();
    if (!trimmed) {
        return empty;
    }

    // A trailing space means the last token is complete (e.g. `tag:flags `).
    const hasTrailingSpace = /\s$/.test(raw);
    const tokens = trimmed.split(/\s+/);
    const nameTerms: string[] = [];
    const tags: string[] = [];
    const tiers: number[] = [];
    let tagPrefix: string | null = null;
    let tierPrefix: string | null = null;

    tokens.forEach((token, index) => {
        const isLast = index === tokens.length - 1;
        const keyword = token.match(KEYWORD_RE);
        if (!keyword) {
            nameTerms.push(token);
            return;
        }

        const kind = keyword[1].toLowerCase();
        const value = keyword[2];

        if (kind === "tag") {
            if (isLast && !hasTrailingSpace) {
                tagPrefix = value;
                return;
            }
            if (value.length > 0) {
                tags.push(value);
            }
            return;
        }

        // tier:
        if (isLast && !hasTrailingSpace) {
            tierPrefix = value;
            return;
        }
        if (value.length === 0) {
            return;
        }
        const tier = Number(value);
        if (!Number.isNaN(tier)) {
            tiers.push(tier);
        }
    });

    return { nameTerms, tags, tiers, tagPrefix, tierPrefix };
}

export function treeSearchIsActive(query: TreeSearchQuery): boolean {
    return (
        query.nameTerms.length > 0
        || query.tags.length > 0
        || query.tiers.length > 0
        || (query.tagPrefix !== null && query.tagPrefix.length > 0)
        || (query.tierPrefix !== null && query.tierPrefix.length > 0)
    );
}

type PointLikeNode = TreeNode<{
    point?: { tags?: string | null; tier?: number | null };
}>;

function nodeTitle(node: TreeNode): string {
    return typeof node.title === "string" ? node.title : String(node.title ?? "");
}

function nodeTags(node: PointLikeNode): string[] {
    return parsePointTags(node.data?.point?.tags);
}

function nodeTier(node: PointLikeNode): number | null {
    const tier = node.data?.point?.tier;
    if (tier === null || tier === undefined || Number.isNaN(tier)) {
        return null;
    }
    return tier;
}

function tagEquals(a: string, b: string): boolean {
    return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}

function tagIncludes(tag: string, needle: string): boolean {
    return tag.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

function tierMatchesPrefix(tier: number, prefix: string): boolean {
    if (prefix.length === 0) {
        return true;
    }
    return String(tier).includes(prefix);
}

/** Whether this node itself satisfies the parsed query (not via descendants). */
export function nodeMatchesTreeSearch(node: PointLikeNode, query: TreeSearchQuery): boolean {
    if (!treeSearchIsActive(query)) {
        return true;
    }

    const title = nodeTitle(node);
    for (const term of query.nameTerms) {
        if (!title.includes(term)) {
            return false;
        }
    }

    const tags = nodeTags(node);
    for (const required of query.tags) {
        if (!tags.some((tag) => tagEquals(tag, required))) {
            return false;
        }
    }

    if (query.tagPrefix !== null && query.tagPrefix.length > 0) {
        if (!tags.some((tag) => tagIncludes(tag, query.tagPrefix!))) {
            return false;
        }
    }

    const tier = nodeTier(node);
    if (query.tiers.length > 0) {
        if (tier === null || !query.tiers.includes(tier)) {
            return false;
        }
    }

    if (query.tierPrefix !== null && query.tierPrefix.length > 0) {
        if (tier === null || !tierMatchesPrefix(tier, query.tierPrefix)) {
            return false;
        }
    }

    return true;
}

/**
 * Suggest tags for a partial prefix. Prefer prefix matches, then substring
 * matches; exact completed tags already in the query are omitted.
 */
export function suggestTagsForPrefix(
    allTags: Iterable<string>,
    prefix: string,
    alreadySelected: string[] = [],
    limit = 8,
): string[] {
    const selected = new Set(alreadySelected.map((t) => t.toLocaleLowerCase()));
    const needle = prefix.toLocaleLowerCase();
    const prefixHits: string[] = [];
    const containsHits: string[] = [];

    const unique = Array.from(
        new Map(Array.from(allTags, (tag) => [tag.toLocaleLowerCase(), tag])).values(),
    ).sort((a, b) => a.localeCompare(b));

    for (const tag of unique) {
        const lower = tag.toLocaleLowerCase();
        if (selected.has(lower)) {
            continue;
        }
        if (needle.length === 0) {
            prefixHits.push(tag);
            continue;
        }
        if (lower.startsWith(needle)) {
            prefixHits.push(tag);
        } else if (lower.includes(needle)) {
            containsHits.push(tag);
        }
    }

    return [...prefixHits, ...containsHits].slice(0, limit);
}

/** Suggest known tiers whose string form matches the prefix. */
export function suggestTiersForPrefix(
    allTiers: Iterable<number>,
    prefix: string,
    alreadySelected: number[] = [],
    limit = 8,
): number[] {
    const selected = new Set(alreadySelected);
    const sorted = Array.from(new Set(allTiers))
        .filter((tier) => !selected.has(tier))
        .sort((a, b) => a - b);

    if (prefix.length === 0) {
        return sorted.slice(0, limit);
    }

    return sorted.filter((tier) => String(tier).includes(prefix)).slice(0, limit);
}

/** Replace a trailing `tag:<prefix>` or free-text token with `tag:<tag> `. */
export function applyTagSuggestion(raw: string, tag: string): string {
    const tagMatch = raw.match(/^(.*?)(tag:)([^\s]*)$/i);
    if (tagMatch) {
        return `${tagMatch[1]}${tagMatch[2]}${tag} `;
    }
    // Typing normally: replace the trailing free-text token with a tag filter.
    const freeMatch = raw.match(/^(.*?)([^\s]+)$/);
    if (freeMatch && !KEYWORD_RE.test(freeMatch[2])) {
        return `${freeMatch[1]}tag:${tag} `;
    }
    const base = raw.replace(/\s+$/, "");
    return base.length > 0 ? `${base} tag:${tag} ` : `tag:${tag} `;
}

/** Replace a trailing `tier:<prefix>` with `tier:<n> `, or append after free text. */
export function applyTierSuggestion(raw: string, tier: number): string {
    const tierMatch = raw.match(/^(.*?)(tier:)([^\s]*)$/i);
    if (tierMatch) {
        return `${tierMatch[1]}${tierMatch[2]}${tier} `;
    }
    const freeMatch = raw.match(/^(.*?)([^\s]+)$/);
    if (freeMatch && !KEYWORD_RE.test(freeMatch[2])) {
        return `${freeMatch[1]}tier:${tier} `;
    }
    const base = raw.replace(/\s+$/, "");
    return base.length > 0 ? `${base} tier:${tier} ` : `tier:${tier} `;
}

/**
 * Build clickable autocomplete options for the current input.
 *
 * - `tag:…` → matching tags
 * - `tier:…` → matching tiers
 * - plain typing → matching tags (and tiers when the token looks numeric)
 */
export function buildTreeSearchSuggestions(
    raw: string,
    query: TreeSearchQuery,
    allTags: Iterable<string>,
    allTiers: Iterable<number>,
    limit = 8,
): TreeSearchSuggestion[] {
    if (query.tagPrefix !== null) {
        return suggestTagsForPrefix(allTags, query.tagPrefix, query.tags, limit).map(
            (value) => ({ kind: "tag" as const, value }),
        );
    }

    if (query.tierPrefix !== null) {
        return suggestTiersForPrefix(allTiers, query.tierPrefix, query.tiers, limit).map(
            (value) => ({ kind: "tier" as const, value }),
        );
    }

    // Plain typing: suggest from the trailing free-text token.
    if (/\s$/.test(raw) || query.nameTerms.length === 0) {
        return [];
    }
    const needle = query.nameTerms[query.nameTerms.length - 1] ?? "";
    if (needle.length === 0) {
        return [];
    }

    const suggestions: TreeSearchSuggestion[] = [];
    const tagHits = suggestTagsForPrefix(allTags, needle, query.tags, limit);
    for (const value of tagHits) {
        suggestions.push({ kind: "tag", value });
    }

    if (/^\d+$/.test(needle)) {
        const remaining = Math.max(0, limit - suggestions.length);
        for (const value of suggestTiersForPrefix(allTiers, needle, query.tiers, remaining)) {
            suggestions.push({ kind: "tier", value });
        }
    }

    return suggestions.slice(0, limit);
}

export function applyTreeSearchSuggestion(
    raw: string,
    suggestion: TreeSearchSuggestion,
): string {
    return suggestion.kind === "tag"
        ? applyTagSuggestion(raw, suggestion.value)
        : applyTierSuggestion(raw, suggestion.value);
}

/** Collect every distinct tag on coverpoints in the tree. */
export function collectTreeTags(walk: Iterable<[TreeNode, TreeNode | null]>): string[] {
    const byLower = new Map<string, string>();
    for (const [node] of walk) {
        for (const tag of nodeTags(node as PointLikeNode)) {
            const key = tag.toLocaleLowerCase();
            if (!byLower.has(key)) {
                byLower.set(key, tag);
            }
        }
    }
    return Array.from(byLower.values()).sort((a, b) => a.localeCompare(b));
}

/** Collect every distinct tier on coverpoints in the tree. */
export function collectTreeTiers(walk: Iterable<[TreeNode, TreeNode | null]>): number[] {
    const tiers = new Set<number>();
    for (const [node] of walk) {
        const tier = nodeTier(node as PointLikeNode);
        if (tier !== null) {
            tiers.add(tier);
        }
    }
    return Array.from(tiers).sort((a, b) => a - b);
}

/**
 * Keys of nodes that match, plus every ancestor key so the path stays visible
 * when the tree is pruned.
 */
export function matchingTreeKeysWithAncestors(
    walk: Iterable<[TreeNode, TreeNode | null]>,
    query: TreeSearchQuery,
): { matchKeys: Set<TreeKey>; expandKeys: Set<TreeKey> } {
    const matchKeys = new Set<TreeKey>();
    const expandKeys = new Set<TreeKey>();
    const parentByKey = new Map<TreeKey, TreeKey | null>();

    for (const [node, parent] of walk) {
        parentByKey.set(node.key, parent?.key ?? null);
        if (nodeMatchesTreeSearch(node as PointLikeNode, query)) {
            matchKeys.add(node.key);
        }
    }

    for (const key of matchKeys) {
        let parent = parentByKey.get(key) ?? null;
        while (parent !== null) {
            expandKeys.add(parent);
            parent = parentByKey.get(parent) ?? null;
        }
    }

    return { matchKeys, expandKeys };
}

/** Keep nodes that match or have a matching descendant. */
export function filterTreeToMatches<T>(
    nodes: TreeNode<T>[],
    matchKeys: Set<TreeKey>,
): TreeNode<T>[] {
    const filterNodes = (list: TreeNode<T>[]): TreeNode<T>[] => {
        const out: TreeNode<T>[] = [];
        for (const node of list) {
            const children = node.children ? filterNodes(node.children as TreeNode<T>[]) : undefined;
            const selfMatch = matchKeys.has(node.key);
            if (selfMatch || (children && children.length > 0)) {
                out.push({
                    ...node,
                    children: children && children.length > 0 ? children : node.children?.length ? [] : undefined,
                });
            }
        }
        return out;
    };
    return filterNodes(nodes);
}
