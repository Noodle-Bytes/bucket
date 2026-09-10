/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { useRoutes } from "react-router-dom";
import Dashboard from "@/features/Dashboard";
import { useFileLoader } from "@/hooks/useFileLoader";
import { useCoverageCompare } from "@/hooks/useCoverageCompare";
import CoverageTree from "@/features/Dashboard/lib/coveragetree";
import { buildCompareDisplayReadout, getCompareCompatibility } from "@/services/coverageCompare";
import { CoverageLoadingOverlay } from "@/components/CoverageLoadingOverlay";
import { notifyInfo, notifyWarning } from "@/utils/themedStaticNotification";
import { checkForNewerRelease } from "@/services/updateCheck";
import { useEffect, useMemo, useRef, type ChangeEvent } from "react";
import type { CompareViewContext } from "@/types/coverageCompare";
import { useWaiverSession } from "@/hooks/useWaiverSession";
import { applyWaiverFileToReadout, isWaiverProblemStatus } from "@/services/matchWaivers";
import type { WaiverFileSpec } from "@/services/waiverSpec";
import WaiversPanel from "@/features/Dashboard/components/WaiversPanel";

declare const __APP_VERSION__: string;

// Module-level guard so StrictMode's double-mount fires a single check.
let updateCheckStarted = false;

function useUpdateNotification() {
    useEffect(() => {
        if (updateCheckStarted) {
            return;
        }
        updateCheckStarted = true;
        void checkForNewerRelease(__APP_VERSION__).then((update) => {
            if (!update) {
                return;
            }
            notifyInfo({
                message: "Update available",
                description: (
                    <>
                        Bucket v{update.latestVersion} has been released (this
                        viewer is v{__APP_VERSION__}).{" "}
                        <a
                            href={update.releaseUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ textDecoration: "underline", color: "inherit" }}
                        >
                            View release
                        </a>
                    </>
                ),
                duration: 10,
            });
        });
    }, []);
}

function applyWaiversToReadouts(readouts: Readout[], file: WaiverFileSpec): Readout[] {
    if (file.waivers.length === 0) {
        return readouts;
    }
    return readouts.map((readout) => applyWaiverFileToReadout(readout, file).readout);
}

