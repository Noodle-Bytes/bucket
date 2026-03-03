/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import CoverageTree, { PointNode } from "./coveragetree";
import { Alert, Button, Modal, Select, Space, Table, TableProps, Typography } from "antd";
import { view } from "../theme";
import { TreeKey } from "./tree";
import { Theme as ThemeType } from "@/theme";
import { natCompare, numCompare } from "./compare";
import Theme from "@/providers/Theme";
import {
    FolderOutlined,
    FileTextOutlined,
    CaretRightOutlined,
    CaretDownOutlined,
} from "@ant-design/icons";
import { hexToRgba, getCoverageColor } from "@/utils/colors";
import {
    CSSProperties,
    MouseEvent,
    useEffect,
    useMemo,
    useState,
} from "react";
import {
    LARGE_TABLE_SCROLL_Y,
    LargeModeOverrideState,
    POINT_FULL_FEATURE_ROW_LIMIT,
    PointTableMode,
} from "./perf-config";
import {
    acknowledgeLargeModeWarning,
    createInitialLargeModeOverrideState,
    resolvePointTableMode,
    withForcedFullFeatures,
} from "./pointtable-mode";

type CoverageRecord = {
    key: number;
    target: number;
    hits: number;
    hit_ratio: number;
    goal_name: string;
    [axisName: string]: string | number;
};

type LargeCoverageRecord = {
    key: number;
    row: number;
    target: number;
    hits: number;
    hit_ratio: number;
    goal_name: string;
};

type SummaryRecord = {
    key: TreeKey;
    name: string;
    desc: string;
    depth: number;
    isCovergroup: boolean;
    target: number;
    hits: number;
    target_buckets: number;
    hit_buckets: number;
    full_buckets: number;
    hit_ratio: number;
    buckets_hit_ratio: number;
    buckets_full_ratio: number;
    [key: string]: string | number | boolean;
};

type RecordWithRatio = {
    [key: string]: string | number | boolean | undefined;
    hit_ratio?: number;
    buckets_hit_ratio?: number;
    buckets_full_ratio?: number;
};

type AxisModel = {
    name: string;
    offset: number;
    size: number;
    stride: number;
};

type PointTableModel = {
    rowCount: number;
    axes: AxisTuple[];
    axisModels: AxisModel[];
    axisValues: AxisValueTuple[];
    goals: GoalTuple[];
    goalIndices: number[];
    bucketKeys: number[];
    hits: number[];
    buildMs: number;
};

type HitClassFilter = "all" | "full" | "partial" | "empty" | "illegal" | "ignore";
type LargeSortOption =
    | "bucket_asc"
    | "bucket_desc"
    | "hits_desc"
    | "hits_asc"
    | "ratio_desc"
    | "ratio_asc";

export type PointGridProps = {
    node: PointNode;
};

let sessionLargeModeWarningAcknowledged = false;
type ComparableRecord = Record<string, string | number | boolean | undefined>;

function getCoverageColumnConfig(theme: ThemeType, columnKey: string) {
    return {
        render: (ratio: number) => {
            if (Number.isNaN(ratio) || Object.is(ratio, -0)) {
                return "-";
            }
            if (ratio < 0) {
                return "!!!";
            }
            return `${(Math.min(ratio, 1) * 100).toFixed(1)}%`;
        },
        onCell: (record: RecordWithRatio) => {
            const ratio = record[columnKey] as number;
            let backgroundColor = "unset";
            let fontWeight = "unset";
            if (ratio >= 1) {
                backgroundColor = getCoverageColor(ratio, theme.theme.colors);
            } else if (Number.isNaN(ratio) || Object.is(ratio, -0)) {
                // NaN if target is zero (don't care)
                // -0 if target is negative (illegal) and not hit
            } else if (ratio <= 0) {
                backgroundColor = getCoverageColor(ratio, theme.theme.colors);
                fontWeight = "bold";
            } else {
                backgroundColor = getCoverageColor(ratio, theme.theme.colors);
            }
            return {
                style: {
                    backgroundColor,
                    fontWeight,
                },
            };
        },
    };
}

