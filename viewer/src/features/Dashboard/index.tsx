/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { Theme as ThemeType, themes } from "@/theme";
import Theme from "@/providers/Theme";
import type { FloatButtonProps, TreeDataNode } from "antd";
import {
    Breadcrumb,
    Button,
    Checkbox,
    ConfigProvider,
    Flex,
    FloatButton,
    Input,
    Layout,
    List,
    Modal,
    Segmented,
    Select,
    Switch,
    Table,
    Typography,
} from "antd";
import {
    BgColorsOutlined,
    CaretDownOutlined,
    CaretRightOutlined,
    ClearOutlined,
    DownOutlined,
    EditOutlined,
    ExportOutlined,
    FileAddOutlined,
    PieChartOutlined,
    ReloadOutlined,
    TableOutlined,
} from "@ant-design/icons";
import Tree, { TreeKey, TreeNode } from "./lib/tree";
import Sider from "./components/Sider";
import EmptyState from "./components/EmptyState";
import { antTheme, view } from "./theme";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { BreadcrumbItemType } from "antd/lib/breadcrumb/Breadcrumb";
import { PointGrid, PointSummaryGrid } from "./lib/coveragegrid";
import { PointPivotView } from "./lib/pivottable";
import { CoverageDonut } from "./lib/coveragedonut";
import { hexToRgba } from "@/utils/colors";
import { buildBucketAntModalTheme } from "@/utils/bucketAntModalTheme";
import type { CoverageRecord, CoverageSourceRef, ExportFormat } from "@/types/coverageSession";
import { getDefaultExportFileName } from "@/services/exportSaver";

const { Header, Content } = Layout;

type RecordTableRow = {
    id: string;
    key: string;
    label: string;
    sourceLabel: string;
    sourceKind: string;
    isLoaded: boolean;
};

type RootCoverageInfo = {
    name: string;
    coverpoints: number;
    covergroups: number;
    source: string | null;
    defSha: string | null;
    recSha: string | null;
};

type TopLevelCoverageCounts = {
    coverpoints: number;
    covergroups: number;
};

const ColorModeToggleButton = (props: FloatButtonProps) => {
    return (
        <Theme.Consumer>
            {(context) => {
                const onClick = () => {
                    const currentIdx =
                        themes.findIndex((v) => v.name === context.theme.name) ?? 0;
                    const nextIdx = (currentIdx + 1) % (themes.length + 1);
                    context.setTheme(themes[nextIdx] ?? null);
                };
                return (
                    <FloatButton
                        {...props}
                        onClick={onClick}
                        icon={<BgColorsOutlined />}
                        tooltip="Toggle theme (light/dark/auto)"
                    />
                );
            }}
        </Theme.Consumer>
    );
};

function getReadoutValue(readout: Readout, getter: keyof Pick<Readout, "get_def_sha" | "get_rec_sha">) {
    try {
        return readout[getter]();
    } catch {
        return null;
    }
}

function getReadoutSource(readout: Readout): string | null {
    try {
        const source = readout.get_source?.();
        const sourceKey = readout.get_source_key?.();
        if (source && sourceKey) {
            return `${source}[${sourceKey}]`;
        }
        if (source) {
            return source;
        }
        if (sourceKey) {
            return `[${sourceKey}]`;
        }
        return null;
    } catch {
        return null;
    }
}

function getTopLevelCoverageInfo(
    node: TreeNode,
    counts: TopLevelCoverageCounts,
): RootCoverageInfo {
    const readout = node.data.readout as Readout;

    return {
        name: node.data.point?.name ?? String(node.title),
        coverpoints: counts.coverpoints,
        covergroups: counts.covergroups,
        source: getReadoutSource(readout),
        defSha: getReadoutValue(readout, "get_def_sha"),
        recSha: getReadoutValue(readout, "get_rec_sha"),
    };
}

function getTopLevelCoverageCountsByKey(tree: Tree): Map<TreeKey, TopLevelCoverageCounts> {
    const countsByKey = new Map<TreeKey, TopLevelCoverageCounts>();

    for (const root of tree.getRoots()) {
        let coverpoints = 0;
        let covergroups = 0;

        for (const [subNode] of tree.walk([root])) {
            if (subNode.children?.length) {
                covergroups += 1;
            } else {
                coverpoints += 1;
            }
        }

        countsByKey.set(root.key, { coverpoints, covergroups });
    }

    return countsByKey;
}

