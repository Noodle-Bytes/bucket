/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved
 */

import { useRoutes } from "react-router-dom";
import Dashboard from "@/features/Dashboard";
import CoverageTree from "@/features/Dashboard/lib/coveragetree";
import treeMock from "@/features/Dashboard/test/mocks/tree";
import { readFileHandle, JSONReader } from "@/features/Dashboard/lib/readers";
import { useEffect, useState } from "react";

function getDefaultTree() {
    return new CoverageTree(treeMock);
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

    const [tree, setTree] = useState(getDefaultTree());
    useEffect(() => {
        if ("launchQueue" in window) {
            launchQueue.setConsumer(async (launchParams) => {
                const readouts: Readout[] = [];
                for (const file of launchParams.files as FileSystemFileHandle[]) {
                    const reader = await readFileHandle(file);
                    for await (const readout of reader.read_all()) {
                        readouts.push(readout)
                    }
                }
                setTree(CoverageTree.fromReadouts(readouts));
            });
        }
    }, [])

    const element = useRoutes([{ path: "*", element: <Dashboard tree={tree}/> }]);
    return <>{element}</>;
};
