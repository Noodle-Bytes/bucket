/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
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

                // Build title: for root nodes, include source and source_key if available
                let title = point.name;
                if (point.depth === 0) {
                    const source = readout.get_source();
                    const source_key = readout.get_source_key();
                    const parts: string[] = [];
                    if (source && source_key) {
                        parts.push(`${source}[${source_key}]`);
                    } else if (source) {
                        parts.push(source);
                    } else if (source_key) {
                        parts.push(`[${source_key}]`);
                    }
                    if (parts.length > 0) {
                        title = `${parts.join(' ')} ${point.name}`;
                    }
                }

                const dataNode: TreeNode<PointData> = {
                    title: title,
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
        if (!node) {
            // Return default views if node doesn't exist
            return [
                {
                    value: "Summary",
                    icon: <TableOutlined />,
                    label: "Summary",
                    title: "View coverage summary as a table or donut chart",
                },
            ];
        }
        if (node.children?.length) {
            return [
                {
                    value: "Summary",
                    icon: <TableOutlined />,
                    label: "Summary",
                    title: "View coverage summary as a table or donut chart",
                },
            ];
        } else {
            return [
                {
                    value: "Point",
                    icon: <TableOutlined />,
                    label: "Point",
                    title: "View detailed coverage point data",
                },
                {
                    value: "Pivot",
                    icon: <LayoutOutlined />,
                    label: "Pivot",
                    title: "View coverage in pivot layout (coming soon)",
                },
            ];
        }
    }
}
