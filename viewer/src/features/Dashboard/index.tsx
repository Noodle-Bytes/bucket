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
    Modal,
    Segmented,
    Select,
    Switch,
    Table,
    Typography,
} from "antd";
import {
    BgColorsOutlined,
    ClearOutlined,
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { BreadcrumbItemType } from "antd/lib/breadcrumb/Breadcrumb";
import { PointGrid, PointSummaryGrid } from "./lib/coveragegrid";
import { PointPivotView } from "./lib/pivottable";
import { CoverageDonut } from "./lib/coveragedonut";
import { hexToRgba } from "@/utils/colors";
import type { CoverageRecord, CoverageSourceRef, ExportFormat } from "@/types/coverageSession";
import { getDefaultExportFileName } from "@/services/exportSaver";

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
                    );
                }}
            </Theme.Consumer>

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
                <Typography.Text type="secondary" style={{ marginTop: 12, display: "block" }}>
                    Selected for merge: {mergeSelectedIds.length}
                </Typography.Text>
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

            <ColorModeToggleButton {...view.float.theme.props} />
        </ConfigProvider>
    );
}
