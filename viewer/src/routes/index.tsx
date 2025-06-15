/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved
 */

import { useRoutes } from "react-router-dom";
import Dashboard from "@/features/Dashboard";
import CoverageTree from "@/features/Dashboard/lib/coveragetree";
import treeMock from "@/features/Dashboard/test/mocks/tree";
import { JSONReader } from "@/features/Dashboard/lib/readers";
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
                for (const file of launchParams.files as FileSystemHandle[]) {
                    const fr = new FileReader();

                    const fl = await file.getFile();
                    fr.addEventListener("load", e => {
                        const json = JSON.parse(e.target.result)
                        const tree = CoverageTree.fromReadouts(Array.from(new JSONReader(json).read_all()));
                        setTree(tree)
                    })
                    fr.readAsText(fl);
                }
            });
        }
    }, [])

    const element = useRoutes([{ path: "*", element: <Dashboard tree={tree}/> }]);
    return <>{element}</>;
};
