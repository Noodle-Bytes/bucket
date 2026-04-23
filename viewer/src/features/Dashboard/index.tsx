/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { Theme as ThemeType, themes } from "@/theme";
import Theme from "@/providers/Theme";
import type { TreeDataNode } from "antd";
import {
    Breadcrumb,
    Button,
    Checkbox,
    ConfigProvider,
    Flex,
    Input,
    Layout,
    Modal,
    Segmented,
    Select,
    Switch,
    Table,
    Typography,
} from "antd";
import {
    ClearOutlined,
    DownOutlined,
    EditOutlined,
    ExportOutlined,
    FileAddOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    PieChartOutlined,
    ReloadOutlined,
    SettingOutlined,
    TableOutlined,
} from "@ant-design/icons";
import Tree, { TreeKey, TreeNode } from "./lib/tree";
import Sider, { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "./components/Sider";
import EmptyState from "./components/EmptyState";
import { antTheme, view } from "./theme";
import {
    isValidElement,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { BreadcrumbItemType } from "antd/lib/breadcrumb/Breadcrumb";
import { PointGrid, PointSummaryGrid } from "./lib/coveragegrid";
import { PointPivotView } from "./lib/pivottable";
import { CoverageDonut } from "./lib/coveragedonut";
import { hexToRgba } from "@/utils/colors";
import type { CoverageRecord, CoverageSourceRef, ExportFormat } from "@/types/coverageSession";
import { getDefaultExportFileName } from "@/services/exportSaver";

declare const __APP_VERSION__: string;

const { Header, Content } = Layout;

type RecordTableRow = {
    id: string;
    key: string;
    label: string;
    sourceLabel: string;
    sourceKind: string;
    recordIndex: number;
    isLoaded: boolean;
};

const DEFAULT_SIDEBAR_WIDTH = 220;
const AUTO_THEME_VALUE = "__auto__";
const STORAGE_SIDEBAR_VISIBLE = "bucket.dashboard.sidebarVisible";
const STORAGE_SIDEBAR_WIDTH = "bucket.dashboard.sidebarWidth";

function readSidebarVisibleFromStorage(): boolean {
    if (typeof localStorage === "undefined") {
        return true;
    }
    try {
        const raw = localStorage.getItem(STORAGE_SIDEBAR_VISIBLE);
        if (raw === "false") {
            return false;
        }
        if (raw === "true") {
            return true;
        }
    } catch {
        // ignore
    }
    return true;
}

function readSidebarWidthFromStorage(): number {
    if (typeof localStorage === "undefined") {
        return DEFAULT_SIDEBAR_WIDTH;
    }
    try {
        const raw = localStorage.getItem(STORAGE_SIDEBAR_WIDTH);
        const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
        if (Number.isFinite(parsed)) {
            return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, parsed));
        }
    } catch {
        // ignore
    }
    return DEFAULT_SIDEBAR_WIDTH;
}

type BreadCrumbMenuProps = {
    pathNode: TreeDataNode;
    menuNodes: TreeDataNode[];
    onSelect: (selectedKeys: TreeKey[]) => void;
    theme: ThemeType;
};

