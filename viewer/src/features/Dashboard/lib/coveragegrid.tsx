/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import CoverageTree, { PointNode } from "./coveragetree";
import {
    Alert,
    Button,
    Checkbox,
    Collapse,
    Descriptions,
    Divider,
    Dropdown,
    Input,
    Segmented,
    Select,
    Space,
    Table,
    TableProps,
    Tag,
    Tooltip,
    Typography,
} from "antd";
import type { MenuProps } from "antd";
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
    CloseOutlined,
    ExclamationCircleFilled,
    FilterFilled,
    FilterOutlined,
    InfoCircleFilled,
} from "@ant-design/icons";
import { hexToRgba, getCoverageColor } from "@/utils/colors";
import { confirmThemed } from "@/utils/themedStaticModal";
import {
    CSSProperties,
    Dispatch,
    MouseEvent,
    SetStateAction,
    useCallback,
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
    parentKey: TreeKey | null;
    name: string;
    desc: string;
    depth: number;
    isCovergroup: boolean;
    tier: number | null;
    tags: string[];
    tags_text: string;
    target: number;
    hits: number;
    target_buckets: number;
    hit_buckets: number;
    full_buckets: number;
    hit_ratio: number;
    buckets_hit_ratio: number;
    buckets_full_ratio: number;
};

/** Hover text for summary table Goal vs Buckets headers (distinct meanings). */
const SUMMARY_COLUMN_HELP = {
    goalGroup:
        "Goal-level rollup for this coverpoint: overall hit budget, recorded hits, and progress. These are not bucket counts.",
    goalTarget:
        "Total hits required for this coverpoint’s goal (aggregated target across buckets).",
    goalHits:
        "Total hits scored toward that goal (sum across buckets; each bucket’s hits are capped at its target).",
    goalHitPct: "Goal Hits ÷ Goal Target — progress toward the coverpoint’s overall hit objective.",

    bucketsGroup:
        "Bucket-level rollup: counts buckets (coverage grid cells), not raw hits. Compares with Goal columns beside it.",
    bucketsTarget:
        "Buckets that count toward coverage — legal buckets with a positive hit target.",
    bucketsHit: "Buckets with at least one hit (partial progress counts).",
    bucketsFull: "Buckets that reached their per-bucket target (fully satisfied).",
    bucketsHitPct:
        "Hit buckets ÷ Target buckets — share of buckets that have any hits.",
    bucketsFullPct:
        "Full buckets ÷ Target buckets — share of buckets that are fully satisfied.",
} as const;

/** Show tag filter search when many distinct tags would clutter the checklist. */
const SUMMARY_TAG_FILTER_SEARCH_THRESHOLD = 12;

function summaryTableHeaderTitle(label: string, tooltip: string) {
    return (
        <Tooltip title={tooltip}>
            <span>{label}</span>
        </Tooltip>
    );
}

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

/** Summary table: tag filter — OR vs AND across selected tags */
type SummaryTagMatchMode = "any" | "all";

function SummaryTagFilterDropdown({
    colors,
    tagFilterOptions,
    selectedTags,
    setSelectedTags,
    tagMatchMode,
    setTagMatchMode,
    confirm,
    clearFilters,
}: {
    colors: ThemeType["theme"]["colors"];
    tagFilterOptions: { label: string; value: string }[];
    selectedTags: string[];
    setSelectedTags: Dispatch<SetStateAction<string[]>>;
    tagMatchMode: SummaryTagMatchMode;
    setTagMatchMode: Dispatch<SetStateAction<SummaryTagMatchMode>>;
    confirm: () => void;
    clearFilters?: () => void;
}) {
    const [tagSearch, setTagSearch] = useState("");
    const showSearch = tagFilterOptions.length >= SUMMARY_TAG_FILTER_SEARCH_THRESHOLD;

    useEffect(() => {
        setTagSearch("");
    }, [tagFilterOptions]);

    const needle = tagSearch.trim().toLowerCase();
    const filteredTagOptions = useMemo(() => {
        if (!showSearch || !needle) {
            return tagFilterOptions;
        }
        return tagFilterOptions.filter(
            (o) =>
                o.label.toLowerCase().includes(needle)
                || o.value.toLowerCase().includes(needle),
        );
    }, [tagFilterOptions, needle, showSearch]);

    return (
        <div
            className="metadata-filter-toolbar"
            style={{ padding: 8, minWidth: 240, maxWidth: 340 }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}>
            <Typography.Text
                style={{
                    display: "block",
                    fontSize: 12,
                    marginBottom: 6,
                    color: colors.primarytxt.value,
                }}>
                Match selected tags
            </Typography.Text>
            <Segmented<SummaryTagMatchMode>
                size="small"
                value={tagMatchMode}
                onChange={setTagMatchMode}
                options={[
                    { label: "Any", value: "any" },
                    { label: "All", value: "all" },
                ]}
                style={{ marginBottom: 8 }}
            />
            <Typography.Text
                style={{
                    display: "block",
                    fontSize: 11,
                    lineHeight: 1.35,
                    marginBottom: 8,
                    color: colors.desaturatedtxt.value,
                }}>
                {tagMatchMode === "any"
                    ? "Any — optional tags union (OR): keep rows that include at least one selection."
                    : "All — tags intersection (AND): keep rows that include every selection."}
            </Typography.Text>
            {showSearch ? (
                <Input
                    allowClear
                    size="small"
                    placeholder="Search tags…"
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    style={{ marginBottom: 8 }}
                />
            ) : null}
            <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 8 }}>
                {tagFilterOptions.length === 0 ? (
                    <Typography.Text
                        style={{
                            display: "block",
                            padding: "4px 12px",
                            color: colors.desaturatedtxt.value,
                            fontSize: 12,
                        }}>
                        No tags in view
                    </Typography.Text>
                ) : filteredTagOptions.length === 0 ? (
                    <Typography.Text
                        style={{
                            display: "block",
                            padding: "4px 12px",
                            color: colors.desaturatedtxt.value,
                            fontSize: 12,
                        }}>
                        No tags match search
                    </Typography.Text>
                ) : (
                    filteredTagOptions.map(({ label, value }) => (
                        <div key={value} style={{ padding: "4px 12px" }}>
                            <Checkbox
                                checked={selectedTags.includes(value)}
                                onChange={(e) => {
                                    if (e.target.checked) {
                                        setSelectedTags((prev) =>
                                            [...prev, value].sort((a, b) => natCompare(a, b)),
                                        );
                                    } else {
                                        setSelectedTags((prev) =>
                                            prev.filter((t) => t !== value),
                                        );
                                    }
                                }}>
                                <span style={{ color: colors.primarytxt.value }}>{label}</span>
                            </Checkbox>
                        </div>
                    ))
                )}
            </div>
            <Divider style={{ margin: "8px 0" }} />
            <Space style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                <Button
                    type="link"
                    size="small"
                    onClick={() => {
                        clearFilters?.();
                        setSelectedTags([]);
                        setTagMatchMode("any");
                        setTagSearch("");
                    }}>
                    Reset
                </Button>
                <Button type="primary" size="small" onClick={() => confirm()}>
                    OK
                </Button>
            </Space>
        </div>
    );
}