function CoverageInfoField({
    label,
    value,
    mono = false,
    colors,
}: {
    label: string;
    value: string | number | null;
    mono?: boolean;
    colors: ThemeType["theme"]["colors"];
}) {
    const displayValue = value === null || value === "" ? "Unknown" : value;

    return (
        <>
            <Typography.Text style={{ color: colors.desaturatedtxt.value, fontSize: 12 }}>
                {label}
            </Typography.Text>
            <Typography.Text
                style={{
                    color: colors.primarytxt.value,
                    fontSize: 12,
                    fontFamily: mono ? "monospace" : undefined,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}>
                {displayValue}
            </Typography.Text>
        </>
    );
}

function TopLevelCoverageInfoPanel({ info }: { info: RootCoverageInfo }) {
    const [isCollapsed, setIsCollapsed] = useState(false);

    return (
        <Theme.Consumer>
            {({ theme }) => {
                const colors = theme.theme.colors;
                return (
                    <section
                        style={{
                            margin: "6px 10px 8px",
                            border: `1px solid ${colors.lowlightbg.value}`,
                            backgroundColor: colors.secondarybg.value,
                        }}>
                        <button
                            type="button"
                            aria-expanded={!isCollapsed}
                            onClick={() => setIsCollapsed((current) => !current)}
                            style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                border: 0,
                                padding: "5px 8px",
                                color: colors.primarytxt.value,
                                background: "transparent",
                                cursor: "pointer",
                                fontSize: 12,
                                fontWeight: 600,
                                textAlign: "left",
                            }}>
                            {isCollapsed ? <CaretRightOutlined /> : <CaretDownOutlined />}
                            Coverage Info
                        </button>
                        {!isCollapsed && (
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "max-content minmax(0, 1fr) max-content minmax(0, 1fr)",
                                    gap: "4px 14px",
                                    padding: "0 8px 8px 24px",
                                }}>
                                <CoverageInfoField label="Name" value={info.name} colors={colors} />
                                <CoverageInfoField
                                    label="Source"
                                    value={info.source}
                                    colors={colors}
                                />
                                <CoverageInfoField
                                    label="Coverpoints"
                                    value={info.coverpoints.toLocaleString()}
                                    colors={colors}
                                />
                                <CoverageInfoField
                                    label="Covergroups"
                                    value={info.covergroups.toLocaleString()}
                                    colors={colors}
                                />
                                <CoverageInfoField
                                    label="Definition SHA"
                                    value={info.defSha}
                                    mono
                                    colors={colors}
                                />
                                <CoverageInfoField
                                    label="Record SHA"
                                    value={info.recSha}
                                    mono
                                    colors={colors}
                                />
                            </div>
                        )}
                    </section>
                );
            }}
        </Theme.Consumer>
    );
}

function getTopLevelInfoNode(tree: Tree, viewKey: TreeKey): TreeNode | null {
    const roots = tree.getRoots();
    if (viewKey === Tree.ROOT) {
        return roots.length === 1 ? roots[0] : null;
    }

    return roots.find((node) => node.key === viewKey) ?? null;
}