function getColumnMixedCompare(columnKey: string) {
    return (a: ComparableRecord, b: ComparableRecord) =>
        natCompare(
            (a[columnKey] as string | number | undefined) ?? "",
            (b[columnKey] as string | number | undefined) ?? "",
        );
}

function getColumnNumCompare(columnKey: string) {
    return (a: ComparableRecord, b: ComparableRecord) =>
        numCompare(
            Number((a[columnKey] as number | string | undefined) ?? Number.NaN),
            Number((b[columnKey] as number | string | undefined) ?? Number.NaN),
        );
}

function buildPointTableModel(node: PointNode): PointTableModel {
    const startTs = performance.now();
    const pointData = node.data;
    const readout = pointData.readout;
    const {
        axis_start,
        axis_end,
        axis_value_start,
        axis_value_end,
        bucket_start,
        bucket_end,
        goal_start,
        goal_end,
    } = pointData.point;

    const axes = Array.from(readout.iter_axes(axis_start, axis_end));
    const axisValues = Array.from(
        readout.iter_axis_values(axis_value_start, axis_value_end),
    );
    const goals = Array.from(readout.iter_goals(goal_start, goal_end));

    const axisModels: AxisModel[] = axes.map((axis) => ({
        name: axis.name,
        offset: axis.value_start - axis_value_start,
        size: axis.value_end - axis.value_start,
        stride: 1,
    }));

    let stride = 1;
    for (let axisIdx = axisModels.length - 1; axisIdx >= 0; axisIdx--) {
        axisModels[axisIdx].stride = stride;
        stride *= Math.max(axisModels[axisIdx].size, 1);
    }

    const rowCount = bucket_end - bucket_start;
    const goalIndices = new Array<number>(rowCount);
    const bucketKeys = new Array<number>(rowCount);
    const hits = new Array<number>(rowCount);

    const bucketHits = readout.iter_bucket_hits(bucket_start, bucket_end);
    let row = 0;
    for (const bucketGoal of readout.iter_bucket_goals(bucket_start, bucket_end)) {
        const nextBucketHit = bucketHits.next();
        if (nextBucketHit.done) {
            break;
        }

        goalIndices[row] = bucketGoal.goal - goal_start;
        bucketKeys[row] = nextBucketHit.value.start;
        hits[row] = nextBucketHit.value.hits;
        row += 1;
    }

    if (row !== rowCount) {
        goalIndices.length = row;
        bucketKeys.length = row;
        hits.length = row;
    }

    return {
        rowCount: row,
        axes,
        axisModels,
        axisValues,
        goals,
        goalIndices,
        bucketKeys,
        hits,
        buildMs: performance.now() - startTs,
    };
}

function getAxisValue(model: PointTableModel, row: number, axisIdx: number): string {
    const axisModel = model.axisModels[axisIdx];
    const valueIndex = Math.floor(row / axisModel.stride) % axisModel.size;
    return model.axisValues[axisModel.offset + valueIndex].value;
}

function classifyHitClass(target: number, hits: number): Exclude<HitClassFilter, "all"> {
    if (target < 0) {
        return "illegal";
    }
    if (target === 0) {
        return "ignore";
    }
    if (hits >= target) {
        return "full";
    }
    if (hits > 0) {
        return "partial";
    }
    return "empty";
}

function sortLargeRows(
    rows: number[],
    model: PointTableModel,
    sortBy: LargeSortOption,
): void {
    rows.sort((a, b) => {
        const targetA = model.goals[model.goalIndices[a]].target;
        const targetB = model.goals[model.goalIndices[b]].target;
        const hitsA = model.hits[a];
        const hitsB = model.hits[b];
        const ratioA = hitsA / targetA;
        const ratioB = hitsB / targetB;

        switch (sortBy) {
            case "bucket_asc":
                return model.bucketKeys[a] - model.bucketKeys[b];
            case "bucket_desc":
                return model.bucketKeys[b] - model.bucketKeys[a];
            case "hits_desc":
                return hitsB - hitsA;
            case "hits_asc":
                return hitsA - hitsB;
            case "ratio_desc":
                return numCompare(ratioB, ratioA);
            case "ratio_asc":
                return numCompare(ratioA, ratioB);
            default:
                return 0;
        }
    });
}

