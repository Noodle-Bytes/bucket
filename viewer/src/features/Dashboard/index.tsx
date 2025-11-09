/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved
 */

/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2024 Vypercore. All Rights Reserved
 */

import { Theme as ThemeType, themes } from "@/theme";
import Theme from "@/providers/Theme";
import type { FloatButtonProps, TreeDataNode } from "antd";
import {
    Breadcrumb,
    ConfigProvider,
    Layout,
    Segmented,
    Flex,
    FloatButton,
} from "antd";
import { BgColorsOutlined } from "@ant-design/icons";
import Tree, { TreeKey, TreeNode } from "./lib/tree";

import Sider from "./components/Sider";
import { antTheme, view } from "./theme";
import { useMemo, useState } from "react";
import { BreadcrumbItemType } from "antd/lib/breadcrumb/Breadcrumb";
import { LayoutOutlined } from "@ant-design/icons";
import { PointGrid, PointSummaryGrid } from "./lib/coveragegrid";
const { Header, Content } = Layout;

const ColorModeToggleButton = (props: FloatButtonProps) => {
    return (
        <Theme.Consumer>
            {(context) => {
                const onClick = () => {
                    // Roll around the defined themes, with one extra to return to auto
                    const currentIdx =
                        themes.findIndex(
                            (v) => v.name === context.theme.name,
                        ) ?? 0;
                    const nextIdx = (currentIdx + 1) % (themes.length + 1);
                    context.setTheme(themes[nextIdx] ?? null);
                };
                return (
                    <FloatButton
                        {...props}
                        onClick={onClick}
                        icon={<BgColorsOutlined />}
                    />
                );
            }}
        </Theme.Consumer>
    );
};

type breadCrumbMenuProps = {
    /** The node we're creating a menu for */
    pathNode: TreeDataNode;
    /** The nodes we want to be in the menu */
    menuNodes: TreeDataNode[];
    /** Callback when a menu node is selected */
    onSelect: (selectedKeys: TreeKey[]) => void;
    /** Theme object */
    theme: ThemeType;
};
/**
 * Factory for bread crumb menus (dropdowns on breadcrumb)
 * @param breadCrumbMenuProps
 * @returns a bread crumb menu
 */
function getBreadCrumbMenu({
    pathNode,
    menuNodes,
    onSelect,
    theme,
}: breadCrumbMenuProps) {
    let menu: BreadcrumbItemType["menu"] | undefined = undefined;
    if (menuNodes.length > 1 || pathNode !== menuNodes[0]) {
        menu = {
            items: menuNodes.map(({ key, title }) => ({
                key,
                title: title as string,
            })),
            selectable: true,
            selectedKeys: [pathNode.key as string],
            onSelect: ({ selectedKeys }) => onSelect(selectedKeys),
            className: theme.theme.className,
        };
    }
    return menu;
}

type breadCrumbItemsProps = {
    /** The tree of nodes */
    tree: Tree;
    /** The ancestor path to the selected node */
    selectedTreeKeys: TreeKey[];
    /** Callback when a node is selected */
    onSelect: (newSelectedKeys: TreeKey[]) => void;
    /** Theme object */
    theme: ThemeType;
};
/**
 * Create bread crumb items from the tree data
 */
function getBreadCrumbItems({
    tree,
    selectedTreeKeys,
    onSelect,
    theme,
}: breadCrumbItemsProps): BreadcrumbItemType[] {
    const pathNodes = tree.getAncestorsByKey(selectedTreeKeys[0]);

    const breadCrumbItems: BreadcrumbItemType[] = [];
    // Create the root
    {
        const pathNode = { title: "Root", key: "_ROOT" };
        breadCrumbItems.push({
            title: <a>{pathNode.title}</a>,
            key: pathNode.key,
            onClick: () => onSelect([]),
            menu: undefined,
        });
    }

    // Create the nodes down to the selected node
    let menuNodes: TreeNode[] = tree.getRoots();
    for (const pathNode of pathNodes) {
        breadCrumbItems.push({
            title: <a>{pathNode.title as string}</a>,
            key: pathNode.key,
            onClick: () => onSelect([pathNode.key]),
            menu: getBreadCrumbMenu({ pathNode, menuNodes, onSelect, theme }),
        });
        menuNodes = pathNode.children ?? [];
    }

    // Create an extra node if we're not a leaf node to add an
    // extra dropdown to select a leaf
    if (menuNodes.length) {
        const pathNode = { title: "...", key: "_CHILD" };
        breadCrumbItems.push({
            title: pathNode.title,
            key: pathNode.key,
            menu: getBreadCrumbMenu({ pathNode, menuNodes, onSelect, theme }),
        });
    }

    return breadCrumbItems;
}

export type DashboardProps = {
    tree: Tree;
};