type HitClassFilter = "all" | "full" | "partial" | "empty" | "illegal" | "ignore";
type LargeSortOption =
    | "bucket_asc"
    | "bucket_desc"
    | "hits_desc"
    | "hits_asc"
    | "ratio_desc"
    | "ratio_asc";
type AxisSortMode = "none" | "user_asc" | "user_desc" | "alpha_asc" | "alpha_desc";
type AxisSortState = {
    axisName: string | null;
    mode: AxisSortMode;
};

type GoalSortKey = "goal_name" | "target" | "hits" | "hit_ratio";

type GoalSortState = {
    columnKey: GoalSortKey | null;
    order: "ascend" | "descend" | null;
};

const AXIS_MODE_LABELS: Record<Exclude<AxisSortMode, "none">, string> = {
    user_asc: "User order (ascending)",
    user_desc: "User order (descending)",
    alpha_asc: "Alphabetical (A–Z)",
    alpha_desc: "Alphabetical (Z–A)",
};

type PointTableSortActions = {
    cycleAxisSort: (axisName: string) => void;
    applyAxisSort: (axisName: string, mode: Exclude<AxisSortMode, "none">) => void;
    clearAxisSort: () => void;
    cycleGoalSort: (key: GoalSortKey) => void;
    applyGoalSort: (key: GoalSortKey, order: "ascend" | "descend") => void;
    clearGoalSort: () => void;
};

export type PointGridProps = {
    node: PointNode;
};

let sessionLargeModeWarningAcknowledged = false;
type ComparableRecord = Record<string, string | number | boolean | null | undefined>;

function parsePointTags(tags: string | null | undefined): string[] {
    if (!tags) {
        return [];
    }
    try {
        const decoded = JSON.parse(tags);
        if (Array.isArray(decoded)) {
            return decoded
                .map((tag) => String(tag).trim())
                .filter((tag) => tag.length > 0);
        }
    } catch {
        // Fall back to legacy comma-separated format.
    }
    return tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
}

function normalizePointTier(tier: number | null | undefined): number | null {
    if (tier === null || tier === undefined || Number.isNaN(tier)) {
        return null;
    }
    return tier;
}

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

function getColumnMixedCompare<T extends object>(columnKey: string) {
    return (a: T, b: T) =>
        natCompare(
            ((a as ComparableRecord)[columnKey] as string | number | undefined) ?? "",
            ((b as ComparableRecord)[columnKey] as string | number | undefined) ?? "",
        );
}

function getColumnNumCompare<T extends object>(columnKey: string) {
    return (a: T, b: T) =>
        numCompare(
            Number(
                ((a as ComparableRecord)[columnKey] as number | string | undefined)
                ?? Number.NaN,
            ),
            Number(
                ((b as ComparableRecord)[columnKey] as number | string | undefined)
                ?? Number.NaN,
            ),
        );
}

function getNextAxisSortMode(current: AxisSortMode): AxisSortMode {
    switch (current) {
        case "none":
            return "user_asc";
        case "user_asc":
            return "user_desc";
        case "user_desc":
            return "alpha_asc";
        case "alpha_asc":
            return "alpha_desc";
        case "alpha_desc":
            return "user_asc";
        default:
            return "user_asc";
    }
}

function axisTitleTooltip(axisName: string, axisSortState: AxisSortState): string {
    if (axisSortState.axisName !== axisName) {
        return `Next: ${AXIS_MODE_LABELS.user_asc}`;
    }
    const nextMode = getNextAxisSortMode(axisSortState.mode);
    if (nextMode === "none") {
        return `Next: ${AXIS_MODE_LABELS.user_asc}`;
    }
    return `Next: ${AXIS_MODE_LABELS[nextMode]}`;
}

function goalTitleTooltip(columnKey: GoalSortKey, goalSortState: GoalSortState): string {
    if (goalSortState.columnKey !== columnKey) {
        return "Next: sort ascending";
    }
    if (goalSortState.order === "ascend") {
        return "Next: sort descending";
    }
    if (goalSortState.order === "descend") {
        return "Next: clear sort";
    }
    return "Next: sort ascending";
}

type SortableColumnHeaderProps = {
    theme: ThemeType;
    label: string;
    titleTooltip: string;
    sortActive: boolean;
    menuItems: MenuProps["items"];
    onCycleTitle: () => void;
};

