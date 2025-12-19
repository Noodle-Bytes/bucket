/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2024 Vypercore. All Rights Reserved
 */

import { Theme as ThemeType, themes } from "@/theme";
import Theme from "@/providers/Theme";
import ThemeConsumer from "@/providers/Theme";
import type { FloatButtonProps, TreeDataNode } from "antd";
import {
    Breadcrumb,
    ConfigProvider,
    Layout,
    Segmented,
    Flex,
    FloatButton,
    Button,
    Typography,
} from "antd";
import { BgColorsOutlined, FileOutlined, FolderOpenOutlined } from "@ant-design/icons";
import Tree, { TreeKey, TreeNode } from "./lib/tree";

import Sider from "./components/Sider";
import { antTheme, view } from "./theme";
import { useEffect, useMemo, useState } from "react";
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
    onOpenFile?: () => void | Promise<void>;
};

export default function Dashboard({ tree, onOpenFile }: DashboardProps) {
    const [selectedTreeKeys, setSelectedTreeKeys] = useState<TreeKey[]>([]);
    const [expandedTreeKeys, setExpandedTreeKeys] = useState<TreeKey[]>([]);
    const [autoExpandTreeParent, setAutoExpandTreeParent] = useState(true);
    const [treeKeyContentKey, setTreeKeyContentKey] = useState(
        {} as { [key: TreeKey]: string | number },
    );

    // Check if tree is empty (no coverage loaded)
    const isEmpty = tree.getRoots().length === 0;

    // Reset selected keys when tree becomes empty or selected key no longer exists (e.g., after clearing coverage)
    useEffect(() => {
        if (isEmpty) {
            if (selectedTreeKeys.length > 0) {
                setSelectedTreeKeys([]);
                setExpandedTreeKeys([]);
                setTreeKeyContentKey({});
            }
        } else if (selectedTreeKeys.length > 0) {
            // Check if the selected key still exists in the tree
            const viewKey = selectedTreeKeys[0];
            if (viewKey !== Tree.ROOT && !tree.getNodeByKey(viewKey)) {
                // Selected key no longer exists, reset to root
                setSelectedTreeKeys([]);
                setExpandedTreeKeys([]);
            }
        }
    }, [tree, selectedTreeKeys, isEmpty]);

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

    const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;
    // Get logo path - in Electron production, use app:// protocol
    // Check if we're using app:// protocol (Electron production) or http:// (dev)
    const isElectronProduction = typeof window !== 'undefined' && window.location.protocol === 'app:';
    // For file:// protocol (browser opening HTML directly), use relative path
    const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';
    const logoSrc = isElectronProduction
        ? 'app://logo.svg'
        : isFileProtocol
        ? './logo.svg'
        : `${import.meta.env.BASE_URL}logo.svg`;
    // Get source and source_key from the currently selected node's readout
    const sourceInfo = useMemo(() => {
        // Don't show source info when at root level
        if (viewKey === Tree.ROOT) {
            return { source: null, source_key: null };
        }

        const currentNode = tree.getNodeByKey(viewKey);
        if (currentNode?.data?.readout) {
            const readout = currentNode.data.readout;
            try {
                return {
                    source: readout.get_source?.() ?? null,
                    source_key: readout.get_source_key?.() ?? null,
                };
            } catch (error) {
                // Fallback if methods don't exist (old readout format)
                return { source: null, source_key: null };
            }
        }
        return { source: null, source_key: null };
    }, [tree, viewKey]);

    // Check if tree is empty (no coverage loaded)
    const isEmpty = tree.getRoots().length === 0;
    const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

    const selectedViewContent = useMemo(() => {
        // Show empty state if no coverage is loaded
        if (isEmpty) {
            return (
                <Theme.Consumer>
                    {({ theme }) => {
                        // Use theme-aware colors - check if it's a dark theme
                        const isDark = theme.name === 'dark' || theme.name.includes('dark');
                        const primaryTextColor = isDark
                            ? 'rgba(255, 255, 255, 0.9)'
                            : 'rgba(0, 0, 0, 0.85)';
                        const secondaryTextColor = isDark
                            ? 'rgba(255, 255, 255, 0.7)'
                            : 'rgba(0, 0, 0, 0.65)';

                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', padding: '40px 20px' }}>
                                <div style={{ marginBottom: '40px', display: 'flex', justifyContent: 'center' }}>
                                    <img src={logoSrc} alt="Bucket" style={{ width: '120px', height: 'auto', opacity: 0.8 }} />
                                </div>
                                <div style={{ textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
                                    <Typography.Title level={4} style={{ marginBottom: '16px', marginTop: 0 }}>
                                        No Coverage Loaded
                                    </Typography.Title>
                                    <Typography.Paragraph style={{ marginBottom: '24px', color: primaryTextColor }}>
                                        Load a Bucket coverage archive file (`.bktgz`) to view coverage data.
                                    </Typography.Paragraph>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                                        {onOpenFile ? (
                                            <>
                                                <Button
                                                    type="primary"
                                                    icon={<FolderOpenOutlined />}
                                                    size="large"
                                                    onClick={onOpenFile}
                                                >
                                                    Open File...
                                                </Button>
                                                <Typography.Text style={{ fontSize: '12px', color: secondaryTextColor }}>
                                                    Or drag and drop a `.bktgz` file here
                                                </Typography.Text>
                                            </>
                                        ) : (
                                            <Typography.Text style={{ color: secondaryTextColor }}>
                                                Drag and drop a `.bktgz` file here
                                            </Typography.Text>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    }}
                </Theme.Consumer>
            );
        }

        const currentNode = tree.getNodeByKey(viewKey);
        if (!currentNode) {
            // Node doesn't exist (e.g., after clearing coverage), show empty state
            return null;
        }

        switch (currentContentKey) {
            case "Pivot":
                return <LayoutOutlined />;
            case "Summary":
                return (
                    <PointSummaryGrid
                        tree={tree}
                        node={currentNode}
                        setSelectedTreeKeys={onSelect}
                    />
                );
            case "Point":
                return <PointGrid node={currentNode} />;
            default:
                throw new Error("Invalid view!?");
        }
    }, [viewKey, currentContentKey, tree, isEmpty, isElectron, onOpenFile]);

    return (
        <ConfigProvider theme={antTheme}>
            <Layout {...view.props}>
                {!isEmpty && (
                    <Sider
                        tree={tree}
                        selectedTreeKeys={selectedTreeKeys}
                        setSelectedTreeKeys={onSelect}
                        expandedTreeKeys={expandedTreeKeys}
                        setExpandedTreeKeys={setExpandedTreeKeys}
                        autoExpandTreeParent={autoExpandTreeParent}
                        setAutoExpandTreeParent={setAutoExpandTreeParent}></Sider>
                )}
                <Layout {...view.body.props}>
<<<<<<< HEAD
                    <Header {...view.body.header.props}>
                        <Flex {...view.body.header.flex.props}>
                            <Theme.Consumer>
                                {/* The breadcrumb menu is placed outside of the main DOM tree
                                    so we need to pass through the theme class */}
                                {({ theme }) => (
                                    <>
=======
                    {!isEmpty && (
                        <Header {...view.body.header.props}>
                            <Flex {...view.body.header.flex.props}>
                                <Theme.Consumer>
                                    {/* The breadcrumb menu is placed outside of the main DOM tree
                                        so we need to pass through the theme class */}
                                    {({ theme }) => (
>>>>>>> e5b7c79 (Changes to web viewer to have a default loading screen. Not currently working. Example switched from SQL to BKTGZ)
                                        <Breadcrumb
                                            {...view.body.header.flex.breadcrumb
                                                .props}
                                            items={getBreadCrumbItems({
                                                tree,
                                                selectedTreeKeys,
                                                onSelect,
                                                theme,
                                            })}></Breadcrumb>
<<<<<<< HEAD
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
=======
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
                    )}
>>>>>>> e5b7c79 (Changes to web viewer to have a default loading screen. Not currently working. Example switched from SQL to BKTGZ)
                    <Content {...view.body.content.props}>
                        {selectedViewContent}
                    </Content>
                </Layout>
            </Layout>
            <ColorModeToggleButton {...view.float.theme.props} />
        </ConfigProvider>
    );
}
