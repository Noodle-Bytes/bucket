/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { useRoutes } from "react-router-dom";
import Dashboard from "@/features/Dashboard";
import { useFileLoader } from "@/hooks/useFileLoader";
import { CoverageLoadingOverlay } from "@/components/CoverageLoadingOverlay";

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
                        tree={tree}
                        records={session.records}
                        sources={session.sources}
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