function getFullColumns(
    theme: ThemeType,
    model: PointTableModel,
    axisValueStart: number,
): TableProps<CoverageRecord>["columns"] {
    return [
        {
            title: "Bucket",
            dataIndex: "key",
            key: "key",
        },
        {
            title: "Axes",
            children: model.axes.map((axis) => ({
                title: axis.name,
                dataIndex: axis.name,
                key: axis.name,
                filters: model.axisValues
                    .slice(
                        axis.value_start - axisValueStart,
                        axis.value_end - axisValueStart,
                    )
                    .map((axisValue) => ({
                        text: axisValue.value,
                        value: axisValue.value,
                    })),
                filterMode: "tree",
                filterSearch: true,
                onFilter: (value, record) => record[axis.name] == value,
                sorter: getColumnMixedCompare(axis.name),
            })),
        },
        {
            title: "Goal",
            children: [
                {
                    title: "Name",
                    dataIndex: "goal_name",
                    key: "goal_name",
                    filters: model.goals.map((goal) => ({
                        text: `${goal.name} - ${goal.description}`,
                        value: goal.name,
                    })),
                    filterMode: "tree",
                    filterSearch: true,
                    onFilter: (value, record) => record.goal_name == value,
                    sorter: getColumnMixedCompare("goal_name"),
                },
                {
                    title: "Target",
                    dataIndex: "target",
                    key: "target",
                    sorter: getColumnNumCompare("target"),
                },
                {
                    title: "Hits",
                    dataIndex: "hits",
                    key: "hits",
                    sorter: getColumnNumCompare("hits"),
                },
                {
                    title: "Hit %",
                    dataIndex: "hit_ratio",
                    key: "hit_ratio",
                    filters: [
                        { text: "Full", value: "full" },
                        { text: "Partial", value: "partial" },
                        { text: "Empty", value: "empty" },
                        { text: "Illegal", value: "illegal" },
                        { text: "Ignore", value: "ignore" },
                    ],
                    onFilter: (value, record) => {
                        switch (value) {
                            case "full":
                                return record.target > 0 && record.hits >= record.target;
                            case "partial":
                                return (
                                    record.target > 0
                                    && record.hits > 0
                                    && record.hits < record.target
                                );
                            case "empty":
                                return record.target > 0 && record.hits === 0;
                            case "illegal":
                                return record.target < 0;
                            case "ignore":
                                return record.target === 0;
                            default:
                                throw new Error(`Unexpected value ${value}`);
                        }
                    },
                    filterMode: "tree",
                    filterSearch: true,
                    ...getCoverageColumnConfig(theme, "hit_ratio"),
                    sorter: getColumnNumCompare("hit_ratio"),
                },
            ],
        },
    ];
}

function getLargeColumns(
    theme: ThemeType,
    model: PointTableModel,
): TableProps<LargeCoverageRecord>["columns"] {
    return [
        {
            title: "Bucket",
            dataIndex: "key",
            key: "key",
            width: 100,
        },
        {
            title: "Axes",
            children: model.axisModels.map((axisModel, axisIdx) => ({
                title: axisModel.name,
                key: axisModel.name,
                render: (_value: unknown, record: LargeCoverageRecord) =>
                    getAxisValue(model, record.row, axisIdx),
                width: 140,
            })),
        },
        {
            title: "Goal",
            children: [
                {
                    title: "Name",
                    dataIndex: "goal_name",
                    key: "goal_name",
                    width: 180,
                },
                {
                    title: "Target",
                    dataIndex: "target",
                    key: "target",
                    width: 90,
                },
                {
                    title: "Hits",
                    dataIndex: "hits",
                    key: "hits",
                    width: 90,
                },
                {
                    title: "Hit %",
                    dataIndex: "hit_ratio",
                    key: "hit_ratio",
                    width: 100,
                    ...getCoverageColumnConfig(theme, "hit_ratio"),
                },
            ],
        },
    ];
}

