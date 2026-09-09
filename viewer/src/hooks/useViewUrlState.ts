/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Tree, { type TreeKey } from "../features/Dashboard/lib/tree";
import type { UseCoverageCompareResult } from "@/hooks/useCoverageCompare";
import type { CoverageRecord, CoverageSourceRef } from "@/types/coverageSession";
import {
    getNodeIdentity,
    getRecordIdentity,
    parseViewUrlState,
    resolveNodeKey,
    resolveRecordId,
    serializeViewUrlState,
    type ViewUrlState,
    type ViewUrlView,
} from "@/services/viewUrlState";

export type SummaryViewMode = "table" | "donut";

export type UseViewUrlStateOptions = {
    tree: Tree;
    records: CoverageRecord[];
    sources: CoverageSourceRef[];
    compare?: UseCoverageCompareResult;
    selectedTreeKeys: TreeKey[];
    /** Content view of the selected node: `Summary`, `Point` or `Pivot`. */
    currentContentKey: string | number;
    summaryViewMode: SummaryViewMode;
    treeSearchValue: string;
    /** Select a node the same way a click in the tree would (expands ancestors, records history). */
    onSelectNode: (keys: TreeKey[]) => void;
    onSetContentView: (key: TreeKey, view: string) => void;
    setSummaryViewMode: (mode: SummaryViewMode) => void;
    setTreeSearchValue: (value: string) => void;
};

export type UseViewUrlStateResult = {
    /** Copy the current view's URL to the clipboard. Resolves `true` on success. */
    copyLink: () => Promise<boolean>;
};

type PendingApply = {
    state: ViewUrlState;
    /**
     * `true` for the URL the page was opened with: parameters that are absent
     * leave the current state alone. For later browser navigation (back /
     * forward) an absent parameter means "back to the default".
     */
    initial: boolean;
    /** Whether compare mode has already been requested for this pending state. */
    compareRequested: boolean;
    /** Renders spent waiting for compare mode to settle before giving up. */
    compareWaits: number;
};

/** Give compare a few renders to activate before applying the rest of the URL anyway. */
const MAX_COMPARE_WAITS = 4;

function stripQuestionMark(search: string): string {
    return search.startsWith("?") ? search.slice(1) : search;
}

async function writeClipboard(text: string): Promise<boolean> {
    try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // fall through to the legacy path
    }
    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        textarea.remove();
        return ok;
    } catch {
        return false;
    }
}

function contentViewToUrlView(contentKey: string | number, summaryMode: SummaryViewMode): ViewUrlView | undefined {
    switch (contentKey) {
        case "Summary":
            return summaryMode;
        case "Point":
            return "point";
        case "Pivot":
            return "pivot";
        default:
            return undefined;
    }
}

/**
 * Mirror the main view state (selected node, view mode, search, compare) into
 * the URL query string, and apply the query string back to the view once the
 * coverage tree exists. Node changes push a history entry; everything else
 * replaces the current one.
 */
