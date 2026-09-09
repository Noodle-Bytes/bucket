/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { TreeNode } from "../../lib/tree";

const data = {
    point: {
        description: "",
    },
    point_hit: {

    }
}

const treeMock: TreeNode[] = [
    {
        title: "parent 1",
        key: "0-0",
        children: [
            {
                title: "parent 1-0",
                key: "0-0-0",
                children: [
                    {
                        title: "leaf",
                        key: "0-0-0-0",
                        data
                    },
                    {
                        title: "multiple line title, multiple line title",
                        key: "0-0-0-1",
                        data
                    },
                    {
                        title: "my very long title without breaks",
                        key: "0-0-0-2",
                        data
                    },
                ],
                data
            },
            {
                title: "parent 1-1",
                key: "0-0-1",
                children: [
                    {
                        title: "leaf",
                        key: "0-0-1-0",
                        data
                    },
                ],
                data
            },
            {
                title: "parent 1-2",
                key: "0-0-2",
                children: [
                    {
                        title: "leaf-0",
                        key: "0-0-2-0",
                        data
                    },
                    {
                        title: "leaf-1",
                        key: "0-0-2-1",
                        data
                    },
                ],
                data
            },
        ],
        data
    },
    {
        title: "parent 2",
        key: "0-1",
        children: [
            {
                title: "parent 2-0",
                key: "0-1-0",
                children: [
                    {
                        title: "leaf-0",
                        key: "0-1-0-0",
                        data
                    },
                    {
                        title: "leaf-1",
                        key: "0-1-0-1",
                        data
                    },
                ],
                data
            },
        ],
        data
    },
];
export default treeMock;