export default function Dashboard({ tree }: DashboardProps) {
    const [selectedTreeKeys, setSelectedTreeKeys] = useState<TreeKey[]>([]);
    const [expandedTreeKeys, setExpandedTreeKeys] = useState<TreeKey[]>([]);
    const [autoExpandTreeParent, setAutoExpandTreeParent] = useState(true);
    const [treeKeyContentKey, setTreeKeyContentKey] = useState(
        {} as { [key: TreeKey]: string | number },
    );

    const onSelect = (newSelectedKeys: TreeKey[]) => {
        const newExpandedKeys = new Set<TreeKey>(expandedTreeKeys);
        for (const newSelectedKey of newSelectedKeys) {
            for (const ancestor of tree.getAncestorsByKey(newSelectedKey)) {
                newExpandedKeys.add(ancestor.key);
            }
        }
        setExpandedTreeKeys(Array.from(newExpandedKeys));
        setSelectedTreeKeys(newSelectedKeys);
        // We're manually managing the ancestor expansion
        setAutoExpandTreeParent(false);
    };

    const viewKey = selectedTreeKeys[0] ?? Tree.ROOT;
    const contentViews = tree.getViewsByKey(viewKey);
    const defaultView = contentViews[0];
    const currentContentKey = treeKeyContentKey[viewKey] ?? defaultView.value;

    const onViewChange = (newView: string | number) => {
        setTreeKeyContentKey({
            ...treeKeyContentKey,
            [selectedTreeKeys[0]]: newView,
        });
    };

    // Get source and source_key from the currently selected node's readout
    const sourceInfo = useMemo(() => {
        // Don't show source info when at root level
        if (viewKey === Tree.ROOT) {
            return { source: "", source_key: "" };
        }

        const currentNode = tree.getNodeByKey(viewKey);
        if (currentNode?.data?.readout) {
            const readout = currentNode.data.readout;
            try {
                return {
                    source: readout.get_source?.() ?? "",
                    source_key: readout.get_source_key?.() ?? "",
                };
            } catch (error) {
                // Fallback if methods don't exist (old readout format)
                return { source: "", source_key: "" };
            }
        }
        return { source: "", source_key: "" };
    }, [tree, viewKey]);

    const selectedViewContent = useMemo(() => {
        switch (currentContentKey) {
            case "Pivot":
                return <LayoutOutlined />;
            case "Summary":
                return (
                    <PointSummaryGrid
                        tree={tree}
                        node={tree.getNodeByKey(viewKey)}
                        setSelectedTreeKeys={onSelect}
                    />
                );
            case "Point":
                return <PointGrid node={tree.getNodeByKey(viewKey)} />;
            default:
                throw new Error("Invalid view!?");
        }
    }, [viewKey, currentContentKey, tree]);

    return (
        <ConfigProvider theme={antTheme}>
            <Layout {...view.props}>
                <Sider
                    tree={tree}
                    selectedTreeKeys={selectedTreeKeys}
                    setSelectedTreeKeys={onSelect}
                    expandedTreeKeys={expandedTreeKeys}
                    setExpandedTreeKeys={setExpandedTreeKeys}
                    autoExpandTreeParent={autoExpandTreeParent}
                    setAutoExpandTreeParent={setAutoExpandTreeParent}></Sider>
                <Layout {...view.body.props}>
                    <Header {...view.body.header.props}>
                        <Flex {...view.body.header.flex.props}>
                            <Theme.Consumer>
                                {/* The breadcrumb menu is placed outside of the main DOM tree
                                    so we need to pass through the theme class */}
                                {({ theme }) => (
                                    <>
                                        <Breadcrumb
                                            {...view.body.header.flex.breadcrumb
                                                .props}
                                            items={getBreadCrumbItems({
                                                tree,
                                                selectedTreeKeys,
                                                onSelect,
                                                theme,
                                            })}></Breadcrumb>
                                        {(sourceInfo.source || sourceInfo.source_key) && (
                                            <Flex gap="small" style={{ marginLeft: '16px' }}>
                                                <span style={{ color: theme.theme.colors.primarytxt.value }}>
                                                    {sourceInfo.source && sourceInfo.source_key
                                                        ? `${sourceInfo.source}[${sourceInfo.source_key}]`
                                                        : sourceInfo.source
                                                        ? sourceInfo.source
                                                        : `[${sourceInfo.source_key}]`}
                                                </span>
                                            </Flex>
                                        )}
                                    </>
                                )}
                            </Theme.Consumer>
                            <Segmented
                                {...view.body.header.flex.segmented.props}
                                options={contentViews}
                                value={currentContentKey}
                                onChange={onViewChange}
                            />
                        </Flex>
                    </Header>
                    <Content {...view.body.content.props}>
                        {selectedViewContent}
                    </Content>
                </Layout>
            </Layout>
            <ColorModeToggleButton {...view.float.theme.props} />
        </ConfigProvider>
    );
}