export function useViewUrlState({
    tree,
    records,
    sources,
    compare,
    selectedTreeKeys,
    currentContentKey,
    summaryViewMode,
    treeSearchValue,
    onSelectNode,
    onSetContentView,
    setSummaryViewMode,
    setTreeSearchValue,
}: UseViewUrlStateOptions): UseViewUrlStateResult {
    const location = useLocation();
    const navigate = useNavigate();
    const currentSearch = stripQuestionMark(location.search);

    const pendingRef = useRef<PendingApply | null>(null);
    /** The last query we wrote (or acknowledged); `null` until the first location is seen. */
    const lastSeenSearchRef = useRef<string | null>(null);
    const lastNodeParamRef = useRef<string | null>(null);
    const replaceNextWriteRef = useRef(false);
    /** Bumped after a URL has been applied so the write effect runs even if no state changed. */
    const [appliedTick, setAppliedTick] = useState(0);

    const isEmpty = tree.getRoots().length === 0;
    const compareActive = compare?.active ?? false;
    const compareRecordIdA = compare?.recordIdA ?? null;
    const compareRecordIdB = compare?.recordIdB ?? null;
    const compareSetMode = compare?.setMode;
    const compareDefinition = compare?.definition;

    // 1. Detect URL changes that did not come from this hook (page load, back / forward).
    useEffect(() => {
        if (lastSeenSearchRef.current === currentSearch) {
            return;
        }
        const initial = lastSeenSearchRef.current === null;
        lastSeenSearchRef.current = currentSearch;
        pendingRef.current = {
            state: parseViewUrlState(currentSearch),
            initial,
            compareRequested: false,
            compareWaits: 0,
        };
    }, [currentSearch]);

    // 2. Encode the current state.
    const encoded = useMemo(() => {
        if (isEmpty) {
            return null;
        }
        const key = selectedTreeKeys[0];
        const identity =
            key !== undefined && key !== Tree.ROOT ? getNodeIdentity(tree, key) : null;
        const state: ViewUrlState = {
            nodePath: identity?.path,
            nodeRecordIndex: identity?.recordIndex,
            view: contentViewToUrlView(currentContentKey, summaryViewMode),
            search: treeSearchValue || undefined,
        };
        if (compareActive) {
            const recordA = records.find((record) => record.id === compareRecordIdA);
            const recordB = records.find((record) => record.id === compareRecordIdB);
            state.compare = {
                active: true,
                setMode: compareSetMode,
                definition: compareDefinition,
                recordA: recordA ? getRecordIdentity(recordA, sources) ?? undefined : undefined,
                recordB: recordB ? getRecordIdentity(recordB, sources) ?? undefined : undefined,
            };
        }
        return {
            search: serializeViewUrlState(state),
            nodeParam: identity ? `${identity.recordIndex}:${identity.path}` : null,
        };
    }, [
        isEmpty,
        tree,
        selectedTreeKeys,
        currentContentKey,
        summaryViewMode,
        treeSearchValue,
        compareActive,
        compareRecordIdA,
        compareRecordIdB,
        compareSetMode,
        compareDefinition,
        records,
        sources,
    ]);

    // 3. State -> URL. Declared before the apply effect so a freshly detected
    //    external change is never overwritten by stale state in the same commit.
    useEffect(() => {
        if (pendingRef.current) {
            return;
        }
        if (encoded === null) {
            // No coverage loaded: drop stale parameters, but never touch a URL
            // we have not written to (it may be a link waiting for data).
            if (lastSeenSearchRef.current !== null && currentSearch !== "") {
                lastSeenSearchRef.current = "";
                lastNodeParamRef.current = null;
                navigate({ search: "" }, { replace: true });
            }
            return;
        }
        const nodeChanged = lastNodeParamRef.current !== encoded.nodeParam;
        lastNodeParamRef.current = encoded.nodeParam;
        if (encoded.search === currentSearch) {
            lastSeenSearchRef.current = encoded.search;
            replaceNextWriteRef.current = false;
            return;
        }
        const replace = replaceNextWriteRef.current || !nodeChanged;
        replaceNextWriteRef.current = false;
        lastSeenSearchRef.current = encoded.search;
        navigate({ search: encoded.search ? `?${encoded.search}` : "" }, { replace });
    }, [encoded, currentSearch, navigate, appliedTick]);

    // 4. URL -> state, once the tree exists. Compare mode is applied first
    //    because activating it rebuilds the tree the node is looked up in.
    useEffect(() => {
        const pending = pendingRef.current;
        if (!pending || isEmpty) {
            return;
        }
        const { state, initial } = pending;

        if (compare) {
            const wantActive = state.compare?.active ?? (initial ? compare.active : false);
            if (!pending.compareRequested) {
                pending.compareRequested = true;
                if (wantActive && compare.canCompare) {
                    const wanted = state.compare;
                    const idA = wanted?.recordA
                        ? resolveRecordId(wanted.recordA, records, sources)
                        : undefined;
                    const idB = wanted?.recordB
                        ? resolveRecordId(wanted.recordB, records, sources)
                        : undefined;
                    let changed = false;
                    if (idA && compare.compatibleRecordIds.includes(idA) && idA !== compare.recordIdA) {
                        compare.setRecordIdA(idA);
                        changed = true;
                    }
                    if (idB && compare.compatibleRecordIds.includes(idB) && idB !== compare.recordIdB) {
                        compare.setRecordIdB(idB);
                        changed = true;
                    }
                    if (wanted?.setMode) {
                        compare.setSetMode(wanted.setMode);
                    } else if (!initial) {
                        compare.setSetMode("all");
                    }
                    if (wanted?.definition) {
                        compare.setDefinition(wanted.definition);
                    } else if (!initial) {
                        compare.setDefinition("any_hit");
                    }
                    if (!compare.active) {
                        compare.setActive(true);
                        changed = true;
                    }
                    if (changed) {
                        return; // wait for the compare tree
                    }
                } else if (!wantActive && compare.active) {
                    compare.setActive(false);
                    return; // wait for the plain tree
                }
            } else {
                const settled = wantActive
                    ? compare.active || !compare.canCompare
                    : !compare.active;
                if (!settled && pending.compareWaits < MAX_COMPARE_WAITS) {
                    pending.compareWaits += 1;
                    return;
                }
            }
        }

        pendingRef.current = null;
        replaceNextWriteRef.current = true;
        setAppliedTick((tick) => tick + 1);

        let targetKey: TreeKey | undefined;
        if (state.nodePath) {
            targetKey = resolveNodeKey(tree, state.nodePath, state.nodeRecordIndex);
            if (targetKey !== undefined) {
                onSelectNode([targetKey]);
            }
        } else if (!initial) {
            targetKey = Tree.ROOT;
            onSelectNode([]);
        }
        const viewKey = targetKey ?? selectedTreeKeys[0] ?? Tree.ROOT;
        const availableViews = tree.getViewsByKey(viewKey).map((view) => String(view.value));

        switch (state.view) {
            case "donut":
            case "table":
                setSummaryViewMode(state.view);
                break;
            case "pivot":
            case "point": {
                const contentView = state.view === "pivot" ? "Pivot" : "Point";
                if (availableViews.includes(contentView)) {
                    onSetContentView(viewKey, contentView);
                }
                break;
            }
            default:
                if (!initial) {
                    setSummaryViewMode("table");
                    if (availableViews.includes("Point")) {
                        onSetContentView(viewKey, "Point");
                    }
                }
        }

        if (state.search !== undefined) {
            setTreeSearchValue(state.search);
        } else if (!initial) {
            setTreeSearchValue("");
        }
    }, [
        currentSearch,
        isEmpty,
        tree,
        records,
        sources,
        compare,
        selectedTreeKeys,
        onSelectNode,
        onSetContentView,
        setSummaryViewMode,
        setTreeSearchValue,
    ]);

    const copyLink = useCallback(async () => {
        if (typeof window === "undefined") {
            return false;
        }
        return writeClipboard(window.location.href);
    }, []);

    return { copyLink };
}
