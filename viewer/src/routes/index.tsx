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
import { useEffect, useMemo } from "react";
import type { CompareViewContext } from "@/types/coverageCompare";

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
        clearCoverage,
        setLoadedRecords,
        mergeRecords,
        refreshLoadedRecords,
        exportRecords,
        pendingCompareActivation,
        clearPendingCompareActivation,
    } = useFileLoader();

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
                return {
                    id: record.id,
                    label,
                    readout: record.readout,
                };
            }),
        [session.records, session.sources],
    );

    const compare = useCoverageCompare(compareRecordRows);

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

        compare.setRecordIdA(recordIdA);
        compare.setRecordIdB(recordIdB);
        compare.setActive(true);
    }, [
        pendingCompareActivation,
        compareRecordRows,
        clearPendingCompareActivation,
        compare.setRecordIdA,
        compare.setRecordIdB,
        compare.setActive,
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
        return tree;
    }, [compare.active, compare.readoutA, compare.readoutB, compare.setMode, tree]);

    const compareContext = useMemo((): CompareViewContext | undefined => {
        if (!compare.active || !compare.comparison) {
            return undefined;
        }
        return {
            comparison: compare.comparison,
            setMode: compare.setMode,
        };
    }, [compare.active, compare.comparison, compare.setMode]);

    const element = useRoutes([
        {
            path: "*",
            element: (
                <>
                    {/* Hidden file input for web browsers */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileInput}
                        accept=".bktgz"
                        multiple
                        style={{ display: 'none' }}
                    />
                    <Dashboard
                        tree={displayTree}
                        records={session.records}
                        sources={session.sources}
                        compare={compare}
                        compareContext={compareContext}
                        onOpenFile={openFileDialog}
                        onClearCoverage={clearCoverage}
                        onSetLoadedRecords={setLoadedRecords}
                        onMergeRecords={mergeRecords}
                        onRefreshRecords={refreshLoadedRecords}
                        onExportRecords={exportRecords}
                        isDragging={isDragging}
                    />
                    <CoverageLoadingOverlay open={isLoading} loadingProgress={loadingProgress} />
                </>
            ),
        },
    ]);
    return <>{element}</>;
};
