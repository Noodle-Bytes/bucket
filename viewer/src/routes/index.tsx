/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { useRoutes } from "react-router-dom";
import Dashboard from "@/features/Dashboard";
import { useFileLoader } from "@/hooks/useFileLoader";
import { useCoverageCompare } from "@/hooks/useCoverageCompare";
import CoverageTree from "@/features/Dashboard/lib/coveragetree";
import { buildCompareDisplayReadout } from "@/services/coverageCompare";
import { CoverageLoadingOverlay } from "@/components/CoverageLoadingOverlay";
import { useMemo } from "react";
import type { CompareViewContext } from "@/types/coverageCompare";

export const AppRoutes = () => {
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
