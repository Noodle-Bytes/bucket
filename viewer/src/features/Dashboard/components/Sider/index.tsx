/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2024 Vypercore. All Rights Reserved
 */

import { Layout, Tree as AntTree, Input, Typography } from "antd";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";

declare const __APP_VERSION__: string;
import { view } from "../../theme";
import Tree, { TreeKey, TreeNode } from "../../lib/tree";
import Theme from "@/providers/Theme";

export const MIN_SIDEBAR_WIDTH = 180;
export const MAX_SIDEBAR_WIDTH = 520;

/**
 * Processes a tree of nodes and applies a formatter to the tile of each.
 *
 * @param tree the tree to format
 * @param nodeTitleFormatter the formatter to apply
 * @returns a formatted tree of nodes
 */
function treeTitleFormatter(
    tree: Tree,
    nodeTitleFormatter: (treeNode: TreeNode) => ReactNode,
) {
    const callback = (treeNode: TreeNode): TreeNode => {
        return {
            ...treeNode,
            title: nodeTitleFormatter(treeNode),
            children: treeNode.children?.map(callback),
        };
    };
    return tree.getRoots().map(callback);
}

/**
 * Creates a title formatter based on a search value.
 *
 * @param searchValue the value being searched
 * @returns a formatted title with the search value highlighted
 */
function searchNodeTitleFormatterFactory(searchValue: string) {
    return (treeNode: TreeNode) => {
        const strTitle = treeNode.title as string;
        const index = strTitle.indexOf(searchValue);
        const beforeStr = strTitle.substring(0, index);
        const afterStr = strTitle.slice(index + searchValue.length);
        const title =
            index > -1 ? (
                <span>
                    {beforeStr}
                    <span {...view.sider.tree.searchlight.props}>
                        {searchValue}
                    </span>
                    {afterStr}
                </span>
            ) : (
                <span>{strTitle}</span>
            );
        return title;
    };
}

export type SiderProps = {
    tree: Tree;
    sidebarVisible: boolean;
    sidebarWidth: number;
    selectedTreeKeys: TreeKey[];
    expandedTreeKeys: TreeKey[];
    autoExpandTreeParent: boolean;
    setSidebarWidth: (width: number) => void;
    setAutoExpandTreeParent: (newValue: boolean) => void;
    setSelectedTreeKeys: (newSelectedKeys: TreeKey[]) => void;
    setExpandedTreeKeys: (newExpandedKeys: TreeKey[]) => void;
};

