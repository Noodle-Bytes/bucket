/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { useRoutes } from "react-router-dom";
import Dashboard from "@/features/Dashboard";
import { useFileLoader } from "@/hooks/useFileLoader";
import { Spin } from "antd";

export const AppRoutes = () => {
    const { tree, isLoading, isDragging, fileInputRef, handleFileInput, openFileDialog } = useFileLoader();

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
                        style={{ display: 'none' }}
                    />
                    <Spin spinning={isLoading} size="large" tip="Loading coverage data...">
                        <Dashboard tree={tree} onOpenFile={openFileDialog} isDragging={isDragging} />
                    </Spin>
                </>
            ),
        },
    ]);

    return <>{element}</>;
};