function withTopLevelInfoPanel({
    content,
    info,
}: {
    content: ReactNode;
    info: RootCoverageInfo | null;
}) {
    if (!info) {
        return content;
    }

    return (
        <>
            <TopLevelCoverageInfoPanel info={info} />
            {content}
        </>
    );
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

function getReadoutLabel(
    record: CoverageRecord,
    source: CoverageSourceRef | undefined,
    recordsInSource: number,
): string {
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
    const base = `${prefix}${sourceLabel}`;
    if (recordsInSource <= 1) {
        return base;
    }
    return `${base} (record ${record.sourceRecordIndex + 1})`;
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
    const [treeKeyContentKey, setTreeKeyContentKey] = useState(
        {} as { [key: TreeKey]: string | number },
    );
    const [summaryViewMode, setSummaryViewMode] = useState<"table" | "donut">("table");
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editLoadedById, setEditLoadedById] = useState<Record<string, boolean>>({});
    const [mergeSelectedIds, setMergeSelectedIds] = useState<string[]>([]);
    const [editActionBusy, setEditActionBusy] = useState(false);
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

    const recordCountBySourceRef = useMemo(() => {
        const counts = new Map<string, number>();
        for (const record of records) {
            counts.set(record.sourceRef, (counts.get(record.sourceRef) ?? 0) + 1);
        }
        return counts;
    }, [records]);

    const recordRows = useMemo<RecordTableRow[]>(() => {
        return records.map((record) => {
            const source = sourceById.get(record.sourceRef);
            const recordsInSource = recordCountBySourceRef.get(record.sourceRef) ?? 1;
            return {
                id: record.id,
                key: record.id,
                label: getReadoutLabel(record, source, recordsInSource),
                sourceLabel: source?.label ?? "Unknown",
                sourceKind: source?.kind ?? "unknown",
                isLoaded: record.isLoaded,
            };
        });
    }, [records, sourceById, recordCountBySourceRef]);

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

    const sourceInfo = useMemo(() => {
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
            } catch {
                return { source: null, source_key: null };
            }
        }
        return { source: null, source_key: null };
    }, [tree, viewKey]);

    const topLevelCoverageCountsByKey = useMemo(
        () => getTopLevelCoverageCountsByKey(tree),
        [tree],
    );

    const topLevelCoverageInfo = useMemo(() => {
        const infoNode = getTopLevelInfoNode(tree, viewKey);
        if (!infoNode) {
            return null;
        }

        const counts = topLevelCoverageCountsByKey.get(infoNode.key);
        if (!counts) {
            return null;
        }

        return getTopLevelCoverageInfo(infoNode, counts);
    }, [tree, viewKey, topLevelCoverageCountsByKey]);

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
                return withTopLevelInfoPanel({
                    content: <PointPivotView node={currentNode} />,
                    info: topLevelCoverageInfo,
                });
            case "Summary": {
                if (summaryViewMode === "donut") {
                    const donut = (
                        <CoverageDonut
                            tree={tree}
                            node={currentNode}
                            setSelectedTreeKeys={onSelect}
                        />
                    );
                    return withTopLevelInfoPanel({
                        content: donut,
                        info: topLevelCoverageInfo,
                    });
                }
                const summary = (
                    <PointSummaryGrid
                        tree={tree}
                        node={currentNode}
                        setSelectedTreeKeys={onSelect}
                    />
                );
                return withTopLevelInfoPanel({
                    content: summary,
                    info: topLevelCoverageInfo,
                });
            }
            case "Point":
                return withTopLevelInfoPanel({
                    content: <PointGrid node={currentNode} />,
                    info: topLevelCoverageInfo,
                });
            default:
                throw new Error("Invalid view!?");
        }
    }, [
        viewKey,
        currentContentKey,
        tree,
        isEmpty,
        onOpenFile,
        logoSrc,
        summaryViewMode,
        onSelect,
        topLevelCoverageInfo,
    ]);

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
        <ConfigProvider theme={antTheme}>
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
                    const modalAnt = buildBucketAntModalTheme(themeContext);
                    const clM = themeContext.theme.colors;
                    const panelM = clM.tertiarybg.value;
                    const borderM = clM.secondarybg.value;
                    const txtM = clM.primarytxt.value;
                    const mutedM = clM.desaturatedtxt.value;
                    const tableSurfaceM = clM.primarybg.value;
                    const baseModalChrome = {
                        rootClassName: themeContext.theme.className,
                        styles: {
                            mask: { backgroundColor: "rgba(0, 0, 0, 0.55)" },
                            content: {
                                backgroundColor: panelM,
                                padding: 0,
                                border: `1px solid ${borderM}`,
                            },
                            header: {
                                backgroundColor: panelM,
                                color: txtM,
                                borderBottom: `1px solid ${borderM}`,
                            },
                            body: { backgroundColor: panelM },
                            footer: {
                                backgroundColor: panelM,
                                borderTop: `1px solid ${borderM}`,
                            },
                        },
                    };

                    return (
                        <>
                        <Layout
                            {...view.props}
                            style={{
                                ...view.props.style,
                                ...dragStyle,
                            }}>
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
                                {!isEmpty && (
                                    <Header {...view.body.header.props}>
                                        <Flex {...view.body.header.flex.props}>
                                            <Theme.Consumer>
                                                {({ theme }) => (
                                                    <>
                                                        <Breadcrumb
                                                            {...view.body.header.flex.breadcrumb.props}
                                                            items={getBreadCrumbItems({
                                                                tree,
                                                                selectedTreeKeys,
                                                                onSelect,
                                                                theme,
                                                            })}></Breadcrumb>
                                                        {(sourceInfo.source || sourceInfo.source_key) && (
                                                            <Flex
                                                                gap="small"
                                                                style={{ marginLeft: "16px" }}>
                                                                <span
                                                                    style={{
                                                                        color: theme.theme.colors
                                                                            .primarytxt.value,
                                                                    }}>
                                                                    {sourceInfo.source &&
                                                                    sourceInfo.source_key
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
                                            <Flex gap="small" align="center">
                                                {showContentViewSelector && (
                                                    <Segmented
                                                        {...view.body.header.flex.segmented.props}
                                                        options={contentViews}
                                                        value={currentContentKey}
                                                        onChange={onViewChange}
                                                    />
                                                )}
                                                {currentContentKey === "Summary" && (
                                                    <Flex
                                                        align="center"
                                                        gap="small"
                                                        style={{
                                                            border: `1px solid ${themeContext.theme.colors.lowlightbg.value}`,
                                                            borderRadius: 8,
                                                            padding: "2px 6px",
                                                            backgroundColor:
                                                                themeContext.theme.colors.secondarybg
                                                                    .value,
                                                        }}>
                                                        <Typography.Text
                                                            style={{
                                                                color: themeContext.theme.colors
                                                                    .desaturatedtxt.value,
                                                                fontSize: 12,
                                                                letterSpacing: 0.3,
                                                            }}>
                                                            View
                                                        </Typography.Text>
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

                                                <Flex gap="small" align="center">
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
                                                            onClick={onClearCoverage}
                                                            size="small"
                                                            danger>
                                                            Clear
                                                        </Button>
                                                    )}
                                                </Flex>
                                            </Flex>
                                        </Flex>
                                    </Header>
                                )}
                                <Content {...view.body.content.props}>{selectedViewContent}</Content>
                            </Layout>
                        </Layout>
                        <ConfigProvider theme={modalAnt}>
                            <Modal
                                title={
                                    <span
                                        style={{
                                            fontSize: 16,
                                            fontWeight: 600,
                                            letterSpacing: "-0.01em",
                                            color: txtM,
                                            lineHeight: 1.35,
                                        }}
                                    >
                                        Edit records
                                    </span>
                                }
                                open={editModalOpen}
                                onCancel={() => setEditModalOpen(false)}
                                width={1040}
                                closable={false}
                                {...baseModalChrome}
                                styles={{
                                    ...baseModalChrome.styles,
                                    header: {
                                        ...baseModalChrome.styles.header,
                                        padding: "16px 20px 14px",
                                        borderBottom: `1px solid ${borderM}`,
                                    },
                                    content: {
                                        ...baseModalChrome.styles.content,
                                        maxHeight: "min(720px, 88vh)",
                                        display: "flex",
                                        flexDirection: "column",
                                        overflow: "hidden",
                                    },
                                    body: {
                                        ...baseModalChrome.styles.body,
                                        flex: "1 1 auto",
                                        minHeight: 0,
                                        overflow: "hidden",
                                        display: "flex",
                                        flexDirection: "column",
                                        padding: "12px 16px",
                                        WebkitFontSmoothing: "antialiased",
                                    },
                                    footer: {
                                        ...baseModalChrome.styles.footer,
                                        flexShrink: 0,
                                        padding: "12px 16px",
                                    },
                                }}
                                footer={
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            width: "100%",
                                            gap: 8,
                                            flexWrap: "wrap",
                                            justifyContent: "flex-end",
                                        }}
                                    >
                                        <Typography.Text
                                            style={{
                                                flex: "1 1 200px",
                                                marginRight: "auto",
                                                color: mutedM,
                                                fontSize: 13,
                                            }}
                                        >
                                            Selected for merge: {mergeSelectedIds.length}
                                        </Typography.Text>
                                        <Button key="cancel" onClick={() => setEditModalOpen(false)}>
                                            Cancel
                                        </Button>
                                        <Button
                                            key="merge"
                                            onClick={() => void runMergeSelected()}
                                            disabled={mergeSelectedIds.length < 2}
                                            loading={editActionBusy}
                                        >
                                            Merge Selected
                                        </Button>
                                        <Button key="apply" type="primary" onClick={applyLoadedEdits}>
                                            Apply
                                        </Button>
                                    </div>
                                }
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        flex: 1,
                                        minHeight: 0,
                                    }}
                                >
                                    <div
                                        style={{
                                            flex: 1,
                                            minHeight: 200,
                                            overflow: "hidden",
                                            border: `1px solid ${borderM}`,
                                            borderRadius: 8,
                                            backgroundColor: tableSurfaceM,
                                        }}
                                    >
                                        <Table<RecordTableRow>
                                            size="small"
                                            bordered={false}
                                            showSorterTooltip={false}
                                            pagination={false}
                                            rowKey="id"
                                            dataSource={recordRows}
                                            tableLayout="fixed"
                                            scroll={{ y: 400 }}
                                            rowSelection={{
                                                selectedRowKeys: mergeSelectedIds,
                                                onChange: (selectedKeys) =>
                                                    setMergeSelectedIds(selectedKeys as string[]),
                                            }}
                                            columns={[
                                                {
                                                    title: "Loaded",
                                                    width: 88,
                                                    render: (_value, row) => (
                                                        <Switch
                                                            checked={
                                                                editLoadedById[row.id] ?? row.isLoaded
                                                            }
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
                                                    ellipsis: true,
                                                    render: (text: string) => (
                                                        <Typography.Text
                                                            style={{
                                                                color: txtM,
                                                                fontSize: 13,
                                                                lineHeight: 1.45,
                                                            }}
                                                        >
                                                            {text}
                                                        </Typography.Text>
                                                    ),
                                                },
                                                {
                                                    title: "Source",
                                                    dataIndex: "sourceLabel",
                                                    width: 220,
                                                    ellipsis: true,
                                                },
                                                {
                                                    title: "Kind",
                                                    dataIndex: "sourceKind",
                                                    width: 112,
                                                    align: "left",
                                                    render: (text: string) => (
                                                        <Typography.Text
                                                            style={{ color: txtM, fontSize: 13 }}
                                                        >
                                                            {text}
                                                        </Typography.Text>
                                                    ),
                                                },
                                            ]}
                                        />
                                    </div>
                                </div>
                            </Modal>

                            <Modal
                                title={
                                    <span
                                        style={{
                                            fontSize: 16,
                                            fontWeight: 600,
                                            letterSpacing: "-0.01em",
                                            color: txtM,
                                            lineHeight: 1.35,
                                        }}
                                    >
                                        Export records
                                    </span>
                                }
                                open={exportModalOpen}
                                onCancel={() => setExportModalOpen(false)}
                                closable={false}
                                footer={
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "flex-end",
                                            gap: 8,
                                            width: "100%",
                                        }}
                                    >
                                        <Button key="cancel" onClick={() => setExportModalOpen(false)}>
                                            Cancel
                                        </Button>
                                        <Button
                                            key="export"
                                            type="primary"
                                            loading={exportBusy}
                                            disabled={exportSelectedIds.length === 0}
                                            onClick={() => void runExport()}
                                        >
                                            Export
                                        </Button>
                                    </div>
                                }
                                width={960}
                                {...baseModalChrome}
                                styles={{
                                    ...baseModalChrome.styles,
                                    header: {
                                        ...baseModalChrome.styles.header,
                                        padding: "16px 20px 14px",
                                        borderBottom: `1px solid ${borderM}`,
                                    },
                                    content: {
                                        ...baseModalChrome.styles.content,
                                        maxHeight: "min(88vh, 820px)",
                                        display: "flex",
                                        flexDirection: "column",
                                        overflow: "hidden",
                                    },
                                    body: {
                                        ...baseModalChrome.styles.body,
                                        flex: "1 1 auto",
                                        minHeight: 0,
                                        overflow: "hidden",
                                        padding: "14px 20px 16px",
                                        WebkitFontSmoothing: "antialiased",
                                    },
                                    footer: {
                                        ...baseModalChrome.styles.footer,
                                        flexShrink: 0,
                                        padding: "12px 16px",
                                    },
                                }}
                            >
                                <Flex vertical gap="middle" style={{ minHeight: 0 }}>
                                    <div>
                                        <Typography.Text strong style={{ color: txtM }}>
                                            File name
                                        </Typography.Text>
                                        <Input
                                            style={{ marginTop: 8 }}
                                            value={exportFileName}
                                            onChange={(event) =>
                                                setExportFileName(event.target.value)
                                            }
                                            placeholder="bucket_export"
                                            addonAfter={
                                                <Select<ExportFormat>
                                                    variant="borderless"
                                                    popupMatchSelectWidth={88}
                                                    listHeight={88}
                                                    suffixIcon={
                                                        <DownOutlined
                                                            style={{
                                                                color: txtM,
                                                                fontSize: 11,
                                                                opacity: 0.92,
                                                            }}
                                                        />
                                                    }
                                                    value={exportFormat}
                                                    onChange={(value) => {
                                                        setExportFormat(value);
                                                        setExportFileName((current) =>
                                                            stripExportExtension(current),
                                                        );
                                                    }}
                                                    options={[
                                                        { value: "bktgz", label: ".bktgz" },
                                                        { value: "json", label: ".json" },
                                                    ]}
                                                    style={{
                                                        width: 88,
                                                        minWidth: 88,
                                                        maxWidth: 88,
                                                    }}
                                                    styles={{
                                                        popup: { root: { width: 88, minWidth: 88 } },
                                                    }}
                                                    aria-label="Export file format"
                                                />
                                            }
                                        />
                                    </div>

                                    <Flex align="center" gap="small" wrap="wrap">
                                        <Typography.Text strong style={{ color: txtM }}>
                                            Merge before writing
                                        </Typography.Text>
                                        <Switch
                                            checked={exportMergeBeforeWrite}
                                            onChange={setExportMergeBeforeWrite}
                                        />
                                    </Flex>

                                    <div style={{ flex: "1 1 auto", minHeight: 0 }}>
                                        <Typography.Text strong style={{ color: txtM }}>
                                            Records
                                        </Typography.Text>
                                        <div
                                            style={{
                                                marginTop: 8,
                                                maxHeight: "min(240px, 32vh)",
                                                minHeight: 96,
                                                overflowY: "auto",
                                                overflowX: "hidden",
                                                scrollbarGutter: "stable",
                                                border: `1px solid ${borderM}`,
                                                borderRadius: 8,
                                                padding: "8px 10px",
                                                backgroundColor: tableSurfaceM,
                                            }}
                                        >
                                            {loadedRecordRows.length === 0 ? (
                                                <Typography.Text
                                                    style={{ color: mutedM, fontSize: 13 }}
                                                >
                                                    No loaded records to export.
                                                </Typography.Text>
                                            ) : (
                                                <Checkbox.Group
                                                    style={{ display: "block", width: "100%" }}
                                                    value={exportSelectedIds}
                                                    onChange={(values) =>
                                                        setExportSelectedIds(
                                                            values.map((value) => String(value)),
                                                        )
                                                    }
                                                >
                                                    <List<RecordTableRow>
                                                        split={false}
                                                        bordered={false}
                                                        dataSource={loadedRecordRows}
                                                        rowKey="id"
                                                        style={{
                                                            background: "transparent",
                                                        }}
                                                        renderItem={(record) => (
                                                            <List.Item
                                                                style={{
                                                                    padding: "5px 4px",
                                                                    border: "none",
                                                                    display: "block",
                                                                }}
                                                            >
                                                                <Checkbox value={record.id}>
                                                                    <Typography.Text
                                                                        style={{
                                                                            color: txtM,
                                                                            fontSize: 13,
                                                                            lineHeight: 1.45,
                                                                        }}
                                                                    >
                                                                        {record.label}
                                                                    </Typography.Text>
                                                                </Checkbox>
                                                            </List.Item>
                                                        )}
                                                    />
                                                </Checkbox.Group>
                                            )}
                                        </div>
                                    </div>
                                </Flex>
                            </Modal>
                        </ConfigProvider>
                        </>
                    );
                }}
            </Theme.Consumer>

            <ColorModeToggleButton {...view.float.theme.props} />
        </ConfigProvider>
    );
}