export const AppRoutes = () => {
    useUpdateNotification();
    const {
        tree,
        session,
        isLoading,
        loadingProgress,
        isDragging,
        fileInputRef,
        handleFileInput,
        openFileDialog,
        loadExampleData,
        clearCoverage,
        setLoadedRecords,
        mergeRecords,
        refreshLoadedRecords,
        exportRecords,
        pendingCompareActivation,
        clearPendingCompareActivation,
        persistSessionEnabled,
        setPersistSessionEnabled,
    } = useFileLoader();

    const waivers = useWaiverSession();
    const waiverInputRef = useRef<HTMLInputElement>(null);

    const loadedReadouts = useMemo(
        () =>
            session.records
                .filter((record) => record.isLoaded)
                .map((record) => record.readout),
        [session.records],
    );

    const setActiveReadouts = waivers.setActiveReadouts;
    useEffect(() => {
        setActiveReadouts(loadedReadouts);
    }, [loadedReadouts, setActiveReadouts]);

    const waivedBaseTree = useMemo(() => {
        if (waivers.file.waivers.length === 0) {
            return tree;
        }
        const waived = applyWaiversToReadouts(loadedReadouts, waivers.file);
        if (waived.length === 0) {
            return tree;
        }
        return CoverageTree.fromReadouts(waived);
    }, [tree, loadedReadouts, waivers.file]);

    const compareRecordRows = useMemo(
        () =>
            session.records.map((record) => {
                const source = session.sources.find((item) => item.id === record.sourceRef);
                const sourceLabel = source?.label ?? "Unknown";
                let readoutSource = "";
                try {
                    const sourceValue = record.readout.get_source();
                    const sourceKeyValue = record.readout.get_source_key();
                    if (sourceValue && sourceKeyValue) {
                        readoutSource = `${sourceValue}[${sourceKeyValue}]`;
                    } else if (sourceValue) {
                        readoutSource = sourceValue;
                    } else if (sourceKeyValue) {
                        readoutSource = `[${sourceKeyValue}]`;
                    }
                } catch {
                    readoutSource = "";
                }
                const prefix = readoutSource ? `${readoutSource} - ` : "";
                const recordsInSource =
                    session.records.filter((item) => item.sourceRef === record.sourceRef).length;
                const base = `${prefix}${sourceLabel}`;
                const label =
                    recordsInSource <= 1
                        ? base
                        : `${base} (record ${record.sourceRecordIndex + 1})`;
                const readout =
                    waivers.file.waivers.length > 0
                        ? applyWaiversToReadouts([record.readout], waivers.file)[0]
                        : record.readout;
                return {
                    id: record.id,
                    label,
                    readout,
                };
            }),
        [session.records, session.sources, waivers.file],
    );

    const compare = useCoverageCompare(compareRecordRows);
    const {
        setRecordIdA: setCompareRecordIdA,
        setRecordIdB: setCompareRecordIdB,
        setActive: setCompareActive,
    } = compare;

    useEffect(() => {
        if (!pendingCompareActivation) {
            return;
        }

        const { recordIdA, recordIdB } = pendingCompareActivation;
        clearPendingCompareActivation();

        const recordA = compareRecordRows.find((record) => record.id === recordIdA);
        const recordB = compareRecordRows.find((record) => record.id === recordIdB);
        if (!recordA || !recordB) {
            return;
        }

        const compatibility = getCompareCompatibility(compareRecordRows);
        const sameGroup = compatibility.compatibleGroups.some(
            (group) =>
                group.some((record) => record.id === recordIdA)
                && group.some((record) => record.id === recordIdB),
        );
        if (!sameGroup) {
            notifyWarning({
                message: "Compare unavailable",
                description:
                    compatibility.message
                    ?? "These records do not share the same covertree definition.",
                duration: 5,
            });
            return;
        }

        setCompareRecordIdA(recordIdA);
        setCompareRecordIdB(recordIdB);
        setCompareActive(true);
    }, [
        pendingCompareActivation,
        compareRecordRows,
        clearPendingCompareActivation,
        setCompareRecordIdA,
        setCompareRecordIdB,
        setCompareActive,
    ]);

    const displayTree = useMemo(() => {
        if (compare.active && compare.readoutA && compare.readoutB) {
            const readout = buildCompareDisplayReadout(
                compare.readoutA,
                compare.readoutB,
                compare.setMode,
            );
            return CoverageTree.fromReadouts([readout]);
        }
        return waivedBaseTree;
    }, [
        compare.active,
        compare.readoutA,
        compare.readoutB,
        compare.setMode,
        waivedBaseTree,
    ]);

    const compareContext = useMemo((): CompareViewContext | undefined => {
        if (!compare.active || !compare.comparison) {
            return undefined;
        }
        return {
            comparison: compare.comparison,
            setMode: compare.setMode,
        };
    }, [compare.active, compare.comparison, compare.setMode]);

    const openWaiverFileDialog = () => {
        waiverInputRef.current?.click();
    };

    const handleWaiverInput = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) {
            return;
        }
        const text = await file.text();
        waivers.loadFromText(text, file.name);
    };

    const element = useRoutes([
        {
            path: "*",
            element: (
                <>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileInput}
                        accept=".bktgz"
                        multiple
                        style={{ display: "none" }}
                    />
                    <input
                        type="file"
                        ref={waiverInputRef}
                        onChange={(event) => void handleWaiverInput(event)}
                        accept=".json,application/json"
                        style={{ display: "none" }}
                    />
                    <Dashboard
                        tree={displayTree}
                        records={session.records}
                        sources={session.sources}
                        compare={compare}
                        compareContext={compareContext}
                        onOpenFile={openFileDialog}
                        onLoadExample={loadExampleData}
                        onClearCoverage={clearCoverage}
                        onSetLoadedRecords={setLoadedRecords}
                        onMergeRecords={mergeRecords}
                        onRefreshRecords={refreshLoadedRecords}
                        onExportRecords={exportRecords}
                        isDragging={isDragging}
                        persistSessionEnabled={persistSessionEnabled}
                        onPersistSessionChange={setPersistSessionEnabled}
                        onLoadWaivers={openWaiverFileDialog}
                        onOpenWaiversPanel={() => waivers.setPanelOpen(true)}
                        waiverRuleCount={waivers.file.waivers.length}
                        waiverProblemCount={
                            waivers.report?.diagnostics.filter((row) =>
                                isWaiverProblemStatus(row.status),
                            ).length ?? 0
                        }
                    />
                    <WaiversPanel />
                    <CoverageLoadingOverlay open={isLoading} loadingProgress={loadingProgress} />
                </>
            ),
        },
    ]);
    return <>{element}</>;
};
