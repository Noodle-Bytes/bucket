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
    List,
    Modal,
    Segmented,
    Select,
    Switch,
    Table,
    Typography,
    Alert,
} from "antd";
import {
    CaretDownOutlined,
    CaretRightOutlined,
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
    CloseOutlined,
    ExclamationCircleFilled,
    InfoCircleFilled,
} from "@ant-design/icons";
import Tree, { TreeKey, TreeNode } from "./lib/tree";
import Sider, { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "./components/Sider";
import EmptyState from "./components/EmptyState";
import { antTheme, view } from "./theme";
import {
    isValidElement,
    ReactNode,
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
import { buildBucketAntModalTheme } from "@/utils/bucketAntModalTheme";
import type { CoverageRecord, CoverageSourceRef, ExportFormat } from "@/types/coverageSession";
import { getDefaultExportFileName } from "@/services/exportSaver";
import { checkVersionCompat } from "@/utils/versionCompat";

declare const __APP_VERSION__: string;

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
    hitsVsTargetText: string;
    overallCoverageText: string;
    source: string | null;
    defSha: string | null;
    recSha: string | null;
    bucketVersion: string | null;
};

type TopLevelCoverageCounts = {
    coverpoints: number;
    covergroups: number;
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
    const target = Number(node.data.point?.target ?? 0);
    const hits = Number(node.data.point_hit?.hits ?? 0);
    const overallCoverage = target > 0 ? hits / target : 0;

    return {
        name: node.data.point?.name ?? String(node.title),
        coverpoints: counts.coverpoints,
        covergroups: counts.covergroups,
        hitsVsTargetText: `${hits.toLocaleString()} / ${target.toLocaleString()}`,
        overallCoverageText: `${(overallCoverage * 100).toFixed(1)}%`,
        source: getReadoutSource(readout),
        defSha: getReadoutValue(readout, "get_def_sha"),
        recSha: getReadoutValue(readout, "get_rec_sha"),
        bucketVersion: readout.get_bucket_version?.() || null,
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

function BucketVersionCompatAlert({
    colors,
    caution,
    text,
    onDismiss,
}: {
    colors: ThemeType["theme"]["colors"];
    caution: boolean;
    text: string;
    onDismiss: () => void;
}) {
    const accent = colors.accentbg.value;
    const tintStrength = caution ? 0.26 : 0.16;

    return (
        <Alert
            className="bucket-version-compat-alert"
            type="info"
            showIcon
            closable
            closeIcon={
                <CloseOutlined style={{ color: colors.saturatedtxt.value, fontSize: 12 }} />
            }
            onClose={onDismiss}
            icon={
                caution ? (
                    <ExclamationCircleFilled
                        style={{ color: accent, fontSize: 18 }}
                    />
                ) : (
                    <InfoCircleFilled style={{ color: accent, fontSize: 18 }} />
                )
            }
            style={{
                margin: "0 8px 10px",
                paddingInline: 14,
                paddingBlock: 11,
                fontSize: 13,
                lineHeight: 1.55,
                color: colors.saturatedtxt.value,
                border: `1px solid ${hexToRgba(accent, caution ? 0.62 : 0.42)}`,
                borderLeft: `5px solid ${accent}`,
                backgroundColor: hexToRgba(accent, tintStrength),
                boxShadow: `0 0 0 1px ${hexToRgba(colors.saturatedtxt.value, 0.06)} inset`,
            }}
            message={
                <Typography.Text
                    style={{
                        color: colors.saturatedtxt.value,
                        fontSize: 13,
                        lineHeight: 1.55,
                        fontWeight: caution ? 600 : 500,
                    }}>
                    {text}
                </Typography.Text>
            }
        />
    );
}

function TopLevelCoverageInfoPanel({
    info,
    treeSelectionKey,
}: {
    info: RootCoverageInfo;
    /** Selected coverage tree node — warning resets when the user clicks another record. */
    treeSelectionKey: TreeKey;
}) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [versionAlertDismissed, setVersionAlertDismissed] = useState(false);

    useEffect(() => {
        setVersionAlertDismissed(false);
    }, [treeSelectionKey]);

    const compat = checkVersionCompat(info.bucketVersion, __APP_VERSION__);

    const dismissVersionAlert = useCallback(() => {
        setVersionAlertDismissed(true);
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }
        // Donut view listens for resize to recompute available space.
        window.dispatchEvent(new Event("resize"));
    }, [isCollapsed, compat.status, versionAlertDismissed]);

    return (
        <Theme.Consumer>
            {({ theme }) => {
                const colors = theme.theme.colors;
                const showVersionAlert =
                    compat.status !== "match" && !versionAlertDismissed;

                const versionNotice = !showVersionAlert ? null : compat.status === "file_newer" ? (
                    <BucketVersionCompatAlert
                        colors={colors}
                        caution
                        onDismiss={dismissVersionAlert}
                        text={`This file was created with bucket ${compat.fileVersion}, which is newer than this viewer (${compat.viewerVersion}).`}
                    />
                ) : compat.status === "file_older" ? (
                    <BucketVersionCompatAlert
                        colors={colors}
                        caution={false}
                        onDismiss={dismissVersionAlert}
                        text={`This file was created with an older bucket (${compat.fileVersion}). The viewer is broadly backwards compatible.`}
                    />
                ) : compat.status === "unknown" ? (
                    <BucketVersionCompatAlert
                        colors={colors}
                        caution
                        onDismiss={dismissVersionAlert}
                        text="This file doesn’t say which bucket release created it. The viewer is broadly backwards compatible."
                    />
                ) : null;
                return (
                    <>
                        {versionNotice}
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
                                    label="Overall Coverage"
                                    value={info.overallCoverageText}
                                    colors={colors}
                                />
                                <CoverageInfoField
                                    label="Hits / Target"
                                    value={info.hitsVsTargetText}
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
                                <CoverageInfoField
                                    label="Bucket Version"
                                    value={info.bucketVersion}
                                    colors={colors}
                                />
                            </div>
                        )}
                    </section>
                    </>
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
    treeSelectionKey,
}: {
    content: ReactNode;
    info: RootCoverageInfo | null;
    treeSelectionKey: TreeKey;
}) {
    if (!info) {
        return content;
    }

    return (
        <>
            <TopLevelCoverageInfoPanel info={info} treeSelectionKey={treeSelectionKey} />
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
                    treeSelectionKey: viewKey,
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
                        treeSelectionKey: viewKey,
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
                    treeSelectionKey: viewKey,
                });
            }
            case "Point":
                return withTopLevelInfoPanel({
                    content: <PointGrid node={currentNode} />,
                    info: topLevelCoverageInfo,
                    treeSelectionKey: viewKey,
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
