/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

/**
 * Encode / decode the viewer's main view state as URL query parameters so a
 * link can be copied and reopened on the same view.
 *
 * Parameter names are kept short and defaults are omitted:
 *
 * | Param | Meaning                                                        |
 * | ----- | -------------------------------------------------------------- |
 * | `n`   | Selected tree node as a dotted point path, e.g. `top.dogs`.    |
 * |       | When several records are loaded a `~<index>` suffix names the  |
 * |       | loaded record (0-based, omitted when 0): `top.dogs~1`.         |
 * | `v`   | View: `donut` (summary) or `pivot` (coverpoint). Defaults      |
 * |       | (`table` / `point`) are omitted.                               |
 * | `q`   | Tree search text.                                              |
 * | `c`   | `1` when compare mode is active.                               |
 * | `cs`  | Compare set filter (`a_only`, `both`, `b_only`, `neither`,   |
 * |       | `all`).                                                      |
 * | `cd`  | Compare coverage definition (`met_goal`).                      |
 * | `ca`  | Compare record A as `<source label>~<record index>`.           |
 * | `cb`  | Compare record B, same form as `ca`.                           |
 *
 * Unknown or unparseable values are ignored.
 */

import type Tree from "../features/Dashboard/lib/tree";
import type { TreeKey, TreeNode } from "../features/Dashboard/lib/tree";
import type { CompareSetMode, CoverageDefinition } from "@/types/coverageCompare";
import type { CoverageRecord, CoverageSourceRef } from "@/types/coverageSession";

export const VIEW_URL_PARAM = {
    node: "n",
    view: "v",
    search: "q",
    compare: "c",
    compareSetMode: "cs",
    compareDefinition: "cd",
    compareRecordA: "ca",
    compareRecordB: "cb",
} as const;

export type ViewUrlView = "table" | "donut" | "point" | "pivot";

export type ViewUrlCompareState = {
    active: boolean;
    setMode?: CompareSetMode;
    definition?: CoverageDefinition;
    recordA?: string;
    recordB?: string;
};

export type ViewUrlState = {
    /** Dotted point path of the selected node (undefined = root / nothing). */
    nodePath?: string;
    /** Index of the loaded record the node belongs to (0 when omitted). */
    nodeRecordIndex?: number;
    view?: ViewUrlView;
    search?: string;
    compare?: ViewUrlCompareState;
};

const COMPARE_SET_MODES: readonly CompareSetMode[] = ["a_only", "both", "b_only", "neither", "all"];
const COVERAGE_DEFINITIONS: readonly CoverageDefinition[] = ["any_hit", "met_goal"];
const VIEWS: readonly ViewUrlView[] = ["table", "donut", "point", "pivot"];

const PATH_SEPARATOR = ".";
const INDEX_SEPARATOR = "~";

type PointLike = { name?: unknown };
type NodeDataLike = { point?: PointLike; readout?: unknown };

function nodeName(node: TreeNode): string | null {
    const data = node.data as NodeDataLike | undefined;
    const name = data?.point?.name;
    return typeof name === "string" ? name : null;
}

function nodeReadout(node: TreeNode): unknown {
    return (node.data as NodeDataLike | undefined)?.readout;
}

/** Distinct readouts in root order, so a root's index names the loaded record. */
function rootReadoutIndexes(tree: Tree): Map<TreeNode, number> {
    const indexes = new Map<TreeNode, number>();
    const seen: unknown[] = [];
    for (const root of tree.getRoots()) {
        const readout = nodeReadout(root);
        let index = seen.indexOf(readout);
        if (index < 0) {
            index = seen.length;
            seen.push(readout);
        }
        indexes.set(root, index);
    }
    return indexes;
}

/** Split a `<value>~<index>` string. A missing or malformed suffix means index 0. */
export function splitIndexedIdentity(value: string): { base: string; index: number } {
    const match = /^(.*)~(\d+)$/.exec(value);
    if (!match) {
        return { base: value, index: 0 };
    }
    return { base: match[1], index: Number(match[2]) };
}

export function joinIndexedIdentity(base: string, index: number): string {
    return index > 0 ? `${base}${INDEX_SEPARATOR}${index}` : base;
}

export type NodeIdentity = { path: string; recordIndex: number };

/**
 * Human-readable identity of a tree node: the dotted path of point names from
 * its root, plus the index of the loaded record it belongs to.
 */
export function getNodeIdentity(tree: Tree, key: TreeKey): NodeIdentity | null {
    const ancestors = tree.getAncestorsByKey(key);
    if (ancestors.length === 0) {
        return null;
    }
    const names: string[] = [];
    for (const ancestor of ancestors) {
        const name = nodeName(ancestor);
        if (name === null) {
            return null;
        }
        names.push(name);
    }
    const recordIndex = rootReadoutIndexes(tree).get(ancestors[0]) ?? 0;
    return { path: names.join(PATH_SEPARATOR), recordIndex };
}

/**
 * Find the key of the node at a dotted path. When `recordIndex` is given the
 * roots of that loaded record are tried first, falling back to any record so
 * a link still resolves after records are reordered.
 */