export default function Sider({
    tree,
    sidebarVisible,
    sidebarWidth,
    selectedTreeKeys,
    expandedTreeKeys,
    autoExpandTreeParent,
    setSidebarWidth,
    setAutoExpandTreeParent,
    setSelectedTreeKeys,
    setExpandedTreeKeys,
}: SiderProps) {
    const [searchValue, setSearchValue] = useState("");
    const [isResizing, setIsResizing] = useState(false);
    const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

    const effectiveWidth = sidebarVisible ? sidebarWidth : 0;

    const onExpand = (newExpandedKeys: React.Key[]) => {
        setExpandedTreeKeys(newExpandedKeys as TreeKey[]);
        setAutoExpandTreeParent(false);
    };

    const onSelect = (newSelectedKeys: React.Key[]) => {
        const keys = newSelectedKeys as TreeKey[];
        // If clicking on an already selected node, keep it selected (don't deselect)
        // This allows collapsing/expanding without jumping to root
        if (keys.length === 0 && selectedTreeKeys.length > 0) {
            // User clicked on already selected node - keep it selected
            // Just toggle expansion if it has children
            const currentKey = selectedTreeKeys[0];
            const currentNode = tree.getNodeByKey(currentKey);
            if (currentNode?.children && currentNode.children.length > 0) {
                // Toggle expansion
                const isExpanded = expandedTreeKeys.includes(currentKey);
                if (isExpanded) {
                    setExpandedTreeKeys(expandedTreeKeys.filter(k => k !== currentKey));
                } else {
                    setExpandedTreeKeys([...expandedTreeKeys, currentKey]);
                }
            }
            // Keep the selection
            return;
        }
        setSelectedTreeKeys(keys);
    };

    const onSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { value } = e.target;
        const newExpandedKeys = new Set<TreeKey>();
        for (const [node, parent] of tree.walk()) {
            const strTitle = node.title as string;
            if (strTitle.includes(value) && parent !== null) {
                newExpandedKeys.add(parent.key);
            }
        }
        setExpandedTreeKeys(Array.from(newExpandedKeys));
        setSearchValue(value);
        setAutoExpandTreeParent(true);
    };

    const formattedTreeData = useMemo(() => {
        return treeTitleFormatter(
            tree,
            searchNodeTitleFormatterFactory(searchValue),
        );
    }, [searchValue, tree]);

    const onResizeMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!sidebarVisible) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        resizeStateRef.current = {
            startX: event.clientX,
            startWidth: sidebarWidth,
        };
        setIsResizing(true);
    };

    useEffect(() => {
        if (!isResizing) {
            return;
        }

        const onMouseMove = (event: MouseEvent) => {
            const resizeState = resizeStateRef.current;
            if (!resizeState) {
                return;
            }
            const delta = event.clientX - resizeState.startX;
            const nextWidth = Math.max(
                MIN_SIDEBAR_WIDTH,
                Math.min(MAX_SIDEBAR_WIDTH, resizeState.startWidth + delta),
            );
            setSidebarWidth(nextWidth);
        };

        const onMouseUp = () => {
            setIsResizing(false);
            resizeStateRef.current = null;
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
    }, [isResizing, setSidebarWidth]);

    return (
        <Layout.Sider
            {...view.sider.props}
            width={effectiveWidth}
            style={{
                ...view.sider.props.style,
                width: effectiveWidth,
                minWidth: effectiveWidth,
                maxWidth: effectiveWidth,
                flex: `0 0 ${effectiveWidth}px`,
                padding: sidebarVisible ? 5 : 0,
                borderRightWidth: sidebarVisible ? 1 : 0,
                overflow: "hidden",
                position: "relative",
                transition:
                    "width 0.2s ease, min-width 0.2s ease, max-width 0.2s ease, flex-basis 0.2s ease, padding 0.2s ease, border-right-width 0.2s ease",
            }}>
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    visibility: sidebarVisible ? "visible" : "hidden",
                }}
                aria-hidden={!sidebarVisible}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                {...(!sidebarVisible ? { inert: "" } as any : {})}
            >
                <div style={{ display: "flex", alignItems: "center" }}>
                    <Input
                        {...view.sider.search.props}
                        onChange={onSearchChange}
                        style={{ ...view.sider.search.props.style, flex: 1, minWidth: 0 }}
                    />
                </div>
                <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
                    <AntTree
                        {...view.sider.tree.props}
                        onExpand={onExpand}
                        onSelect={onSelect}
                        selectedKeys={selectedTreeKeys}
                        expandedKeys={expandedTreeKeys}
                        autoExpandParent={autoExpandTreeParent}
                        treeData={formattedTreeData}
                    />
                </div>
                <Theme.Consumer>
                    {({ theme }) => (
                        <Typography.Text
                            style={{
                                display: "block",
                                textAlign: "center",
                                fontSize: 11,
                                padding: "8px 0 4px",
                                color: theme.theme.colors.primarytxt.value,
                                flexShrink: 0,
                            }}
                        >
                            v{__APP_VERSION__}
                        </Typography.Text>
                    )}
                </Theme.Consumer>
            </div>
            {sidebarVisible && (
                <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize sidebar"
                    onMouseDown={onResizeMouseDown}
                    style={{
                        position: "absolute",
                        top: 0,
                        right: 0,
                        width: 6,
                        height: "100%",
                        cursor: "col-resize",
                        zIndex: 2,
                        backgroundColor: isResizing ? "rgba(24, 144, 255, 0.18)" : "transparent",
                    }}
                />
            )}
        </Layout.Sider>
    );
}