export function PointGrid({ node }: PointGridProps) {
    const [overrideState, setOverrideState] = useState<LargeModeOverrideState>(() =>
        createInitialLargeModeOverrideState(sessionLargeModeWarningAcknowledged),
    );
    const [largeGoalFilter, setLargeGoalFilter] = useState<string>("all");
    const [largeHitFilter, setLargeHitFilter] = useState<HitClassFilter>("all");
    const [largeSort, setLargeSort] = useState<LargeSortOption>("bucket_asc");

    const model = useMemo(() => buildPointTableModel(node), [node]);

    useEffect(() => {
        setOverrideState(
            createInitialLargeModeOverrideState(sessionLargeModeWarningAcknowledged),
        );
        setLargeGoalFilter("all");
        setLargeHitFilter("all");
        setLargeSort("bucket_asc");
    }, [node.key]);

    useEffect(() => {
        if (overrideState.warningAcknowledged) {
            sessionLargeModeWarningAcknowledged = true;
        }
    }, [overrideState.warningAcknowledged]);

    const tableMode: PointTableMode = resolvePointTableMode(
        model.rowCount,
        overrideState,
    );
    const isLargeDataset = model.rowCount > POINT_FULL_FEATURE_ROW_LIMIT;
    const isLargeMode = tableMode === "large";

    const largeGoalOptions = useMemo(
        () => [
            { label: "All goals", value: "all" },
            ...model.goals.map((goal) => ({
                label: `${goal.name} - ${goal.description}`,
                value: goal.name,
            })),
        ],
        [model.goals],
    );

    const largeRowIndexes = useMemo(() => {
        if (!isLargeMode) {
            return [];
        }

        const rows: number[] = [];
        for (let row = 0; row < model.rowCount; row++) {
            const goal = model.goals[model.goalIndices[row]];
            const hits = model.hits[row];
            if (largeGoalFilter !== "all" && goal.name !== largeGoalFilter) {
                continue;
            }
            if (
                largeHitFilter !== "all"
                && classifyHitClass(goal.target, hits) !== largeHitFilter
            ) {
                continue;
            }
            rows.push(row);
        }

        sortLargeRows(rows, model, largeSort);
        return rows;
    }, [isLargeMode, model, largeGoalFilter, largeHitFilter, largeSort]);

    const largeDataSource = useMemo<LargeCoverageRecord[]>(() => {
        if (!isLargeMode) {
            return [];
        }

        return largeRowIndexes.map((row) => {
            const goal = model.goals[model.goalIndices[row]];
            const hits = model.hits[row];
            return {
                key: model.bucketKeys[row],
                row,
                target: goal.target,
                hits,
                hit_ratio: hits / goal.target,
                goal_name: goal.name,
            };
        });
    }, [isLargeMode, largeRowIndexes, model]);

    const fullDataSource = useMemo<CoverageRecord[]>(() => {
        if (isLargeMode) {
            return [];
        }

        const rows: CoverageRecord[] = [];
        for (let row = 0; row < model.rowCount; row++) {
            const goal = model.goals[model.goalIndices[row]];
            const hits = model.hits[row];
            const datum: CoverageRecord = {
                key: model.bucketKeys[row],
                target: goal.target,
                hits,
                hit_ratio: hits / goal.target,
                goal_name: goal.name,
            };

            for (let axisIdx = 0; axisIdx < model.axisModels.length; axisIdx++) {
                const axisName = model.axisModels[axisIdx].name;
                datum[axisName] = getAxisValue(model, row, axisIdx);
            }
            rows.push(datum);
        }
        return rows;
    }, [isLargeMode, model]);

    useEffect(() => {
        if (!import.meta.env.DEV) {
            return;
        }
        console.info(
            `[perf] PointGrid model rows=${model.rowCount} build=${model.buildMs.toFixed(
                2,
            )}ms mode=${tableMode}`,
        );
    }, [model.rowCount, model.buildMs, tableMode]);

    useEffect(() => {
        if (!import.meta.env.DEV || !isLargeMode) {
            return;
        }

        const startTs = performance.now();
        requestAnimationFrame(() => {
            console.info(
                `[perf] PointGrid large mode first frame ${(
                    performance.now() - startTs
                ).toFixed(2)}ms rows=${largeDataSource.length}`,
            );
        });
    }, [isLargeMode, largeDataSource.length, largeGoalFilter, largeHitFilter, largeSort]);

    const enableFullFeatures = () => {
        const applyOverride = () => {
            setOverrideState((prev) =>
                withForcedFullFeatures(acknowledgeLargeModeWarning(prev), true),
            );
            sessionLargeModeWarningAcknowledged = true;
        };

        if (overrideState.warningAcknowledged) {
            applyOverride();
            return;
        }

        Modal.confirm({
            title: "Enable full features for large table?",
            content:
                "Rendering full sorting/filtering for this dataset may be slow and could temporarily freeze the UI.",
            okText: "Enable full features",
            okType: "danger",
            cancelText: "Keep optimized mode",
            onOk: applyOverride,
        });
    };

    const disableFullFeatures = () => {
        setOverrideState((prev) => withForcedFullFeatures(prev, false));
    };

    return (
        <Theme.Consumer>
            {({ theme }) => {
                const banner = isLargeDataset ? (
                    <Alert
                        style={{ marginBottom: 10 }}
                        showIcon
                        type={isLargeMode ? "warning" : "info"}
                        message={
                            isLargeMode
                                ? `Large dataset mode active (${model.rowCount.toLocaleString()} rows).`
                                : `Full features forced for ${model.rowCount.toLocaleString()} rows.`
                        }
                        description={
                            isLargeMode
                                ? `Optimized rendering is enabled above ${POINT_FULL_FEATURE_ROW_LIMIT.toLocaleString()} rows.`
                                : "Optimized large mode is available if performance drops."
                        }
                        action={
                            isLargeMode ? (
                                <Button size="small" onClick={enableFullFeatures}>
                                    Enable full features
                                </Button>
                            ) : (
                                <Button size="small" onClick={disableFullFeatures}>
                                    Return to optimized mode
                                </Button>
                            )
                        }
                    />
                ) : null;

                const largeControls = isLargeMode ? (
                    <Space wrap style={{ marginBottom: 10 }}>
                        <Typography.Text strong>Large mode controls:</Typography.Text>
                        <Select
                            size="small"
                            value={largeGoalFilter}
                            onChange={(value) => setLargeGoalFilter(value)}
                            options={largeGoalOptions}
                            style={{ minWidth: 210 }}
                        />
                        <Select
                            size="small"
                            value={largeHitFilter}
                            onChange={(value) => setLargeHitFilter(value as HitClassFilter)}
                            options={[
                                { label: "All hit states", value: "all" },
                                { label: "Full", value: "full" },
                                { label: "Partial", value: "partial" },
                                { label: "Empty", value: "empty" },
                                { label: "Illegal", value: "illegal" },
                                { label: "Ignore", value: "ignore" },
                            ]}
                            style={{ minWidth: 160 }}
                        />
                        <Select
                            size="small"
                            value={largeSort}
                            onChange={(value) => setLargeSort(value as LargeSortOption)}
                            options={[
                                { label: "Bucket (asc)", value: "bucket_asc" },
                                { label: "Bucket (desc)", value: "bucket_desc" },
                                { label: "Hits (desc)", value: "hits_desc" },
                                { label: "Hits (asc)", value: "hits_asc" },
                                { label: "Hit % (desc)", value: "ratio_desc" },
                                { label: "Hit % (asc)", value: "ratio_asc" },
                            ]}
                            style={{ minWidth: 150 }}
                        />
                        <Typography.Text type="secondary">
                            Showing {largeDataSource.length.toLocaleString()} of {model.rowCount.toLocaleString()} rows
                        </Typography.Text>
                    </Space>
                ) : null;

                if (isLargeMode) {
                    return (
                        <>
                            {banner}
                            {largeControls}
                            <Table<LargeCoverageRecord>
                                {...(view.body.content.table.props as unknown as TableProps<LargeCoverageRecord>)}
                                key={node.key}
                                columns={getLargeColumns(theme, model)}
                                dataSource={largeDataSource}
                                virtual
                                scroll={{
                                    x: "max-content",
                                    y: LARGE_TABLE_SCROLL_Y,
                                }}
                            />
                        </>
                    );
                }

                return (
                    <>
                        {banner}
                        <Table<CoverageRecord>
                            {...(view.body.content.table.props as unknown as TableProps<CoverageRecord>)}
                            key={node.key}
                            columns={getFullColumns(
                                theme,
                                model,
                                node.data.point.axis_value_start,
                            )}
                            dataSource={fullDataSource}
                        />
                    </>
                );
            }}
        </Theme.Consumer>
    );
}