export function resolveNodeKey(
    tree: Tree,
    path: string,
    recordIndex: number = 0,
): TreeKey | undefined {
    const parts = path.split(PATH_SEPARATOR);
    if (parts.length === 0 || parts[0] === "") {
        return undefined;
    }
    const indexes = rootReadoutIndexes(tree);
    const roots = tree.getRoots();
    const preferred = roots.filter((root) => indexes.get(root) === recordIndex);
    const others = roots.filter((root) => indexes.get(root) !== recordIndex);
    for (const root of [...preferred, ...others]) {
        if (nodeName(root) !== parts[0]) {
            continue;
        }
        let node: TreeNode | undefined = root;
        for (const part of parts.slice(1)) {
            const children = node.children as TreeNode[] | undefined;
            node = children?.find((child) => nodeName(child) === part);
            if (!node) {
                break;
            }
        }
        if (node) {
            return node.key;
        }
    }
    return undefined;
}

/** Whether the tree holds more than one loaded record (so `~index` is meaningful). */
export function treeHasMultipleRecords(tree: Tree): boolean {
    return new Set(rootReadoutIndexes(tree).values()).size > 1;
}

/** Stable identity of a record for links: `<source label>~<record index>`. */
export function getRecordIdentity(
    record: CoverageRecord,
    sources: CoverageSourceRef[],
): string | null {
    const source = sources.find((item) => item.id === record.sourceRef);
    if (!source) {
        return null;
    }
    return joinIndexedIdentity(source.label, record.sourceRecordIndex);
}

export function resolveRecordId(
    identity: string,
    records: CoverageRecord[],
    sources: CoverageSourceRef[],
): string | undefined {
    const { base, index } = splitIndexedIdentity(identity);
    const sourceIds = new Set(
        sources.filter((source) => source.label === base).map((source) => source.id),
    );
    if (sourceIds.size === 0) {
        return undefined;
    }
    return records.find(
        (record) => sourceIds.has(record.sourceRef) && record.sourceRecordIndex === index,
    )?.id;
}

/**
 * Serialise a query value. `encodeURIComponent` leaves `~ . - _` alone, and a
 * few characters that are common in labels are kept readable too.
 */
function encodeQueryValue(value: string): string {
    return encodeURIComponent(value)
        .replace(/%20/g, "+")
        .replace(/%3A/gi, ":")
        .replace(/%2F/gi, "/")
        .replace(/%2C/gi, ",")
        .replace(/%40/gi, "@");
}

/** Build the query string (without leading `?`) for a view state. */
export function serializeViewUrlState(state: ViewUrlState): string {
    const entries: Array<[string, string]> = [];
    if (state.nodePath) {
        entries.push([
            VIEW_URL_PARAM.node,
            joinIndexedIdentity(state.nodePath, state.nodeRecordIndex ?? 0),
        ]);
    }
    if (state.view === "donut" || state.view === "pivot") {
        entries.push([VIEW_URL_PARAM.view, state.view]);
    }
    if (state.search) {
        entries.push([VIEW_URL_PARAM.search, state.search]);
    }
    const compare = state.compare;
    if (compare?.active) {
        entries.push([VIEW_URL_PARAM.compare, "1"]);
        if (compare.setMode && compare.setMode !== "all") {
            entries.push([VIEW_URL_PARAM.compareSetMode, compare.setMode]);
        }
        if (compare.definition && compare.definition !== "any_hit") {
            entries.push([VIEW_URL_PARAM.compareDefinition, compare.definition]);
        }
        if (compare.recordA) {
            entries.push([VIEW_URL_PARAM.compareRecordA, compare.recordA]);
        }
        if (compare.recordB) {
            entries.push([VIEW_URL_PARAM.compareRecordB, compare.recordB]);
        }
    }
    return entries
        .map(([key, value]) => `${key}=${encodeQueryValue(value)}`)
        .join("&");
}

function pickEnum<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
    if (value === null) {
        return undefined;
    }
    return allowed.includes(value as T) ? (value as T) : undefined;
}

/** Parse a query string / URLSearchParams into a view state, ignoring junk. */
export function parseViewUrlState(search: string | URLSearchParams): ViewUrlState {
    const params = typeof search === "string" ? new URLSearchParams(search) : search;
    const state: ViewUrlState = {};

    const node = params.get(VIEW_URL_PARAM.node);
    if (node) {
        const { base, index } = splitIndexedIdentity(node);
        if (base) {
            state.nodePath = base;
            state.nodeRecordIndex = index;
        }
    }

    const view = pickEnum(params.get(VIEW_URL_PARAM.view), VIEWS);
    if (view) {
        state.view = view;
    }

    const searchText = params.get(VIEW_URL_PARAM.search);
    if (searchText) {
        state.search = searchText;
    }

    const compareFlag = params.get(VIEW_URL_PARAM.compare);
    if (compareFlag !== null) {
        const active = compareFlag === "1" || compareFlag === "true";
        const compare: ViewUrlCompareState = { active };
        if (active) {
            compare.setMode = pickEnum(params.get(VIEW_URL_PARAM.compareSetMode), COMPARE_SET_MODES);
            compare.definition = pickEnum(
                params.get(VIEW_URL_PARAM.compareDefinition),
                COVERAGE_DEFINITIONS,
            );
            compare.recordA = params.get(VIEW_URL_PARAM.compareRecordA) ?? undefined;
            compare.recordB = params.get(VIEW_URL_PARAM.compareRecordB) ?? undefined;
        }
        state.compare = compare;
    }

    return state;
}

/** True when the query string carries none of the view parameters. */
export function isViewUrlStateEmpty(state: ViewUrlState): boolean {
    return (
        state.nodePath === undefined
        && state.view === undefined
        && state.search === undefined
        && state.compare === undefined
    );
}
