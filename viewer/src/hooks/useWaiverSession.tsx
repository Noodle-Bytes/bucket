/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type PropsWithChildren,
} from "react";
import {
    emptyWaiverFile,
    parseWaiverFileText,
    serializeWaiverFile,
    type WaiverFileSpec,
    type WaiverSpec,
} from "@/services/waiverSpec";
import {
    matchWaiversWithReport,
    summariseApplyReport,
    isWaiverProblemStatus,
    type WaiverApplyReport,
} from "@/services/matchWaivers";
import { mergeWaiverSpecs, appendWaiverSpecsWithoutMerge, unionWaiverAxes } from "@/services/inferWaiverRules";
import { notifyError, notifySuccess } from "@/utils/themedStaticNotification";

function waiverFingerprint(file: WaiverFileSpec): string {
    return serializeWaiverFile(file, { includeDisabled: true });
}

type WaiverSessionValue = {
    file: WaiverFileSpec;
    fileName: string | null;
    panelOpen: boolean;
    setPanelOpen: (open: boolean) => void;
    creatingWaivers: boolean;
    setCreatingWaivers: (creating: boolean) => void;
    /** Dotted path of the coverpoint currently open in the viewer, if any. */
    activePointPath: string | null;
    setActivePointPath: (path: string | null) => void;
    /** Readouts currently loaded in the viewer (used for axis pickers / apply). */
    activeReadouts: Readout[];
    /** True when the draft differs from the last loaded/saved snapshot. */
    isDirty: boolean;
    report: WaiverApplyReport | null;
    setActiveReadouts: (readouts: Readout[]) => void;
    loadFromText: (text: string, fileName?: string) => void;
    clear: () => void;
    /** Call after a successful download/save so close no longer warns. */
    markSaved: () => void;
    setRuleDisabled: (index: number, disabled: boolean) => void;
    removeRule: (index: number) => WaiverSpec | null;
    restoreRule: (index: number, rule: WaiverSpec) => void;
    updateRule: (index: number, rule: WaiverSpec) => void;
    appendRules: (rules: WaiverSpec[], options?: { condense?: boolean }) => void;
    /** Replace a covered rule and the earlier rules that claimed its buckets with one merged rule. */
    mergeCoveredRule: (index: number, reason?: string) => void;
    disableAllProblems: () => void;
    removeDisabled: () => void;
    serialize: (includeDisabled: boolean) => string;
    applySummary: string | null;
    /** Last non-empty author entered when creating rules this session ("" until then). */
    lastAuthor: string;
};

const WaiverSessionContext = createContext<WaiverSessionValue | null>(null);