function SortableColumnHeader({
    theme,
    label,
    titleTooltip,
    sortActive,
    menuItems,
    onCycleTitle,
}: SortableColumnHeaderProps) {
    const accent = theme.theme.colors.accentbg.value;
    const muted = theme.theme.colors.desaturatedtxt.value;
    const text = theme.theme.colors.primarytxt.value;

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                width: "100%",
                minWidth: 0,
            }}>
            <Tooltip title={titleTooltip}>
                <span
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onCycleTitle();
                        }
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        onCycleTitle();
                    }}
                    style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        cursor: "pointer",
                        color: text,
                    }}>
                    {label}
                </span>
            </Tooltip>
            <Dropdown menu={{ items: menuItems }} trigger={["click"]}>
                <Button
                    type="text"
                    size="small"
                    onClick={(e) => e.stopPropagation()}
                    icon={
                        <CaretDownOutlined
                            style={{
                                fontSize: 10,
                                color: sortActive ? accent : muted,
                            }}
                        />
                    }
                    aria-label="Sort options"
                    style={{ flexShrink: 0, paddingInline: 4, height: 22 }}
                />
            </Dropdown>
        </div>
    );
}

function sortFullDataByGoal(
    rows: CoverageRecord[],
    columnKey: GoalSortKey,
    order: "ascend" | "descend",
): CoverageRecord[] {
    const cmp =
        columnKey === "goal_name"
            ? getColumnMixedCompare<CoverageRecord>("goal_name")
            : getColumnNumCompare<CoverageRecord>(columnKey);
    return rows
        .map((row, idx) => ({ row, idx }))
        .sort((a, b) => {
            const r = cmp(a.row, b.row);
            if (r !== 0) {
                return order === "ascend" ? r : -r;
            }
            return a.idx - b.idx;
        })
        .map((entry) => entry.row);
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
    axisSortState: AxisSortState,
    goalSortState: GoalSortState,
    sortActions: PointTableSortActions,
): TableProps<CoverageRecord>["columns"] {
    const axisModes = ["user_asc", "user_desc", "alpha_asc", "alpha_desc"] as const;

    return [
        {
            title: (
                <Tooltip title="Unique bucket identifier">
                    <span>ID</span>
                </Tooltip>
            ),
            dataIndex: "key",
            key: "key",
            width: 1,
            onCell: () => ({ style: { whiteSpace: "nowrap" } }),
        },
        {
            title: "Axes",
            children: model.axes.map((axis) => {
                const axisValueSlice = model.axisValues.slice(
                    axis.value_start - axisValueStart,
                    axis.value_end - axisValueStart,
                );
                const isActiveAxis =
                    axisSortState.axisName === axis.name && axisSortState.mode !== "none";
                const axisMenuItems: MenuProps["items"] = [
                    ...axisModes.map((mode) => ({
                        key: mode,
                        label: AXIS_MODE_LABELS[mode],
                        onClick: () => sortActions.applyAxisSort(axis.name, mode),
                    })),
                    { type: "divider" as const },
                    {
                        key: "clear",
                        label: "Clear sort",
                        onClick: () => sortActions.clearAxisSort(),
                    },
                ];
                return {
                    title: (
                        <SortableColumnHeader
                            theme={theme}
                            label={axis.name}
                            titleTooltip={axisTitleTooltip(axis.name, axisSortState)}
                            sortActive={isActiveAxis}
                            menuItems={axisMenuItems}
                            onCycleTitle={() => sortActions.cycleAxisSort(axis.name)}
                        />
                    ),
                    dataIndex: axis.name,
                    key: axis.name,
                    filters: axisValueSlice.map((axisValue) => ({
                        text: axisValue.value,
                        value: axisValue.value,
                    })),
                    filterMode: "tree",
                    filterSearch: true,
                    onFilter: (value, record) => record[axis.name] == value,
                };
            }),
        },
        {
            title: "Goal",
            children: [
                {
                    title: (
                        <SortableColumnHeader
                            theme={theme}
                            label="Name"
                            titleTooltip={goalTitleTooltip("goal_name", goalSortState)}
                            sortActive={
                                goalSortState.columnKey === "goal_name"
                                && goalSortState.order != null
                            }
                            menuItems={[
                                {
                                    key: "asc",
                                    label: "Sort ascending",
                                    onClick: () => sortActions.applyGoalSort("goal_name", "ascend"),
                                },
                                {
                                    key: "desc",
                                    label: "Sort descending",
                                    onClick: () =>
                                        sortActions.applyGoalSort("goal_name", "descend"),
                                },
                                { type: "divider" },
                                {
                                    key: "clear",
                                    label: "Clear sort",
                                    onClick: () => sortActions.clearGoalSort(),
                                },
                            ]}
                            onCycleTitle={() => sortActions.cycleGoalSort("goal_name")}
                        />
                    ),
                    dataIndex: "goal_name",
                    key: "goal_name",
                    filters: model.goals.map((goal) => ({
                        text: `${goal.name} - ${goal.description}`,
                        value: goal.name,
                    })),
                    filterMode: "tree",
                    filterSearch: true,
                    onFilter: (value, record) => record.goal_name == value,
                },
                {
                    title: (
                        <SortableColumnHeader
                            theme={theme}
                            label="Target"
                            titleTooltip={goalTitleTooltip("target", goalSortState)}
                            sortActive={
                                goalSortState.columnKey === "target"
                                && goalSortState.order != null
                            }
                            menuItems={[
                                {
                                    key: "asc",
                                    label: "Sort ascending",
                                    onClick: () => sortActions.applyGoalSort("target", "ascend"),
                                },
                                {
                                    key: "desc",
                                    label: "Sort descending",
                                    onClick: () => sortActions.applyGoalSort("target", "descend"),
                                },
                                { type: "divider" },
                                {
                                    key: "clear",
                                    label: "Clear sort",
                                    onClick: () => sortActions.clearGoalSort(),
                                },
                            ]}
                            onCycleTitle={() => sortActions.cycleGoalSort("target")}
                        />
                    ),
                    dataIndex: "target",
                    key: "target",
                },
                {
                    title: (
                        <SortableColumnHeader
                            theme={theme}
                            label="Hits"
                            titleTooltip={goalTitleTooltip("hits", goalSortState)}
                            sortActive={
                                goalSortState.columnKey === "hits"
                                && goalSortState.order != null
                            }
                            menuItems={[
                                {
                                    key: "asc",
                                    label: "Sort ascending",
                                    onClick: () => sortActions.applyGoalSort("hits", "ascend"),
                                },
                                {
                                    key: "desc",
                                    label: "Sort descending",
                                    onClick: () => sortActions.applyGoalSort("hits", "descend"),
                                },
                                { type: "divider" },
                                {
                                    key: "clear",
                                    label: "Clear sort",
                                    onClick: () => sortActions.clearGoalSort(),
                                },
                            ]}
                            onCycleTitle={() => sortActions.cycleGoalSort("hits")}
                        />
                    ),
                    dataIndex: "hits",
                    key: "hits",
                },
                {
                    title: (
                        <SortableColumnHeader
                            theme={theme}
                            label="Hit %"
                            titleTooltip={goalTitleTooltip("hit_ratio", goalSortState)}
                            sortActive={
                                goalSortState.columnKey === "hit_ratio"
                                && goalSortState.order != null
                            }
                            menuItems={[
                                {
                                    key: "asc",
                                    label: "Sort ascending",
                                    onClick: () => sortActions.applyGoalSort("hit_ratio", "ascend"),
                                },
                                {
                                    key: "desc",
                                    label: "Sort descending",
                                    onClick: () =>
                                        sortActions.applyGoalSort("hit_ratio", "descend"),
                                },
                                { type: "divider" },
                                {
                                    key: "clear",
                                    label: "Clear sort",
                                    onClick: () => sortActions.clearGoalSort(),
                                },
                            ]}
                            onCycleTitle={() => sortActions.cycleGoalSort("hit_ratio")}
                        />
                    ),
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
            title: (
                <Tooltip title="Unique bucket identifier">
                  <span>ID</span>
                </Tooltip>
              ),
            dataIndex: "key",
            key: "key",
            width: 1,
            onCell: () => ({ style: { whiteSpace: "nowrap" } })
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
    const [isLargeBannerDismissed, setIsLargeBannerDismissed] = useState(false);
    const [largeGoalFilter, setLargeGoalFilter] = useState<string>("all");
    const [largeHitFilter, setLargeHitFilter] = useState<HitClassFilter>("all");
    const [largeSort, setLargeSort] = useState<LargeSortOption>("bucket_asc");
    const [largeScrollY, setLargeScrollY] = useState<number>(LARGE_TABLE_SCROLL_Y);
    const [axisSortState, setAxisSortState] = useState<AxisSortState>({
        axisName: null,
        mode: "none",
    });
    const [goalSortState, setGoalSortState] = useState<GoalSortState>({
        columnKey: null,
        order: null,
    });
    const pointTags = useMemo(() => parsePointTags(node.data.point.tags), [node.data.point.tags]);
    const pointTier = normalizePointTier(node.data.point.tier);
    const pointDescription = String(node.data.point.description ?? "").trim();
    const pointMotivation = String(node.data.point.motivation ?? "").trim();

    const model = useMemo(() => buildPointTableModel(node), [node]);

    useEffect(() => {
        setOverrideState(
            createInitialLargeModeOverrideState(sessionLargeModeWarningAcknowledged),
        );
        setLargeGoalFilter("all");
        setLargeHitFilter("all");
        setLargeSort("bucket_asc");
        setIsLargeBannerDismissed(false);
        setAxisSortState({ axisName: null, mode: "none" });
        setGoalSortState({ columnKey: null, order: null });
    }, [node.key]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const updateScrollY = () => {
            const viewportHeight = window.innerHeight || LARGE_TABLE_SCROLL_Y;
            const reservedHeight = 260;
            const next = Math.max(LARGE_TABLE_SCROLL_Y, viewportHeight - reservedHeight);
            setLargeScrollY(next);
        };

        updateScrollY();
        window.addEventListener("resize", updateScrollY);
        return () => window.removeEventListener("resize", updateScrollY);
    }, []);

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

    const clearAxisSort = useCallback(() => {
        setAxisSortState({ axisName: null, mode: "none" });
    }, []);

    const clearGoalSort = useCallback(() => {
        setGoalSortState({ columnKey: null, order: null });
    }, []);

    const applyAxisSort = useCallback((axisName: string, mode: Exclude<AxisSortMode, "none">) => {
        setGoalSortState({ columnKey: null, order: null });
        setAxisSortState({ axisName, mode });
    }, []);

    const cycleAxisSort = useCallback((axisName: string) => {
        setGoalSortState({ columnKey: null, order: null });
        setAxisSortState((current) => {
            if (current.axisName !== axisName || current.mode === "none") {
                return { axisName, mode: "user_asc" };
            }
            return { axisName, mode: getNextAxisSortMode(current.mode) };
        });
    }, []);

    const applyGoalSort = useCallback((key: GoalSortKey, order: "ascend" | "descend") => {
        setAxisSortState({ axisName: null, mode: "none" });
        setGoalSortState({ columnKey: key, order });
    }, []);

    const cycleGoalSort = useCallback((key: GoalSortKey) => {
        setAxisSortState({ axisName: null, mode: "none" });
        setGoalSortState((current) => {
            if (current.columnKey !== key) {
                return { columnKey: key, order: "ascend" };
            }
            if (current.order === "ascend") {
                return { columnKey: key, order: "descend" };
            }
            if (current.order === "descend") {
                return { columnKey: null, order: null };
            }
            return { columnKey: key, order: "ascend" };
        });
    }, []);

    const pointTableSortActions = useMemo<PointTableSortActions>(
        () => ({
            cycleAxisSort,
            applyAxisSort,
            clearAxisSort,
            cycleGoalSort,
            applyGoalSort,
            clearGoalSort,
        }),
        [
            cycleAxisSort,
            applyAxisSort,
            clearAxisSort,
            cycleGoalSort,
            applyGoalSort,
            clearGoalSort,
        ],
    );

    const sortedFullDataSource = useMemo<CoverageRecord[]>(() => {
        if (fullDataSource.length <= 1) {
            return fullDataSource;
        }

        if (goalSortState.columnKey && goalSortState.order) {
            return sortFullDataByGoal(
                fullDataSource,
                goalSortState.columnKey,
                goalSortState.order,
            );
        }

        const { axisName, mode } = axisSortState;
        if (!axisName || mode === "none") {
            return fullDataSource;
        }

        const axis = model.axes.find((it) => it.name === axisName);
        if (!axis) {
            return fullDataSource;
        }

        const axisValues = model.axisValues.slice(
            axis.value_start - node.data.point.axis_value_start,
            axis.value_end - node.data.point.axis_value_start,
        );
        const orderByValue = new Map(axisValues.map((axisValue, idx) => [axisValue.value, idx]));

        const sorted = fullDataSource
            .map((row, idx) => ({ row, idx }))
            .sort((a, b) => {
                const aValue = String(a.row[axisName] ?? "");
                const bValue = String(b.row[axisName] ?? "");

                if (mode === "user_asc" || mode === "user_desc") {
                    const aIdx = orderByValue.get(aValue);
                    const bIdx = orderByValue.get(bValue);
                    if (aIdx === undefined || bIdx === undefined) {
                        return a.idx - b.idx;
                    }
                    const cmp = mode === "user_desc" ? bIdx - aIdx : aIdx - bIdx;
                    if (cmp !== 0) {
                        return cmp;
                    }
                    return a.idx - b.idx;
                }

                const alphaCmp = natCompare(aValue, bValue);
                if (alphaCmp === 0) {
                    return a.idx - b.idx;
                }
                return mode === "alpha_desc" ? -alphaCmp : alphaCmp;
            })
            .map((entry) => entry.row);

        return sorted;
    }, [
        axisSortState,
        goalSortState,
        fullDataSource,
        model.axes,
        model.axisValues,
        node.data.point.axis_value_start,
    ]);

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

        confirmThemed({
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
                const pointMetadata = (
                    <div
                        style={{
                            marginBottom: 8,
                            border: `1px solid ${theme.theme.colors.secondarybg.value}`,
                            backgroundColor: hexToRgba(theme.theme.colors.tertiarybg.value, 0.82),
                            "--point-metadata-header-bg": hexToRgba(
                                theme.theme.colors.secondarybg.value,
                                0.92,
                            ),
                            "--point-metadata-header-text": theme.theme.colors.saturatedtxt.value,
                            "--point-metadata-header-subtext": theme.theme.colors.primarytxt.value,
                        } as CSSProperties}>
                        <Collapse
                            size="small"
                            ghost
                            defaultActiveKey={["metadata"]}
                            className="point-metadata-collapse"
                            items={[
                                {
                                    key: "metadata",
                                    label: (
                                        <Space size="small" wrap>
                                            <Typography.Text
                                                style={{
                                                    fontSize: 13,
                                                    fontWeight: 700,
                                                    color: theme.theme.colors.saturatedtxt.value,
                                                }}>
                                                {`Details: ${node.data.point.name}`}
                                            </Typography.Text>
                                            {pointTier !== null && (
                                                <Typography.Text
                                                    style={{
                                                        fontSize: 12,
                                                        fontWeight: 600,
                                                        color: theme.theme.colors.saturatedtxt.value,
                                                    }}>
                                                    Tier {pointTier}
                                                </Typography.Text>
                                            )}
                                            {pointTags.length > 0 && (
                                                <Typography.Text
                                                    style={{
                                                        fontSize: 12,
                                                        fontWeight: 600,
                                                        color: theme.theme.colors.saturatedtxt.value,
                                                    }}>
                                                    {pointTags.length} tag{pointTags.length === 1 ? "" : "s"}
                                                </Typography.Text>
                                            )}
                                        </Space>
                                    ),
                                    children: (
                                        <Descriptions
                                            size="small"
                                            column={1}
                                            colon={false}
                                            className="point-metadata-descriptions"
                                            styles={{
                                                label: {
                                                    color: theme.theme.colors.primarytxt.value,
                                                    fontWeight: 600,
                                                    width: 84,
                                                },
                                                content: {
                                                    color: theme.theme.colors.saturatedtxt.value,
                                                    wordBreak: "break-word",
                                                },
                                            }}
                                            items={[
                                                ...(pointDescription
                                                    ? [
                                                          {
                                                              key: "description",
                                                              label: "Description",
                                                              children: pointDescription,
                                                          },
                                                      ]
                                                    : []),
                                                ...(pointMotivation
                                                    ? [
                                                          {
                                                              key: "motivation",
                                                              label: "Motivation",
                                                              children: pointMotivation,
                                                          },
                                                      ]
                                                    : []),
                                                ...(pointTags.length > 0
                                                    ? [
                                                          {
                                                              key: "tags",
                                                              label: "Tags",
                                                              children: (
                                                                  <Space wrap size={[4, 4]}>
                                                                      {pointTags.map((tag) => (
                                                                          <Tag
                                                                              key={tag}
                                                                              style={{
                                                                                  marginInlineEnd: 0,
                                                                                  backgroundColor: hexToRgba(
                                                                                      theme.theme.colors.accentbg.value,
                                                                                      0.2,
                                                                                  ),
                                                                                  borderColor:
                                                                                      theme.theme.colors.accentbg.value,
                                                                                  color:
                                                                                      theme.theme.colors.primarytxt.value,
                                                                              }}>
                                                                              {tag}
                                                                          </Tag>
                                                                      ))}
                                                                  </Space>
                                                              ),
                                                          },
                                                      ]
                                                    : []),
                                                ...(pointTier !== null
                                                    ? [
                                                          {
                                                              key: "tier",
                                                              label: "Tier",
                                                              children: pointTier,
                                                          },
                                                      ]
                                                    : []),
                                            ]}
                                        />
                                    ),
                                },
                            ]}
                        />
                    </div>
                );

                const largeActionButton = (
                    <Button
                        size="small"
                        onClick={isLargeMode ? enableFullFeatures : disableFullFeatures}
                        style={{
                            borderColor: theme.theme.colors.lowlightbg.value,
                            backgroundColor: theme.theme.colors.tertiarybg.value,
                            color: theme.theme.colors.saturatedtxt.value,
                        }}>
                        {isLargeMode ? "Enable full features" : "Return to optimized mode"}
                    </Button>
                );

                const banner = isLargeDataset && !isLargeBannerDismissed ? (
                    <Alert
                        className="bucket-large-dataset-alert"
                        style={{
                            marginBottom: 10,
                            paddingInline: 12,
                            paddingBlock: 10,
                            color: theme.theme.colors.saturatedtxt.value,
                            border: `1px solid ${hexToRgba(theme.theme.colors.saturatedtxt.value, 0.22)}`,
                            backgroundColor: hexToRgba(
                                theme.theme.colors.secondarybg.value,
                                0.97,
                            ),
                        }}
                        showIcon
                        icon={
                            isLargeMode ? (
                                <ExclamationCircleFilled
                                    style={{
                                        color: theme.theme.colors.accentbg.value,
                                        fontSize: 18,
                                    }}
                                />
                            ) : (
                                <InfoCircleFilled
                                    style={{
                                        color: theme.theme.colors.accentbg.value,
                                        fontSize: 18,
                                    }}
                                />
                            )
                        }
                        closable
                        closeIcon={
                            <CloseOutlined
                                style={{
                                    color: theme.theme.colors.saturatedtxt.value,
                                    fontSize: 12,
                                }}
                            />
                        }
                        onClose={() => setIsLargeBannerDismissed(true)}
                        type="info"
                        message={
                            <Typography.Text
                                style={{
                                    color: theme.theme.colors.saturatedtxt.value,
                                    fontWeight: 600,
                                    fontSize: 14,
                                    lineHeight: 1.45,
                                }}>
                                {isLargeMode
                                    ? `Large dataset mode active (${model.rowCount.toLocaleString()} rows).`
                                    : `Full features forced for ${model.rowCount.toLocaleString()} rows.`}
                            </Typography.Text>
                        }
                        description={
                            <Typography.Text
                                style={{
                                    color: theme.theme.colors.saturatedtxt.value,
                                    fontSize: 13,
                                    lineHeight: 1.5,
                                    opacity: 0.92,
                                }}>
                                {isLargeMode
                                    ? `Optimized rendering is enabled above ${POINT_FULL_FEATURE_ROW_LIMIT.toLocaleString()} rows.`
                                    : "Optimized large mode is available if performance drops."}
                            </Typography.Text>
                        }
                    />
                ) : null;

                const largeControls = isLargeDataset ? (
                    <div
                        style={{
                            marginBottom: 10,
                            paddingInline: 8,
                            display: "flex",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 8,
                        }}>
                        <Typography.Text
                            strong
                            style={{ color: theme.theme.colors.saturatedtxt.value }}>
                            {isLargeMode ? "Large mode controls:" : "Large dataset controls:"}
                        </Typography.Text>
                        {isLargeMode && (
                            <>
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
                            </>
                        )}
                        {isLargeMode && (
                            <Typography.Text
                                style={{ color: theme.theme.colors.primarytxt.value }}>
                                Showing {largeDataSource.length.toLocaleString()} of {model.rowCount.toLocaleString()} rows
                            </Typography.Text>
                        )}
                        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
                            {largeActionButton}
                        </div>
                    </div>
                ) : null;

                if (isLargeMode) {
                    return (
                        <>
                            {pointMetadata}
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
                                    y: largeScrollY,
                                }}
                            />
                        </>
                    );
                }

                return (
                    <>
                        {pointMetadata}
                        {banner}
                        {largeControls}
                        <Table<CoverageRecord>
                            {...(view.body.content.table.props as unknown as TableProps<CoverageRecord>)}
                            key={node.key}
                            columns={getFullColumns(
                                theme,
                                model,
                                node.data.point.axis_value_start,
                                axisSortState,
                                goalSortState,
                                pointTableSortActions,
                            )}
                            dataSource={sortedFullDataSource}
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
    const [selectedTiers, setSelectedTiers] = useState<number[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [tagMatchMode, setTagMatchMode] = useState<SummaryTagMatchMode>("any");

    useEffect(() => {
        setExpandedCovergroups(createInitialExpandedSet(tree, node));
    }, [tree, node]);

    useEffect(() => {
        setSelectedTiers([]);
        setSelectedTags([]);
        setTagMatchMode("any");
    }, [tree, node.key]);

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

    const visibleRows = useMemo<SummaryRecord[]>(() => {
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
            const tier = normalizePointTier(point.tier);
            const tags = parsePointTags(point.tags);
            rows.push({
                key: subNode.key,
                parentKey: parent?.key ?? null,
                name: subNode.title as string,
                desc: point.description,
                depth,
                isCovergroup,
                tier,
                tags,
                tags_text: tags.join(", "),
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

    const tierFilterOptions = useMemo(
        () =>
            Array.from(
                new Set(
                    visibleRows
                        .filter((row) => !row.isCovergroup && row.tier !== null)
                        .map((row) => row.tier as number),
                ),
            )
                .sort((a, b) => a - b)
                .map((tier) => ({ label: `Tier ${tier}`, value: tier })),
        [visibleRows],
    );

    const tagFilterOptions = useMemo(
        () =>
            Array.from(
                new Set(
                    visibleRows
                        .filter((row) => !row.isCovergroup)
                        .flatMap((row) => row.tags),
                ),
            )
                .sort((a, b) => natCompare(a, b))
                .map((tag) => ({ label: tag, value: tag })),
        [visibleRows],
    );

    const dataSource = useMemo<SummaryRecord[]>(() => {
        const hasFilters = selectedTiers.length > 0 || selectedTags.length > 0;

        if (!hasFilters) {
            return visibleRows;
        }

        const tierSet = new Set(selectedTiers);
        const selectedTagSet = new Set(selectedTags);
        const parentByKey = new Map<TreeKey, TreeKey | null>();
        for (const row of visibleRows) {
            parentByKey.set(row.key, row.parentKey);
        }

        const tagMatch = (tags: string[]): boolean => {
            if (selectedTagSet.size === 0) {
                return true;
            }
            if (tagMatchMode === "any") {
                return tags.some((tag) => selectedTagSet.has(tag));
            }
            return selectedTags.every((t) => tags.includes(t));
        };

        const keepKeys = new Set<TreeKey>();
        for (const row of visibleRows) {
            if (row.isCovergroup) {
                continue;
            }

            const tierMatch =
                tierSet.size === 0
                || (row.tier !== null && tierSet.has(row.tier));
            if (!tierMatch || !tagMatch(row.tags)) {
                continue;
            }

            let currentKey: TreeKey | null = row.key;
            while (currentKey !== null) {
                if (keepKeys.has(currentKey)) {
                    break;
                }
                keepKeys.add(currentKey);
                currentKey = parentByKey.get(currentKey) ?? null;
            }
        }

        return visibleRows.filter((row) => keepKeys.has(row.key));
    }, [visibleRows, selectedTiers, selectedTags, tagMatchMode]);

    return (
        <Theme.Consumer>
            {({ theme }) => {
                const colors = theme.theme.colors;

                const summaryColumns: TableProps<SummaryRecord>["columns"] = [
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
        },
        {
            title: "Tier",
            dataIndex: "tier",
            key: "tier",
            render: (tier: number | null) => (tier === null ? "-" : String(tier)),
            filterDropdown: ({ confirm, clearFilters }) => (
                <div
                    className="metadata-filter-toolbar"
                    style={{ padding: 8, minWidth: 168 }}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}>
                    <div style={{ maxHeight: 280, overflowY: "auto" }}>
                        {tierFilterOptions.length === 0 ? (
                            <Typography.Text
                                style={{
                                    display: "block",
                                    padding: "8px 12px",
                                    color: colors.desaturatedtxt.value,
                                    fontSize: 12,
                                }}>
                                No tiers in view
                            </Typography.Text>
                        ) : (
                            tierFilterOptions.map(({ label, value }) => (
                                <div key={value} style={{ padding: "4px 12px" }}>
                                    <Checkbox
                                        checked={selectedTiers.includes(value)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedTiers(
                                                    [...selectedTiers, value].sort((a, b) => a - b),
                                                );
                                            } else {
                                                setSelectedTiers(
                                                    selectedTiers.filter((t) => t !== value),
                                                );
                                            }
                                        }}>
                                        <span style={{ color: colors.primarytxt.value }}>
                                            {label}
                                        </span>
                                    </Checkbox>
                                </div>
                            ))
                        )}
                    </div>
                    <Divider style={{ margin: "8px 0" }} />
                    <Space style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                        <Button
                            type="link"
                            size="small"
                            onClick={() => {
                                clearFilters?.();
                                setSelectedTiers([]);
                            }}>
                            Reset
                        </Button>
                        <Button type="primary" size="small" onClick={() => confirm()}>
                            OK
                        </Button>
                    </Space>
                </div>
            ),
            filterIcon: (
                <Tooltip title="Filter by tier">
                    {selectedTiers.length ? (
                        <FilterFilled
                            style={{
                                color: colors.accentbg.value,
                                fontSize: 14,
                            }}
                        />
                    ) : (
                        <FilterOutlined
                            style={{
                                color: colors.desaturatedtxt.value,
                                fontSize: 14,
                            }}
                        />
                    )}
                </Tooltip>
            ),
            onCell: (record: SummaryRecord) => ({
                style: {
                    backgroundColor: record.isCovergroup
                        ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                        : "transparent",
                },
            }),
        },
        {
            title: "Tags",
            dataIndex: "tags_text",
            key: "tags_text",
            render: (tags: string) => (tags === "" ? "-" : tags),
            filterDropdown: ({ confirm, clearFilters }) => (
                <SummaryTagFilterDropdown
                    colors={colors}
                    tagFilterOptions={tagFilterOptions}
                    selectedTags={selectedTags}
                    setSelectedTags={setSelectedTags}
                    tagMatchMode={tagMatchMode}
                    setTagMatchMode={setTagMatchMode}
                    confirm={confirm}
                    clearFilters={clearFilters}
                />
            ),
            filterIcon: (
                <Tooltip title="Filter by tags (Any / All)">
                    {selectedTags.length ? (
                        <FilterFilled
                            style={{
                                color: colors.accentbg.value,
                                fontSize: 14,
                            }}
                        />
                    ) : (
                        <FilterOutlined
                            style={{
                                color: colors.desaturatedtxt.value,
                                fontSize: 14,
                            }}
                        />
                    )}
                </Tooltip>
            ),
            onCell: (record: SummaryRecord) => ({
                style: {
                    backgroundColor: record.isCovergroup
                        ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                        : "transparent",
                },
            }),
        },
        {
            title: summaryTableHeaderTitle("Goal", SUMMARY_COLUMN_HELP.goalGroup),
            children: [
                {
                    title: summaryTableHeaderTitle("Target", SUMMARY_COLUMN_HELP.goalTarget),
                    dataIndex: "target",
                    key: "target",
                    onCell: (record: SummaryRecord) => ({
                        style: {
                            backgroundColor: record.isCovergroup
                                ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                                : "transparent",
                        },
                    }),
                },
                {
                    title: summaryTableHeaderTitle("Hits", SUMMARY_COLUMN_HELP.goalHits),
                    dataIndex: "hits",
                    key: "hits",
                    onCell: (record: SummaryRecord) => ({
                        style: {
                            backgroundColor: record.isCovergroup
                                ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                                : "transparent",
                        },
                    }),
                },
                {
                    title: summaryTableHeaderTitle("Hit %", SUMMARY_COLUMN_HELP.goalHitPct),
                    dataIndex: "hit_ratio",
                    key: "hit_ratio",
                    ...getCoverageColumnConfig(theme, "hit_ratio"),
                    onCell: (record: SummaryRecord) => {
                        const coverageConfig = getCoverageColumnConfig(theme, "hit_ratio");
                        const coverageStyle = coverageConfig.onCell
                            ? coverageConfig.onCell(record as unknown as RecordWithRatio).style
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
            title: summaryTableHeaderTitle("Buckets", SUMMARY_COLUMN_HELP.bucketsGroup),
            children: [
                {
                    title: summaryTableHeaderTitle(
                        "Target",
                        SUMMARY_COLUMN_HELP.bucketsTarget,
                    ),
                    dataIndex: "target_buckets",
                    key: "target_buckets",
                    onCell: (record: SummaryRecord) => ({
                        style: {
                            backgroundColor: record.isCovergroup
                                ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                                : "transparent",
                        },
                    }),
                },
                {
                    title: summaryTableHeaderTitle("Hit", SUMMARY_COLUMN_HELP.bucketsHit),
                    dataIndex: "hit_buckets",
                    key: "hit_buckets",
                    onCell: (record: SummaryRecord) => ({
                        style: {
                            backgroundColor: record.isCovergroup
                                ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                                : "transparent",
                        },
                    }),
                },
                {
                    title: summaryTableHeaderTitle("Full", SUMMARY_COLUMN_HELP.bucketsFull),
                    dataIndex: "full_buckets",
                    key: "full_buckets",
                    onCell: (record: SummaryRecord) => ({
                        style: {
                            backgroundColor: record.isCovergroup
                                ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                                : "transparent",
                        },
                    }),
                },
                {
                    title: summaryTableHeaderTitle("Hit %", SUMMARY_COLUMN_HELP.bucketsHitPct),
                    dataIndex: "buckets_hit_ratio",
                    key: "buckets_hit_ratio",
                    ...getCoverageColumnConfig(theme, "buckets_hit_ratio"),
                    onCell: (record: SummaryRecord) => {
                        const coverageConfig = getCoverageColumnConfig(
                            theme,
                            "buckets_hit_ratio",
                        );
                        const coverageStyle = coverageConfig.onCell
                            ? coverageConfig.onCell(record as unknown as RecordWithRatio).style
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
                    title: summaryTableHeaderTitle("Full %", SUMMARY_COLUMN_HELP.bucketsFullPct),
                    dataIndex: "buckets_full_ratio",
                    key: "buckets_full_ratio",
                    ...getCoverageColumnConfig(theme, "buckets_full_ratio"),
                    onCell: (record: SummaryRecord) => {
                        const coverageConfig = getCoverageColumnConfig(
                            theme,
                            "buckets_full_ratio",
                        );
                        const coverageStyle = coverageConfig.onCell
                            ? coverageConfig.onCell(record as unknown as RecordWithRatio).style
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

                const hasMetadataFilters =
                    selectedTiers.length > 0 || selectedTags.length > 0;

                return (
                    <>
                        <Table<SummaryRecord>
                        {...(view.body.content.table.props as unknown as TableProps<SummaryRecord>)}
                        locale={{
                            emptyText: (
                                <Typography.Text
                                    style={{
                                        color: colors.primarytxt.value,
                                    }}>
                                    {hasMetadataFilters && dataSource.length === 0
                                        ? "No rows match the current filters (0 matches). Clear tier/tag filters or adjust selections."
                                        : "No rows to display in this summary."}
                                </Typography.Text>
                            ),
                        }}
                        key={node.key}
                        columns={summaryColumns}
                        title={() => (
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "flex-end",
                                    alignItems: "center",
                                    gap: 12,
                                    flexWrap: "wrap",
                                    marginBottom: 4,
                                }}>
                                {hasMetadataFilters ? (
                                    <Button
                                        type="link"
                                        size="small"
                                        style={{ padding: 0 }}
                                        onClick={() => {
                                            setSelectedTiers([]);
                                            setSelectedTags([]);
                                            setTagMatchMode("any");
                                        }}>
                                        Clear filters
                                    </Button>
                                ) : null}
                                <Typography.Text
                                    style={{
                                        color: colors.primarytxt.value,
                                        fontSize: 13,
                                        fontWeight: 500,
                                    }}>
                                    Showing {dataSource.length.toLocaleString()} rows
                                </Typography.Text>
                            </div>
                        )}
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
                </>
                );
            }}
        </Theme.Consumer>
    );
}