function getBreadCrumbMenu({
    pathNode,
    menuNodes,
    onSelect,
    theme,
}: BreadCrumbMenuProps) {
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

type BreadCrumbItemsProps = {
    tree: Tree;
    selectedTreeKeys: TreeKey[];
    onSelect: (newSelectedKeys: TreeKey[]) => void;
    theme: ThemeType;
};

function getBreadCrumbItems({
    tree,
    selectedTreeKeys,
    onSelect,
    theme,
}: BreadCrumbItemsProps): BreadcrumbItemType[] {
    const pathNodes = tree.getAncestorsByKey(selectedTreeKeys[0]);
    const breadCrumbItems: BreadcrumbItemType[] = [];

    {
        const pathNode = { title: "Root", key: "_ROOT" };
        breadCrumbItems.push({
            title: <a>{pathNode.title}</a>,
            key: pathNode.key,
            onClick: () => onSelect([]),
            menu: undefined,
        });
    }

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

function breadcrumbTitleToText(title: BreadcrumbItemType["title"]): string {
    if (typeof title === "string" || typeof title === "number") {
        return String(title);
    }
    if (!isValidElement(title)) {
        return "";
    }
    const children = title.props?.children;
    if (typeof children === "string" || typeof children === "number") {
        return String(children);
    }
    if (Array.isArray(children)) {
        return children
            .filter((child) => typeof child === "string" || typeof child === "number")
            .map((child) => String(child))
            .join("");
    }
    return "";
}

function estimateBreadcrumbItemWidth(item: BreadcrumbItemType): number {
    const titleText = breadcrumbTitleToText(item.title);
    return Math.max(56, titleText.length * 8 + 28);
}

function trimBreadcrumbItems(
    items: BreadcrumbItemType[],
    availableWidth: number,
    onSelectRoot: () => void,
): BreadcrumbItemType[] {
    if (items.length <= 1 || availableWidth <= 0) {
        return items;
    }

    let usedWidth = 0;
    let firstVisibleIndex = items.length - 1;
    for (let index = items.length - 1; index >= 0; index -= 1) {
        const separatorWidth = index < items.length - 1 ? 14 : 0;
        const itemWidth = estimateBreadcrumbItemWidth(items[index]) + separatorWidth;
        if (usedWidth + itemWidth > availableWidth) {
            firstVisibleIndex = index + 1;
            break;
        }
        usedWidth += itemWidth;
        firstVisibleIndex = index;
    }

    if (firstVisibleIndex <= 0) {
        return items;
    }

    const clampedIndex = Math.min(firstVisibleIndex, items.length - 1);
    const visibleItems = items.slice(clampedIndex);
    return [
        {
            key: "_BREADCRUMB_COLLAPSED",
            title: "...",
            onClick: onSelectRoot,
        },
        ...visibleItems,
    ];
}

function getReadoutLabel(record: CoverageRecord, source: CoverageSourceRef | undefined): string {
    const sourceLabel = source?.label ?? "Unknown Source";
    let readoutSource = "";
    try {
        const sourceValue = record.readout.get_source();
        const sourceKeyValue = record.readout.get_source_key();
        if (sourceValue && sourceKeyValue) {
            readoutSource = `${sourceValue}[${sourceKeyValue}]`;
        } else if (sourceValue) {
            readoutSource = sourceValue;
        } else if (sourceKeyValue) {
            readoutSource = `[${sourceKeyValue}]`;
        }
    } catch {
        readoutSource = "";
    }
    const prefix = readoutSource ? `${readoutSource} - ` : "";
    return `${prefix}${sourceLabel} (record ${record.sourceRecordIndex})`;
}

function stripExportExtension(fileName: string): string {
    return fileName.replace(/\.(bktgz|json)$/i, "");
}

export type DashboardProps = {
    tree: Tree;
    records: CoverageRecord[];
    sources: CoverageSourceRef[];
    onOpenFile?: () => void | Promise<void>;
    onClearCoverage?: () => void;
    onSetLoadedRecords?: (loadedRecordIds: string[]) => void;
    onMergeRecords?: (recordIds: string[]) => Promise<void> | void;
    onRefreshRecords?: () => Promise<void> | void;
    onExportRecords?: (options: {
        recordIds: string[];
        format: ExportFormat;
        mergeBeforeExport: boolean;
        fileBaseName?: string;
    }) => Promise<void> | void;
    isDragging?: boolean;
};

export default function Dashboard({
    tree,
    records,
    sources,
    onOpenFile,
    onClearCoverage,
    onSetLoadedRecords,
    onMergeRecords,
    onRefreshRecords,
    onExportRecords,
    isDragging = false,
}: DashboardProps) {
    const isElectronRuntime = typeof window !== "undefined" && window.electronAPI !== undefined;

    const [selectedTreeKeys, setSelectedTreeKeys] = useState<TreeKey[]>([]);
    const [expandedTreeKeys, setExpandedTreeKeys] = useState<TreeKey[]>([]);
    const [autoExpandTreeParent, setAutoExpandTreeParent] = useState(true);
    const [sidebarVisible, setSidebarVisible] = useState(readSidebarVisibleFromStorage);
    const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidthFromStorage);
    const breadcrumbContainerRef = useRef<HTMLDivElement | null>(null);
    const [breadcrumbAvailableWidth, setBreadcrumbAvailableWidth] = useState(480);
    const [treeKeyContentKey, setTreeKeyContentKey] = useState(
        {} as { [key: TreeKey]: string | number },
    );
    const [summaryViewMode, setSummaryViewMode] = useState<"table" | "donut">("table");
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editLoadedById, setEditLoadedById] = useState<Record<string, boolean>>({});
    const [mergeSelectedIds, setMergeSelectedIds] = useState<string[]>([]);
    const [editActionBusy, setEditActionBusy] = useState(false);
    const [settingsModalOpen, setSettingsModalOpen] = useState(false);
    const [clearModalOpen, setClearModalOpen] = useState(false);
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const [exportSelectedIds, setExportSelectedIds] = useState<string[]>([]);
    const [exportFormat, setExportFormat] = useState<ExportFormat>("bktgz");
    const [exportMergeBeforeWrite, setExportMergeBeforeWrite] = useState(false);
    const [exportFileName, setExportFileName] = useState("");
    const [exportBusy, setExportBusy] = useState(false);

    const isEmpty = tree.getRoots().length === 0;

    const sourceById = useMemo(() => {
        return new Map(sources.map((source) => [source.id, source]));
    }, [sources]);

    const recordRows = useMemo<RecordTableRow[]>(() => {
        return records.map((record) => {
            const source = sourceById.get(record.sourceRef);
            return {
                id: record.id,
                key: record.id,
                label: getReadoutLabel(record, source),
                sourceLabel: source?.label ?? "Unknown",
                sourceKind: source?.kind ?? "unknown",
                recordIndex: record.sourceRecordIndex,
                isLoaded: record.isLoaded,
            };
        });
    }, [records, sourceById]);

    const loadedRecordRows = useMemo(
        () => recordRows.filter((record) => record.isLoaded),
        [recordRows],
    );

    useEffect(() => {
        if (!editModalOpen) {
            return;
        }
        setEditLoadedById(
            Object.fromEntries(records.map((record) => [record.id, record.isLoaded])),
        );
    }, [records, editModalOpen]);

    useEffect(() => {
        if (!exportModalOpen) {
            return;
        }
        setExportSelectedIds(loadedRecordRows.map((record) => record.id));
        setExportFormat("bktgz");
        setExportMergeBeforeWrite(false);
        setExportFileName(stripExportExtension(getDefaultExportFileName("bktgz", false)));
    }, [exportModalOpen, loadedRecordRows]);

    useEffect(() => {
        if (typeof window === "undefined" || !window.electronAPI?.onOpenPreferences) {
            return;
        }
        window.electronAPI.onOpenPreferences(() => {
            setSettingsModalOpen(true);
        });
    }, []);

    useEffect(() => {
        if (typeof window === "undefined" || !window.electronAPI?.onClearCoverage) {
            return;
        }
        window.electronAPI.onClearCoverage(() => {
            setClearModalOpen(true);
        });
    }, []);

    useEffect(() => {
        if (typeof localStorage === "undefined") {
            return;
        }
        try {
            localStorage.setItem(STORAGE_SIDEBAR_VISIBLE, String(sidebarVisible));
        } catch {
            // ignore
        }
    }, [sidebarVisible]);

    useEffect(() => {
        if (typeof localStorage === "undefined") {
            return;
        }
        try {
            localStorage.setItem(STORAGE_SIDEBAR_WIDTH, String(sidebarWidth));
        } catch {
            // ignore
        }
    }, [sidebarWidth]);

    useLayoutEffect(() => {
        if (isEmpty) {
            return;
        }
        const element = breadcrumbContainerRef.current;
        if (!element || typeof ResizeObserver === "undefined") {
            return;
        }

        const observer = new ResizeObserver((entries) => {
            const nextWidth = Math.max(80, Math.floor(entries[0]?.contentRect.width ?? 0));
            setBreadcrumbAvailableWidth((previousWidth) =>
                previousWidth === nextWidth ? previousWidth : nextWidth,
            );
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [isEmpty]);

    useEffect(() => {
        if (isEmpty) {
            if (selectedTreeKeys.length > 0) {
                setSelectedTreeKeys([]);
                setExpandedTreeKeys([]);
                setTreeKeyContentKey({});
            }
        } else if (selectedTreeKeys.length > 0) {
            const viewKey = selectedTreeKeys[0];
            if (viewKey !== Tree.ROOT && !tree.getNodeByKey(viewKey)) {
                setSelectedTreeKeys([]);
                setExpandedTreeKeys([]);
            }
        }
    }, [tree, selectedTreeKeys, isEmpty]);

    const onSelect = useCallback((newSelectedKeys: TreeKey[]) => {
        const newExpandedKeys = new Set<TreeKey>(expandedTreeKeys);
        for (const newSelectedKey of newSelectedKeys) {
            for (const ancestor of tree.getAncestorsByKey(newSelectedKey)) {
                newExpandedKeys.add(ancestor.key);
            }
        }
        setExpandedTreeKeys(Array.from(newExpandedKeys));
        setSelectedTreeKeys(newSelectedKeys);
        setAutoExpandTreeParent(false);
    }, [expandedTreeKeys, tree]);

    const viewKey = selectedTreeKeys[0] ?? Tree.ROOT;
    const contentViews = tree.getViewsByKey(viewKey);
    const defaultView = contentViews[0];
    const currentContentKey = treeKeyContentKey[viewKey] ?? defaultView.value;
    const showContentViewSelector =
        contentViews.length > 1
        || (contentViews.length === 1 && contentViews[0].value !== "Summary");

    const onViewChange = (newView: string | number) => {
        setTreeKeyContentKey({
            ...treeKeyContentKey,
            [selectedTreeKeys[0]]: newView,
        });
    };

    const isElectronProduction =
        typeof window !== "undefined" && window.location.protocol === "app:";
    const isFileProtocol =
        typeof window !== "undefined" && window.location.protocol === "file:";
    const logoSrc = isElectronProduction
        ? "app://logo.svg"
        : isFileProtocol
          ? "./logo.svg"
          : `${import.meta.env.BASE_URL}logo.svg`;

    const selectedViewContent = useMemo(() => {
        if (isEmpty) {
            return <EmptyState logoSrc={logoSrc} onOpenFile={onOpenFile} />;
        }

        const currentNode = tree.getNodeByKey(viewKey);
        if (!currentNode) {
            return null;
        }

        switch (currentContentKey) {
            case "Pivot":
                return <PointPivotView node={currentNode} />;
            case "Summary":
                if (summaryViewMode === "donut") {
                    return (
                        <CoverageDonut
                            tree={tree}
                            node={currentNode}
                            setSelectedTreeKeys={onSelect}
                        />
                    );
                }
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
    }, [viewKey, currentContentKey, tree, isEmpty, onOpenFile, logoSrc, summaryViewMode, onSelect]);

    const applyLoadedEdits = () => {
        if (!onSetLoadedRecords) {
            return;
        }
        const loadedIds = Object.entries(editLoadedById)
            .filter(([, loaded]) => loaded)
            .map(([id]) => id);
        onSetLoadedRecords(loadedIds);
        setEditModalOpen(false);
    };

    const runMergeSelected = async () => {
        if (!onMergeRecords || mergeSelectedIds.length < 2) {
            return;
        }
        setEditActionBusy(true);
        try {
            await onMergeRecords(mergeSelectedIds);
            setMergeSelectedIds([]);
        } finally {
            setEditActionBusy(false);
        }
    };

    const runExport = async () => {
        if (!onExportRecords || exportSelectedIds.length === 0) {
            return;
        }
        setExportBusy(true);
        try {
            await onExportRecords({
                recordIds: exportSelectedIds,
                format: exportFormat,
                mergeBeforeExport: exportMergeBeforeWrite,
                fileBaseName: exportFileName.trim() || undefined,
            });
            setExportModalOpen(false);
        } catch {
            // Failure: caller (e.g. useFileLoader) shows notification; keep modal open to retry
        } finally {
            setExportBusy(false);
        }
    };

    return (
        <Theme.Consumer>
            {({ theme: configTheme }) => (
                <ConfigProvider theme={antTheme(configTheme)}>
            <Theme.Consumer>
                {({ theme: themeContext }) => {
                    const dragStyle = isDragging
                        ? {
                              border: "3px dashed",
                              borderColor: themeContext.theme.colors.accentbg.value,
                              backgroundColor: hexToRgba(
                                  themeContext.theme.colors.highlightbg.value,
                                  0.25,
                              ),
                              transition: "all 0.2s ease-in-out",
                          }
                        : {};
                    return (
                        <Layout
                            {...view.props}
                            style={{
                                ...view.props.style,
                                ...dragStyle,
                            }}>
                            {!isEmpty && (
                                <Sider
                                    tree={tree}
                                    sidebarVisible={sidebarVisible}
                                    sidebarWidth={sidebarWidth}
                                    selectedTreeKeys={selectedTreeKeys}
                                    setSelectedTreeKeys={onSelect}
                                    expandedTreeKeys={expandedTreeKeys}
                                    setExpandedTreeKeys={setExpandedTreeKeys}
                                    setSidebarWidth={setSidebarWidth}
                                    autoExpandTreeParent={autoExpandTreeParent}
                                    setAutoExpandTreeParent={setAutoExpandTreeParent}
                                />
                            )}
                            <Layout {...view.body.props}>
                                {!isEmpty && (
                                    <Header {...view.body.header.props}>
                                        <Flex {...view.body.header.flex.props}>
                                            <Theme.Consumer>
                                                {({ theme }) => {
                                                    const breadcrumbItems = getBreadCrumbItems({
                                                        tree,
                                                        selectedTreeKeys,
                                                        onSelect,
                                                        theme,
                                                    });
                                                    const visibleBreadcrumbItems = trimBreadcrumbItems(
                                                        breadcrumbItems,
                                                        breadcrumbAvailableWidth,
                                                        () => onSelect([]),
                                                    );
                                                    return (
                                                        <Flex
                                                            align="center"
                                                            gap="small"
                                                            style={{ minWidth: 0, flex: 1 }}>
                                                            <Flex
                                                                align="center"
                                                                gap="small"
                                                                style={{ minWidth: 0, flex: 1 }}>
                                                            <Button
                                                                size="small"
                                                                type="text"
                                                                icon={
                                                                    sidebarVisible ? (
                                                                        <MenuFoldOutlined />
                                                                    ) : (
                                                                        <MenuUnfoldOutlined />
                                                                    )
                                                                }
                                                                onClick={() =>
                                                                    setSidebarVisible(
                                                                        !sidebarVisible,
                                                                    )
                                                                }
                                                                title={
                                                                    sidebarVisible
                                                                        ? "Hide sidebar"
                                                                        : "Show sidebar"
                                                                }
                                                                style={{
                                                                    width: 24,
                                                                    minWidth: 24,
                                                                    paddingInline: 0,
                                                                    display: "inline-flex",
                                                                    justifyContent: "center",
                                                                }}
                                                            />
                                                            <div
                                                                ref={breadcrumbContainerRef}
                                                                style={{
                                                                    minWidth: 0,
                                                                    flex: 1,
                                                                    overflow: "hidden",
                                                                }}>
                                                                <Breadcrumb
                                                                    {...view.body.header.flex.breadcrumb.props}
                                                                    items={visibleBreadcrumbItems}
                                                                />
                                                            </div>
                                                            </Flex>
                                                        </Flex>
                                                    );
                                                }}
                                            </Theme.Consumer>
                                            <Flex gap="small" align="center">
                                                {(showContentViewSelector
                                                    || currentContentKey === "Summary")
                                                && (
                                                    <div
                                                        style={{
                                                            width: 1,
                                                            height: 24,
                                                            backgroundColor:
                                                                themeContext.theme.colors.lowlightbg
                                                                    .value,
                                                            margin: "0 2px",
                                                        }}
                                                    />
                                                )}
                                                {showContentViewSelector && (
                                                    <Flex
                                                        align="center"
                                                        style={{
                                                            border: `1px solid ${themeContext.theme.colors.lowlightbg.value}`,
                                                            borderRadius: 8,
                                                            padding: "2px",
                                                            backgroundColor:
                                                                themeContext.theme.colors.secondarybg
                                                                    .value,
                                                        }}>
                                                        <Segmented
                                                            {...view.body.header.flex.segmented.props}
                                                            style={{ margin: 0 }}
                                                            options={contentViews}
                                                            value={currentContentKey}
                                                            onChange={onViewChange}
                                                        />
                                                    </Flex>
                                                )}
                                                {currentContentKey === "Summary" && (
                                                    <Flex
                                                        align="center"
                                                        style={{
                                                            border: `1px solid ${themeContext.theme.colors.lowlightbg.value}`,
                                                            borderRadius: 8,
                                                            padding: "2px",
                                                            backgroundColor:
                                                                themeContext.theme.colors.secondarybg
                                                                    .value,
                                                        }}>
                                                        <Segmented
                                                            size="small"
                                                            options={[
                                                                {
                                                                    value: "table",
                                                                    icon: <TableOutlined />,
                                                                    label: "Table",
                                                                    title: "View coverage as a table",
                                                                },
                                                                {
                                                                    value: "donut",
                                                                    icon: <PieChartOutlined />,
                                                                    label: "Donut",
                                                                    title:
                                                                        "View coverage as a donut chart",
                                                                },
                                                            ]}
                                                            value={summaryViewMode}
                                                            onChange={(value) =>
                                                                setSummaryViewMode(
                                                                    value as "table" | "donut",
                                                                )
                                                            }
                                                        />
                                                    </Flex>
                                                )}
                                                {(showContentViewSelector
                                                    || currentContentKey === "Summary")
                                                && (
                                                    <div
                                                        style={{
                                                            width: 1,
                                                            height: 24,
                                                            backgroundColor:
                                                                themeContext.theme.colors.lowlightbg
                                                                    .value,
                                                            margin: "0 2px",
                                                        }}
                                                    />
                                                )}

                                                <Flex gap="small" align="center" style={{ paddingRight: 12 }}>
                                                    {onOpenFile && (
                                                        <Button
                                                            icon={<FileAddOutlined />}
                                                            onClick={onOpenFile}
                                                            size="small"
                                                            type="primary">
                                                            Load
                                                        </Button>
                                                    )}
                                                    {onSetLoadedRecords && (
                                                        <Button
                                                            icon={<EditOutlined />}
                                                            onClick={() => {
                                                                setEditModalOpen(true);
                                                                setMergeSelectedIds([]);
                                                            }}
                                                            size="small">
                                                            Edit
                                                        </Button>
                                                    )}
                                                    {onRefreshRecords && isElectronRuntime && (
                                                        <Button
                                                            icon={<ReloadOutlined />}
                                                            onClick={() => onRefreshRecords()}
                                                            size="small">
                                                            Refresh
                                                        </Button>
                                                    )}
                                                    {onExportRecords && (
                                                        <Button
                                                            icon={<ExportOutlined />}
                                                            onClick={() => setExportModalOpen(true)}
                                                            size="small">
                                                            Export
                                                        </Button>
                                                    )}
                                                    {onClearCoverage && (
                                                        <Button
                                                            icon={<ClearOutlined />}
                                                            onClick={() => setClearModalOpen(true)}
                                                            size="small"
                                                            danger>
                                                            Clear
                                                        </Button>
                                                    )}
                                                    <Button
                                                        icon={<SettingOutlined />}
                                                        onClick={() => setSettingsModalOpen(true)}
                                                        size="small"
                                                        title="Settings"
                                                    />
                                                </Flex>
                                            </Flex>
                                        </Flex>
                                    </Header>
                                )}
                                <Content {...view.body.content.props}>{selectedViewContent}</Content>
                            </Layout>
                        </Layout>
                    );
                }}
            </Theme.Consumer>

            <Modal
                title="Clear Coverage"
                open={clearModalOpen}
                onCancel={() => setClearModalOpen(false)}
                okText="Clear"
                okButtonProps={{ danger: true }}
                onOk={() => {
                    onClearCoverage?.();
                    setClearModalOpen(false);
                }}>
                <Typography.Text>
                    Are you sure you want to clear all coverage data?
                </Typography.Text>
            </Modal>

            <Modal
                title="Settings"
                open={settingsModalOpen}
                onCancel={() => setSettingsModalOpen(false)}
                footer={null}>
                <Flex vertical gap={16}>
                    <Theme.Consumer>
                        {(context) => {
                            const selectedThemeValue = themes.some(
                                (candidate) => candidate.name === context.theme.name,
                            )
                                ? context.theme.name
                                : AUTO_THEME_VALUE;

                            return (
                                <Flex align="center" gap={12}>
                                    <Typography.Text strong style={{ fontSize: 14, minWidth: 52 }}>
                                        Theme
                                    </Typography.Text>
                                    <Select
                                        style={{ width: 280 }}
                                        suffixIcon={
                                            <DownOutlined
                                                style={{
                                                    color: context.theme.theme.colors.saturatedtxt.value,
                                                    fontSize: 11,
                                                }}
                                            />
                                        }
                                        value={selectedThemeValue}
                                        onChange={(value) => {
                                            if (value === AUTO_THEME_VALUE) {
                                                context.setTheme(null);
                                                return;
                                            }

                                            const nextTheme = themes.find(
                                                (candidate) => candidate.name === value,
                                            );
                                            context.setTheme(nextTheme ?? null);
                                        }}
                                        options={[
                                            {
                                                value: AUTO_THEME_VALUE,
                                                label: "Auto (system)",
                                            },
                                            ...themes.map((themeOption) => ({
                                                value: themeOption.name,
                                                label:
                                                    themeOption.name.charAt(0).toUpperCase()
                                                    + themeOption.name.slice(1),
                                            })),
                                        ]}
                                    />
                                </Flex>
                            );
                        }}
                    </Theme.Consumer>
                    <Theme.Consumer>
                        {({ theme }) => (
                            <Typography.Text
                                style={{
                                    marginTop: 4,
                                    paddingTop: 10,
                                    display: "block",
                                    borderTop: `1px solid ${theme.theme.colors.lowlightbg.value}`,
                                    color: theme.theme.colors.saturatedtxt.value,
                                    fontSize: 12,
                                    fontWeight: 500,
                                    textAlign: "center",
                                }}
                            >
                                Version v{__APP_VERSION__}
                            </Typography.Text>
                        )}
                    </Theme.Consumer>

                </Flex>
            </Modal>

            <Modal
                title="Edit Records"
                open={editModalOpen}
                onCancel={() => setEditModalOpen(false)}
                width={900}
                footer={[
                    <Button key="cancel" onClick={() => setEditModalOpen(false)}>
                        Cancel
                    </Button>,
                    <Button
                        key="merge"
                        onClick={() => void runMergeSelected()}
                        disabled={mergeSelectedIds.length < 2}
                        loading={editActionBusy}>
                        Merge Selected
                    </Button>,
                    <Button key="apply" type="primary" onClick={applyLoadedEdits}>
                        Apply
                    </Button>,
                ]}>
                <Table<RecordTableRow>
                    size="small"
                    pagination={false}
                    rowKey="id"
                    dataSource={recordRows}
                    rowSelection={{
                        selectedRowKeys: mergeSelectedIds,
                        onChange: (selectedKeys) =>
                            setMergeSelectedIds(selectedKeys as string[]),
                    }}
                    columns={[
                        {
                            title: "Loaded",
                            width: 90,
                            render: (_value, row) => (
                                <Switch
                                    checked={editLoadedById[row.id] ?? row.isLoaded}
                                    onChange={(checked) =>
                                        setEditLoadedById((current) => ({
                                            ...current,
                                            [row.id]: checked,
                                        }))
                                    }
                                />
                            ),
                        },
                        {
                            title: "Record",
                            dataIndex: "label",
                        },
                        {
                            title: "Source",
                            dataIndex: "sourceLabel",
                            width: 190,
                        },
                        {
                            title: "Kind",
                            dataIndex: "sourceKind",
                            width: 130,
                        },
                        {
                            title: "Index",
                            dataIndex: "recordIndex",
                            width: 90,
                        },
                    ]}
                />
                <Theme.Consumer>
                    {({ theme }) => (
                        <Typography.Text
                            style={{
                                marginTop: 12,
                                display: "block",
                                color: theme.theme.colors.primarytxt.value,
                            }}
                        >
                            Selected for merge: {mergeSelectedIds.length}
                        </Typography.Text>
                    )}
                </Theme.Consumer>
            </Modal>

            <Modal
                title="Export Records"
                open={exportModalOpen}
                onCancel={() => setExportModalOpen(false)}
                onOk={() => void runExport()}
                okText="Export"
                confirmLoading={exportBusy}
                okButtonProps={{ disabled: exportSelectedIds.length === 0 }}>
                <Flex vertical gap="middle">
                    <div>
                        <Typography.Text strong>Records</Typography.Text>
                        <div style={{ marginTop: 8, maxHeight: 220, overflowY: "auto" }}>
                            <Checkbox.Group
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 8,
                                }}
                                value={exportSelectedIds}
                                onChange={(values) =>
                                    setExportSelectedIds(values.map((value) => String(value)))
                                }>
                                {loadedRecordRows.map((record) => (
                                    <Checkbox key={record.id} value={record.id}>
                                        {record.label}
                                    </Checkbox>
                                ))}
                            </Checkbox.Group>
                        </div>
                    </div>

                    <div>
                        <Typography.Text strong>Format</Typography.Text>
                        <Select
                            value={exportFormat}
                            onChange={(value) => setExportFormat(value as ExportFormat)}
                            style={{ width: 200, marginLeft: 12 }}
                            options={[
                                { value: "bktgz", label: ".bktgz (Bucket Archive)" },
                                { value: "json", label: ".json" },
                            ]}
                        />
                    </div>

                    <div>
                        <Typography.Text strong>Merge Before Writing</Typography.Text>
                        <Switch
                            style={{ marginLeft: 12 }}
                            checked={exportMergeBeforeWrite}
                            onChange={setExportMergeBeforeWrite}
                        />
                    </div>

                    <div>
                        <Typography.Text strong>File Name</Typography.Text>
                        <Input
                            style={{ marginTop: 8 }}
                            value={exportFileName}
                            onChange={(event) => setExportFileName(event.target.value)}
                            placeholder="coverage_export"
                            addonAfter={exportFormat === "json" ? ".json" : ".bktgz"}
                        />
                    </div>
                </Flex>
            </Modal>

                </ConfigProvider>
            )}
        </Theme.Consumer>
    );
}