export function WaiverSessionProvider({ children }: PropsWithChildren) {
    const [file, setFile] = useState<WaiverFileSpec>(emptyWaiverFile);
    const [savedFingerprint, setSavedFingerprint] = useState(() =>
        waiverFingerprint(emptyWaiverFile()),
    );
    const [fileName, setFileName] = useState<string | null>(null);
    const [panelOpen, setPanelOpen] = useState(false);
    const [creatingWaivers, setCreatingWaivers] = useState(false);
    const [activePointPath, setActivePointPath] = useState<string | null>(null);
    const [activeReadouts, setActiveReadoutsState] = useState<Readout[]>([]);
    const [lastAuthor, setLastAuthor] = useState("");

    const isDirty = useMemo(
        () => waiverFingerprint(file) !== savedFingerprint,
        [file, savedFingerprint],
    );

    const report = useMemo(() => {
        if (file.waivers.length === 0 || activeReadouts.length === 0) {
            return null;
        }
        // Diagnostics against the first loaded readout; matching is applied to all.
        return matchWaiversWithReport(activeReadouts[0], file);
    }, [file, activeReadouts]);

    const setActiveReadouts = useCallback((readouts: Readout[]) => {
        setActiveReadoutsState(readouts);
    }, []);

    const loadFromText = useCallback((text: string, name?: string) => {
        try {
            const parsed = parseWaiverFileText(text);
            setFile(parsed);
            setSavedFingerprint(waiverFingerprint(parsed));
            setFileName(name ?? "waivers.json");
            setPanelOpen(true);
            notifySuccess({
                message: "Waivers loaded",
                description: `${parsed.waivers.length} rule${parsed.waivers.length === 1 ? "" : "s"} from ${name ?? "file"}`,
            });
        } catch (error) {
            notifyError({
                message: "Could not load waivers",
                description: error instanceof Error ? error.message : String(error),
            });
        }
    }, []);

    const clear = useCallback(() => {
        const empty = emptyWaiverFile();
        setFile(empty);
        setSavedFingerprint(waiverFingerprint(empty));
        setFileName(null);
        setCreatingWaivers(false);
    }, []);

    const markSaved = useCallback(() => {
        setSavedFingerprint(waiverFingerprint(file));
    }, [file]);

    const setRuleDisabled = useCallback((index: number, disabled: boolean) => {
        setFile((prev) => ({
            waivers: prev.waivers.map((rule, i) =>
                i === index ? { ...rule, disabled } : rule,
            ),
        }));
    }, []);

    const removeRule = useCallback((index: number): WaiverSpec | null => {
        let removed: WaiverSpec | null = null;
        setFile((prev) => {
            removed = prev.waivers[index] ?? null;
            return {
                waivers: prev.waivers.filter((_, i) => i !== index),
            };
        });
        return removed;
    }, []);

    const restoreRule = useCallback((index: number, rule: WaiverSpec) => {
        setFile((prev) => {
            const waivers = [...prev.waivers];
            waivers.splice(Math.min(index, waivers.length), 0, rule);
            return { waivers };
        });
    }, []);

    const updateRule = useCallback((index: number, rule: WaiverSpec) => {
        setFile((prev) => {
            if (index < 0 || index >= prev.waivers.length) {
                return prev;
            }
            const waivers = [...prev.waivers];
            waivers[index] = rule;
            return { waivers };
        });
        const author = rule.author.trim();
        if (author) {
            setLastAuthor(author);
        }
        notifySuccess({ message: "Waiver rule updated" });
    }, []);

    const appendRules = useCallback((
        rules: WaiverSpec[],
        options: { condense?: boolean } = {},
    ) => {
        if (rules.length === 0) {
            return;
        }
        const condense = options.condense !== false;
        const author = rules.map((rule) => rule.author.trim()).find((value) => value.length > 0);
        if (author) {
            setLastAuthor(author);
        }
        const beforeCount = file.waivers.length;
        const nextWaivers = condense
            ? mergeWaiverSpecs(file.waivers, rules)
            : appendWaiverSpecsWithoutMerge(file.waivers, rules);
        const absorbed = beforeCount + rules.length - nextWaivers.length;
        setFile({ waivers: nextWaivers });
        setPanelOpen(true);
        if (condense && absorbed > 0) {
            notifySuccess({
                message: "Waiver rules added",
                description: `Condensed with existing rules (${absorbed} fewer than adding separately).`,
            });
        } else if (!condense) {
            notifySuccess({
                message: rules.length === 1 ? "Waiver rule added" : `Added ${rules.length} waiver rules`,
                description: "Kept separate from existing rules (no axis condensation).",
            });
        } else {
            notifySuccess({
                message: rules.length === 1 ? "Waiver rule added" : `Added ${rules.length} waiver rules`,
            });
        }
    }, [file.waivers]);

    const mergeCoveredRule = useCallback((index: number, reason?: string) => {
        if (!report) {
            return;
        }
        const diag = report.diagnostics[index];
        if (!diag || diag.status !== "covered" || !diag.coveredByIndexes?.length) {
            return;
        }
        const coveredBy = diag.coveredByIndexes;
        const trimmedReason = reason?.trim();
        setFile((prev) => {
            const keep = prev.waivers[index];
            if (!keep) {
                return prev;
            }
            let axes = keep.axes;
            for (const otherIndex of coveredBy) {
                const other = prev.waivers[otherIndex];
                if (!other || other.point !== keep.point) {
                    continue;
                }
                const united = unionWaiverAxes(axes, other.axes);
                if (united) {
                    axes = united;
                }
            }
            const merged: WaiverSpec = {
                ...keep,
                axes,
                reason: trimmedReason && trimmedReason.length > 0 ? trimmedReason : keep.reason,
                disabled: false,
            };
            const remove = new Set([index, ...coveredBy]);
            const waivers: WaiverSpec[] = [];
            let inserted = false;
            for (let i = 0; i < prev.waivers.length; i += 1) {
                if (remove.has(i)) {
                    if (!inserted) {
                        waivers.push(merged);
                        inserted = true;
                    }
                    continue;
                }
                waivers.push(prev.waivers[i]);
            }
            if (!inserted) {
                waivers.push(merged);
            }
            return { waivers };
        });
        notifySuccess({
            message: "Waiver rules merged",
            description: "Overlapping rules were combined into one",
        });
    }, [report]);

    const disableAllProblems = useCallback(() => {
        if (!report) {
            return;
        }
        const problemIndexes = new Set(
            report.diagnostics
                .filter((row) => isWaiverProblemStatus(row.status))
                .map((row) => row.index),
        );
        setFile((prev) => ({
            waivers: prev.waivers.map((rule, index) =>
                problemIndexes.has(index) ? { ...rule, disabled: true } : rule,
            ),
        }));
    }, [report]);

    const removeDisabled = useCallback(() => {
        setFile((prev) => ({
            waivers: prev.waivers.filter((rule) => !rule.disabled),
        }));
    }, []);

    const serialize = useCallback(
        (includeDisabled: boolean) => serializeWaiverFile(file, { includeDisabled }),
        [file],
    );

    useEffect(() => {
        if (!isDirty) {
            return;
        }
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [isDirty]);

    const applySummary = report ? summariseApplyReport(report) : null;

    const value: WaiverSessionValue = {
        file,
        fileName,
        panelOpen,
        setPanelOpen,
        creatingWaivers,
        setCreatingWaivers,
        activePointPath,
        setActivePointPath,
        activeReadouts,
        isDirty,
        report,
        setActiveReadouts,
        loadFromText,
        clear,
        markSaved,
        setRuleDisabled,
        removeRule,
        restoreRule,
        updateRule,
        appendRules,
        mergeCoveredRule,
        disableAllProblems,
        removeDisabled,
        serialize,
        applySummary,
        lastAuthor,
    };

    return (
        <WaiverSessionContext.Provider value={value}>{children}</WaiverSessionContext.Provider>
    );
}

// Hook co-located with the provider (same pattern as other session hooks).
// eslint-disable-next-line react-refresh/only-export-components
export function useWaiverSession(): WaiverSessionValue {
    const value = useContext(WaiverSessionContext);
    if (!value) {
        throw new Error("useWaiverSession must be used within WaiverSessionProvider");
    }
    return value;
}
