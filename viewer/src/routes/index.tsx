/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved
 */

import { useRoutes } from "react-router-dom";
import Dashboard from "@/features/Dashboard";
import CoverageTree from "@/features/Dashboard/lib/coveragetree";
import treeMock from "@/features/Dashboard/test/mocks/tree";
import { JSONReader } from "@/features/Dashboard/lib/readers";

function getDefaultTree() {
    let coverageJSON;
    try {
        // @ts-ignore
        coverageJSON = __BUCKET_CVG_JSON;
    } catch (error) {
        return new CoverageTree(treeMock);
    }
    return CoverageTree.fromReadouts(Array.from(new JSONReader(coverageJSON).read_all()));
}

export const AppRoutes = () => {
    const element = useRoutes([{ path: "*", element: <Dashboard tree={getDefaultTree()}/> }]);
    return <>{element}</>;
};