export type PointSummaryGridProps = {
    tree: CoverageTree;
    node: PointNode;
    setSelectedTreeKeys: (newSelectedKeys: TreeKey[]) => void;
};

function createInitialExpandedSet(tree: CoverageTree, node: PointNode): Set<TreeKey> {
    const initialExpanded = new Set<TreeKey>();
    const isRoot = node.key == CoverageTree.ROOT;
    const root = isRoot ? null : [node];

    for (const [subNode] of tree.walk(root)) {
        const isCovergroup = (subNode.children?.length ?? 0) > 0;
        if (isCovergroup) {
            initialExpanded.add(subNode.key);
        }
    }

    return initialExpanded;
}

export function PointSummaryGrid({ tree, node, setSelectedTreeKeys }: PointSummaryGridProps) {
    const [expandedCovergroups, setExpandedCovergroups] = useState<Set<TreeKey>>(() =>
        createInitialExpandedSet(tree, node),
    );

    useEffect(() => {
        setExpandedCovergroups(createInitialExpandedSet(tree, node));
    }, [tree, node]);

    const toggleCovergroup = (key: TreeKey, e: MouseEvent) => {
        e.stopPropagation();
        setExpandedCovergroups((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const dataSource = useMemo<SummaryRecord[]>(() => {
        const rows: SummaryRecord[] = [];
        const isRoot = node.key == CoverageTree.ROOT;
        const root = isRoot ? null : [node];

        const depthByKey = new Map<TreeKey, number>();
        const visibleByKey = new Map<TreeKey, boolean>();

        for (const [subNode, parent] of tree.walk(root)) {
            const parentDepth = parent ? (depthByKey.get(parent.key) ?? 0) : -1;
            const depth = parentDepth + 1;
            depthByKey.set(subNode.key, depth);

            const parentVisible = parent ? (visibleByKey.get(parent.key) ?? false) : true;
            const parentExpanded = !parent
                || (parent.children?.length ?? 0) === 0
                || expandedCovergroups.has(parent.key);
            const visible = parentVisible && parentExpanded;
            visibleByKey.set(subNode.key, visible);

            if (!visible) {
                continue;
            }

            const { point, point_hit } = subNode.data;
            const isCovergroup = (subNode.children?.length ?? 0) > 0;
            rows.push({
                key: subNode.key,
                name: subNode.title as string,
                desc: point.description,
                depth,
                isCovergroup,
                target: point.target,
                hits: point_hit.hits,
                target_buckets: point.target_buckets,
                hit_buckets: point_hit.hit_buckets,
                full_buckets: point_hit.full_buckets,
                hit_ratio: point_hit.hits / point.target,
                buckets_hit_ratio: point_hit.hit_buckets / point.target_buckets,
                buckets_full_ratio: point_hit.full_buckets / point.target_buckets,
            });
        }

        return rows;
    }, [tree, node, expandedCovergroups]);

    const getColumns = (theme: ThemeType): TableProps<SummaryRecord>["columns"] => [
        {
            title: "Name",
            dataIndex: "name",
            key: "name",
            render: (text: string, record: SummaryRecord) => {
                const indent = record.depth * 20;
                const isExpanded = expandedCovergroups.has(record.key);
                const hasArrow = record.isCovergroup;
                const arrowIcon = hasArrow ? (
                    isExpanded ? (
                        <CaretDownOutlined
                            style={{
                                color: theme.theme.colors.accentbg.value,
                                marginRight: 4,
                                fontSize: "12px",
                                cursor: "pointer",
                            }}
                            onClick={(e) => toggleCovergroup(record.key, e)}
                        />
                    ) : (
                        <CaretRightOutlined
                            style={{
                                color: theme.theme.colors.accentbg.value,
                                marginRight: 4,
                                fontSize: "12px",
                                cursor: "pointer",
                            }}
                            onClick={(e) => toggleCovergroup(record.key, e)}
                        />
                    )
                ) : (
                    <span style={{ width: "16px", display: "inline-block" }} />
                );
                const icon = record.isCovergroup ? (
                    <FolderOutlined
                        style={{
                            color: theme.theme.colors.accentbg.value,
                            marginRight: 8,
                            fontSize: "16px",
                        }}
                    />
                ) : (
                    <FileTextOutlined
                        style={{
                            color: theme.theme.colors.desaturatedtxt.value,
                            marginRight: 8,
                            fontSize: "14px",
                        }}
                    />
                );
                return (
                    <a
                        style={{
                            paddingLeft: `${indent}px`,
                            display: "flex",
                            alignItems: "center",
                            fontWeight: record.isCovergroup ? 700 : 400,
                            fontSize: record.isCovergroup ? "14px" : "13px",
                            color: record.isCovergroup
                                ? theme.theme.colors.primarytxt.value
                                : theme.theme.colors.desaturatedtxt.value,
                        }}
                    >
                        {arrowIcon}
                        {icon}
                        {text}
                    </a>
                );
            },
            onCell: (record) => ({
                onClick: () => setSelectedTreeKeys([record.key]),
                style: { cursor: "pointer" },
            }),
            sorter: getColumnMixedCompare("name"),
        },
        {
            title: "Description",
            dataIndex: "desc",
            key: "desc",
            onCell: (record: SummaryRecord) => ({
                style: {
                    backgroundColor: record.isCovergroup
                        ? hexToRgba(theme.theme.colors.accentbg.value, 0.2)
                        : "transparent",
                    borderLeft: record.isCovergroup
                        ? `4px solid ${theme.theme.colors.accentbg.value}`
                        : "none",
                    fontWeight: record.isCovergroup ? 500 : 400,
                    paddingLeft: record.isCovergroup ? "12px" : "8px",
                },
            }),
            sorter: getColumnMixedCompare("desc"),
        },
        {
            title: "Goal",
            children: [
                {
                    title: "Target",
                    dataIndex: "target",
                    key: "target",
                    sorter: getColumnNumCompare("target"),
                    onCell: (record: SummaryRecord) => ({
                        style: {
                            backgroundColor: record.isCovergroup
                                ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                                : "transparent",
                        },
                    }),
                },
                {
                    title: "Hits",
                    dataIndex: "hits",
                    key: "hits",
                    sorter: getColumnNumCompare("hits"),
                    onCell: (record: SummaryRecord) => ({
                        style: {
                            backgroundColor: record.isCovergroup
                                ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                                : "transparent",
                        },
                    }),
                },
                {
                    title: "Hit %",
                    dataIndex: "hit_ratio",
                    key: "hit_ratio",
                    ...getCoverageColumnConfig(theme, "hit_ratio"),
                    sorter: getColumnNumCompare("hit_ratio"),
                    onCell: (record: SummaryRecord) => {
                        const coverageConfig = getCoverageColumnConfig(theme, "hit_ratio");
                        const coverageStyle = coverageConfig.onCell
                            ? coverageConfig.onCell(record).style
                            : ({} as CSSProperties);
                        const covergroupBg = record.isCovergroup
                            ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                            : "transparent";
                        return {
                            style: {
                                ...coverageStyle,
                                backgroundColor:
                                    coverageStyle.backgroundColor
                                    && coverageStyle.backgroundColor !== "unset"
                                        ? coverageStyle.backgroundColor
                                        : covergroupBg,
                            },
                        };
                    },
                },
            ],
        },
        {
            title: "Buckets",
            children: [
                {
                    title: "Target",
                    dataIndex: "target_buckets",
                    key: "target_buckets",
                    sorter: getColumnNumCompare("target_buckets"),
                    onCell: (record: SummaryRecord) => ({
                        style: {
                            backgroundColor: record.isCovergroup
                                ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                                : "transparent",
                        },
                    }),
                },
                {
                    title: "Hit",
                    dataIndex: "hit_buckets",
                    key: "hit_buckets",
                    sorter: getColumnNumCompare("hit_buckets"),
                    onCell: (record: SummaryRecord) => ({
                        style: {
                            backgroundColor: record.isCovergroup
                                ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                                : "transparent",
                        },
                    }),
                },
                {
                    title: "Full",
                    dataIndex: "full_buckets",
                    key: "full_buckets",
                    sorter: getColumnNumCompare("full_buckets"),
                    onCell: (record: SummaryRecord) => ({
                        style: {
                            backgroundColor: record.isCovergroup
                                ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                                : "transparent",
                        },
                    }),
                },
                {
                    title: "Hit %",
                    dataIndex: "buckets_hit_ratio",
                    key: "buckets_hit_ratio",
                    ...getCoverageColumnConfig(theme, "buckets_hit_ratio"),
                    sorter: getColumnNumCompare("buckets_hit_ratio"),
                    onCell: (record: SummaryRecord) => {
                        const coverageConfig = getCoverageColumnConfig(
                            theme,
                            "buckets_hit_ratio",
                        );
                        const coverageStyle = coverageConfig.onCell
                            ? coverageConfig.onCell(record).style
                            : ({} as CSSProperties);
                        const covergroupBg = record.isCovergroup
                            ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                            : "transparent";
                        return {
                            style: {
                                ...coverageStyle,
                                backgroundColor:
                                    coverageStyle.backgroundColor
                                    && coverageStyle.backgroundColor !== "unset"
                                        ? coverageStyle.backgroundColor
                                        : covergroupBg,
                            },
                        };
                    },
                },
                {
                    title: "Full %",
                    dataIndex: "buckets_full_ratio",
                    key: "buckets_full_ratio",
                    ...getCoverageColumnConfig(theme, "buckets_full_ratio"),
                    sorter: getColumnNumCompare("buckets_full_ratio"),
                    onCell: (record: SummaryRecord) => {
                        const coverageConfig = getCoverageColumnConfig(
                            theme,
                            "buckets_full_ratio",
                        );
                        const coverageStyle = coverageConfig.onCell
                            ? coverageConfig.onCell(record).style
                            : ({} as CSSProperties);
                        const covergroupBg = record.isCovergroup
                            ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                            : "transparent";
                        return {
                            style: {
                                ...coverageStyle,
                                backgroundColor:
                                    coverageStyle.backgroundColor
                                    && coverageStyle.backgroundColor !== "unset"
                                        ? coverageStyle.backgroundColor
                                        : covergroupBg,
                            },
                        };
                    },
                },
            ],
        },
    ];

    return (
        <Theme.Consumer>
            {({ theme }) => (
                <Table<SummaryRecord>
                    {...(view.body.content.table.props as unknown as TableProps<SummaryRecord>)}
                    key={node.key}
                    columns={getColumns(theme)}
                    dataSource={dataSource}
                    onRow={(record: SummaryRecord) => ({
                        style: {
                            backgroundColor: record.isCovergroup
                                ? hexToRgba(theme.theme.colors.accentbg.value, 0.12)
                                : "transparent",
                            borderLeft: record.isCovergroup
                                ? `3px solid ${theme.theme.colors.accentbg.value}`
                                : "3px solid transparent",
                        },
                    })}
                />
            )}
        </Theme.Consumer>
    );
}
