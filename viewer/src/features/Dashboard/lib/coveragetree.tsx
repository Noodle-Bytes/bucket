/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved
 */

import { LayoutOutlined, TableOutlined } from "@ant-design/icons";
import Tree, { TreeKey, TreeNode, View } from "./tree";

export type PointData = {
    readout: Readout;
    point: PointTuple;
    point_hit: PointHitTuple;
};

export type PointNode = TreeNode<PointData>;

export default class CoverageTree extends Tree<PointData> {
    static fromReadouts(readouts: Readout[]): CoverageTree {
        // Record the tree and stack of current ancestors
        const tree: TreeNode[] = [];
        const stack: TreeNode[] = [];

        for (const [i, readout] of readouts.entries()) {
            // Iterate over the points, building up a tree
            const point_hits = readout.iter_point_hits();
            for (const point of readout.iter_points()) {
                const point_hit = point_hits.next().value;

                const dataNode: TreeNode<PointData> = {
                    title: point.name,
                    key: `${i}-${point.start}-${point.end}`,
                    children: [],
                    data: {
                        readout,
                        point,
                        point_hit,
                    },
                };
                // Discard anything below parent
                stack.splice(point.depth);
                if (point.depth === 0) {
                    // Add as root
                    tree.push(dataNode);
                } else {
                    // Add to parent as child
                    stack[point.depth - 1].children?.push(dataNode);
                }
                // Record in stack
                stack.push(dataNode);
            }
        }
        return new CoverageTree(tree);
    }

    getViewsByKey(key: TreeKey): View[] {
        const node = this.getNodeByKey(key);
        if (node.children?.length) {
            return [
                {
                    value: "Summary",
                    icon: <TableOutlined />,
                },
            ];
        } else {
            return [
                {
                    value: "Point",
                    icon: <TableOutlined />,
                },
                {
                    value: "Pivot",
                    icon: <LayoutOutlined />,
                },
            ];
        }
    }
}
