/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { PointNode } from "./coveragetree";
import { natCompare } from "./compare";
import { Table, TableProps, Tag, Space, Flex, Button, Tooltip } from "antd";
import { view } from "../theme";
import { Theme as ThemeType } from "@/theme";
import Theme from "@/providers/Theme";
import {
    getCoverageColor,
    getCompareCategoryBackground,
    getCompareCategoryColor,
    getCompareCategoryLabel,
    type CompareBucketCategory,
} from "@/utils/colors";
import {
    classifyValidBucket,
    getBucketCategoryForIndex,
    isExcludedCategory,
} from "@/services/coverageCompare";
import type {
    BucketCategory,
    CompareSetMode,
    CompareViewContext,
    ComparisonResult,
} from "@/types/coverageCompare";
import React, { useMemo, useRef, useState } from "react";

/** MDI wizard hat icon (Pictogrammers), accepts size and color via style. */
function WizardHatIcon({ style }: { style?: React.CSSProperties }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            width="1em"
            height="1em"
            style={style}
            aria-hidden="true"
        >
            <path d="M3 20h18l-2.2-3h-1.6L12 4 6.8 17H5.2L3 20zm7-3h4l-2-5-2 5zm7.5-9.5.7-1.7 1.7-.7-1.7-.7-.7-1.7-.7 1.7-1.7.7 1.7.7.7 1.7z" />
        </svg>
    );
}

const DRAG_TYPE = "application/x-pivot-axis";

type AxisDragSource = "palette" | "row" | "col";

type AxisDragData = {
    name: string;
    source: AxisDragSource;
    sourceIndex?: number;
};

function parseDragData(e: React.DragEvent): AxisDragData | null {
    try {
        const raw = e.dataTransfer.getData(DRAG_TYPE);
        if (raw) return JSON.parse(raw) as AxisDragData;
        const name = e.dataTransfer.getData("text/plain");
        if (name && name.trim()) return { name: name.trim(), source: "palette" };
    } catch {
        // ignore
    }
    return null;
}

function setDragData(e: React.DragEvent, data: AxisDragData) {
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(data));
    e.dataTransfer.setData("text/plain", data.name);
    e.dataTransfer.effectAllowed = "move";
}

const KEY_SEP = "\u001f";

type BucketRecord = {
    /** Axis name → value. Kept separate so names like "target" cannot clobber metrics. */
    axes: Record<string, string>;
    /** Global bucket index in the readout; matches the compare result's bucket keys. */
    bucketIndex: number;
    hitCount: number;
    goalTarget: number;
    /** Excluded from scoring by a waiver (never set for illegal/ignore buckets). */
    waived?: boolean;
};

/** The four compare categories in display order (illegal/ignore/waived buckets are never shown). */
export const COMPARE_CATEGORIES: readonly CompareBucketCategory[] = [
    "a_only",
    "both",
    "b_only",
    "neither",
];

function isCompareCategory(category: BucketCategory): category is CompareBucketCategory {
    return !isExcludedCategory(category);
}

/**
 * A pivot cell's buckets combined into one virtual bucket for comparison: hits and
 * targets are summed over the cell's valid buckets (illegal/ignore/waived are skipped) and
 * the cell gets a single category from that total.
 */
export type PivotCompareInfo = {
    /** Buckets in one of the four categories (excludes illegal/ignore/waived). */
    validBuckets: number;
    hitsA: number;
    hitsB: number;
    target: number;
    /** Undefined when the cell has no valid buckets. */
    category?: CompareBucketCategory;
};

/** Short cell labels; the tooltip and grid use the full "A only"/"B only" wording. */
const COMPARE_CELL_LABELS: Record<CompareBucketCategory, string> = {
    a_only: "A",
    both: "Both",
    b_only: "B",
    neither: "Neither",
};

function emptyCompareInfo(): PivotCompareInfo {
    return { validBuckets: 0, hitsA: 0, hitsB: 0, target: 0 };
}

/** Axis name → its values in covertree definition order (the order the bucket table uses). */
export type AxisValueOrder = Record<string, string[]>;

export function buildBucketRecords(node: PointNode): {
    buckets: BucketRecord[];
    axisNames: string[];
    axisValueOrder: AxisValueOrder;
} {
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
    const bucketHits = readout.iter_bucket_hits(bucket_start, bucket_end);
    const waivedIndexes = new Set<number>();
    for (const waiver of readout.iter_bucket_waivers(bucket_start, bucket_end)) {
        waivedIndexes.add(waiver.start);
    }
    const buckets: BucketRecord[] = [];

    for (const bucketGoal of readout.iter_bucket_goals(bucket_start, bucket_end)) {
        const bucketHit = bucketHits.next().value;
        const goal = goals[bucketGoal.goal - goal_start];
        const axisMap: Record<string, string> = {};
        let offset = bucketGoal.start - bucket_start;
        for (let axisIdx = axes.length - 1; axisIdx >= 0; axisIdx--) {
            const axis = axes[axisIdx];
            const axisOffset = axis.value_start - axis_value_start;
            const axisSize = axis.value_end - axis.value_start;
            const axisValueIdx = offset % axisSize;
            axisMap[axis.name] = String(axisValues[axisOffset + axisValueIdx].value);
            offset = Math.floor(offset / axisSize);
        }
        buckets.push({
            axes: axisMap,
            bucketIndex: bucketGoal.start,
            hitCount: bucketHit.hits,
            goalTarget: goal.target,
            waived: goal.target > 0 && waivedIndexes.has(bucketGoal.start),
        });
    }

    const axisValueOrder: AxisValueOrder = {};
    for (const axis of axes) {
        axisValueOrder[axis.name] = axisValues
            .slice(axis.value_start - axis_value_start, axis.value_end - axis_value_start)
            .map((v) => String(v.value));
    }

    return { buckets, axisNames: axes.map((a) => a.name), axisValueOrder };
}

function keyFor(record: BucketRecord, axisNames: string[]): string {
    if (axisNames.length === 0) return "";
    return axisNames.map((name) => record.axes[name] ?? "").join(KEY_SEP);
}

/**
 * Compare pivot keys axis by axis: values known from the definition order sort by
 * their position there, anything else falls back to a natural (numeric-aware) sort.
 */
function makeKeyComparator(
    axisNames: string[],
    axisValueOrder?: AxisValueOrder,
): (a: string, b: string) => number {
    const ranks = axisNames.map((name) => {
        const rank = new Map<string, number>();
        (axisValueOrder?.[name] ?? []).forEach((value, index) => {
            if (!rank.has(value)) rank.set(value, index);
        });
        return rank;
    });
    return (a, b) => {
        if (a === b) return 0;
        const aParts = a.split(KEY_SEP);
        const bParts = b.split(KEY_SEP);
        for (let i = 0; i < axisNames.length; i++) {
            const av = aParts[i] ?? "";
            const bv = bParts[i] ?? "";
            if (av === bv) continue;
            const ar = ranks[i].get(av);
            const br = ranks[i].get(bv);
            if (ar !== undefined && br !== undefined) return ar - br;
            return natCompare(av, bv);
        }
        return 0;
    };
}

export type PivotCellInfo = {
    /** Hits and targets summed over the cell's non-waived buckets. */
    sumHits: number;
    sumTargets: number;
    bucketCount: number;
    /** Buckets in the cell excluded from the sums by a waiver. */
    waivedCount: number;
    /** Combined A/B comparison; only present when aggregating in compare mode. */
    compare?: PivotCompareInfo;
};

/**
 * Aggregate bucket metrics into pivot cells keyed by ``row\\tcol``.
 * When ``comparison`` is given, each cell is also categorised as a whole: its
 * buckets' A and B hits are combined, so a cell hit by A in one bucket and by B
 * in another counts as "both".
 */
export function aggregatePivotCells(
    buckets: BucketRecord[],
    rowAxes: string[],
    colAxes: string[],
    comparison?: ComparisonResult,
    axisValueOrder?: AxisValueOrder,
): {
    rowKeys: string[];
    colKeys: string[];
    cellMap: Map<string, PivotCellInfo>;
} {
    const rowKeySet = new Set<string>();
    const colKeySet = new Set<string>();
    for (const b of buckets) {
        rowKeySet.add(keyFor(b, rowAxes));
        colKeySet.add(keyFor(b, colAxes));
    }
    if (rowAxes.length === 0) rowKeySet.add("");
    if (colAxes.length === 0) colKeySet.add("");
    const rowKeys = Array.from(rowKeySet).sort(makeKeyComparator(rowAxes, axisValueOrder));
    const colKeys = Array.from(colKeySet).sort(makeKeyComparator(colAxes, axisValueOrder));

    const cellMap = new Map<string, PivotCellInfo>();
    for (const b of buckets) {
        const rk = rowAxes.length ? keyFor(b, rowAxes) : "";
        const ck = colAxes.length ? keyFor(b, colAxes) : "";
        const key = `${rk}\t${ck}`;
        let cur = cellMap.get(key);
        if (!cur) {
            cur = { sumHits: 0, sumTargets: 0, bucketCount: 0, waivedCount: 0 };
            if (comparison) cur.compare = emptyCompareInfo();
            cellMap.set(key, cur);
        }
        cur.bucketCount += 1;
        if (b.waived) {
            // Waived buckets leave the denominator (and their hits the numerator).
            cur.waivedCount += 1;
        } else {
            cur.sumHits += b.hitCount;
            cur.sumTargets += b.goalTarget;
        }
        if (comparison && cur.compare) {
            const category = getBucketCategoryForIndex(comparison, b.bucketIndex);
            if (isCompareCategory(category)) {
                cur.compare.validBuckets += 1;
                cur.compare.hitsA += comparison.hitsAByIndex.get(b.bucketIndex) ?? 0;
                cur.compare.hitsB += comparison.hitsBByIndex.get(b.bucketIndex) ?? 0;
                cur.compare.target += b.goalTarget;
            }
        }
    }

    if (comparison) {
        for (const cell of cellMap.values()) {
            const info = cell.compare;
            if (info && info.validBuckets > 0) {
                info.category = classifyValidBucket(
                    info.hitsA,
                    info.hitsB,
                    info.target,
                    comparison.definition,
                );
            }
        }
    }

    return { rowKeys, colKeys, cellMap };
}

/** Whether a cell category is the one selected by the set mode ("all" selects every category). */
function isCategoryActive(category: CompareBucketCategory, setMode: CompareSetMode): boolean {
    return setMode === "all" || setMode === category;
}

function labelForKey(key: string): string {
    if (!key) return "—";
    return key.split(KEY_SEP).join(" | ");
}

type Suggestion = { rowAxes: string[]; colAxes: string[] };

/**
 * Score axes by how useful they are for showing holes/patterns: patchy or low-hit
 * axes rank higher; well-hit or very even axes rank lower.
 * Returns up to 3 suggestions that rotate on each hat click.
 */
function suggestAxesAll(
    buckets: BucketRecord[],
    axisNames: string[],
): Suggestion[] {
    if (axisNames.length === 0 || buckets.length === 0) {
        return [];
    }

    const scores: { name: string; score: number }[] = [];
    for (const axisName of axisNames) {
        const byValue = new Map<string, { hits: number; target: number }>();
        for (const b of buckets) {
            if (b.waived) continue;
            const v = b.axes[axisName] ?? "";
            const cur = byValue.get(v) ?? { hits: 0, target: 0 };
            cur.hits += b.hitCount;
            cur.target += b.goalTarget;
            byValue.set(v, cur);
        }

        const ratios: number[] = [];
        let minRatio = 1;
        for (const { hits, target } of byValue.values()) {
            const ratio = target !== 0 ? hits / target : Number.NaN;
            if (Number.isFinite(ratio) && ratio >= 0) {
                ratios.push(Math.min(ratio, 1));
                minRatio = Math.min(minRatio, ratio);
            }
        }

        if (ratios.length === 0) {
            scores.push({ name: axisName, score: 0 });
            continue;
        }

        const mean = ratios.reduce((a, r) => a + r, 0) / ratios.length;
        const variance =
            ratios.reduce((a, r) => a + (r - mean) ** 2, 0) / ratios.length;
        const lowHit = 1 - minRatio;
        const score = variance + lowHit;
        scores.push({ name: axisName, score });
    }

    scores.sort((a, b) => b.score - a.score);
    const [first, second, third] = [
        scores[0]?.name,
        scores[1]?.name,
        scores[2]?.name,
    ];

    if (!first) return [];

    const suggestions: Suggestion[] = [];
    if (axisNames.length === 1) {
        suggestions.push({ rowAxes: [first], colAxes: [] });
        suggestions.push({ rowAxes: [], colAxes: [first] });
    } else {
        suggestions.push({ rowAxes: [first], colAxes: [second!] });
        suggestions.push({ rowAxes: [second!], colAxes: [first] });
        if (axisNames.length >= 3 && third) {
            suggestions.push({
                rowAxes: [first, second!],
                colAxes: [third],
            });
        } else {
            suggestions.push({
                rowAxes: [first, second!],
                colAxes: [],
            });
        }
    }

    return suggestions;
}

type RecordWithRatio = {
    [key: string]: string | number;
};

type ColumnType = NonNullable<TableProps["columns"]>[number];
type HoveredCell = { rowKey: string; colKey: string } | null;

function buildNestedColumnHeaders(
    colKeys: string[],
    colAxes: string[],
    theme: ThemeType,
    cellMap: Map<string, PivotCellInfo>,
    hoveredCell: HoveredCell,
    setHoveredCell: (cell: HoveredCell) => void,
    compare?: CompareViewContext,
): ColumnType[] {
    const width = 90;

    if (colAxes.length <= 1) {
        return colKeys.map(
            (colKey): ColumnType => ({
                title: labelForKey(colKey),
                dataIndex: colKey,
                key: colKey,
                width,
                ...getCoverageColumnConfig(
                    theme,
                    colKey,
                    cellMap,
                    hoveredCell,
                    setHoveredCell,
                    compare,
                ),
            }),
        );
    }

    function groupByDepth(keys: string[], depth: number): ColumnType[] {
        // At the last axis, emit leaf columns directly (no extra group row)
        if (depth === colAxes.length - 1) {
            return keys.map(
                (colKey): ColumnType => ({
                    title: colKey.split(KEY_SEP).pop() ?? labelForKey(colKey),
                    dataIndex: colKey,
                    key: colKey,
                    width,
                    ...getCoverageColumnConfig(
                        theme,
                        colKey,
                        cellMap,
                        hoveredCell,
                        setHoveredCell,
                        compare,
                    ),
                }),
            );
        }

        const groups = new Map<string, string[]>();
        for (const k of keys) {
            const parts = k.split(KEY_SEP);
            const part = parts[depth] ?? "";
            if (!groups.has(part)) groups.set(part, []);
            groups.get(part)!.push(k);
        }

        return Array.from(groups.entries()).map(([value, subKeys]) => ({
            title: value,
            key: `col-${depth}-${value}`,
            children: groupByDepth(subKeys, depth + 1),
        }));
    }

    return groupByDepth(colKeys, 0);
}

function bucketNoun(count: number): string {
    return count === 1 ? "bucket" : "buckets";
}

function formatCellTooltip(cell: PivotCellInfo | undefined): string {
    if (!cell) return "No data";
    const pct =
        cell.sumTargets !== 0
            ? `${((cell.sumHits / cell.sumTargets) * 100).toFixed(1)}%`
            : "—";
    const waived = cell.waivedCount > 0 ? ` (${cell.waivedCount} waived)` : "";
    return `${cell.bucketCount} ${bucketNoun(cell.bucketCount)}${waived}, ${cell.sumHits}/${cell.sumTargets} hits (${pct})`;
}

function formatCompareCellTooltip(cell: PivotCellInfo | undefined): React.ReactNode {
    const info = cell?.compare;
    if (!cell || !info) return "No data";
    if (!info.category) {
        return `${cell.bucketCount} ${bucketNoun(cell.bucketCount)}, all ignored, illegal or waived`;
    }
    const skipped = cell.bucketCount - info.validBuckets;
    return (
        <>
            <div>
                {getCompareCategoryLabel(info.category)}: {info.validBuckets}{" "}
                {bucketNoun(info.validBuckets)} combined
                {skipped > 0 ? ` (+${skipped} ignored/illegal/waived)` : ""}
            </div>
            <div>
                Hits A {info.hitsA}, hits B {info.hitsB}, target {info.target}
            </div>
        </>
    );
}

/** Cell text in compare mode: the combined cell's category, in that category's colour. */
function renderCompareDisplay(
    cell: PivotCellInfo | undefined,
    setMode: CompareSetMode,
): React.ReactNode {
    const category = cell?.compare?.category;
    if (!category) return "-";
    const active = isCategoryActive(category, setMode);
    return (
        <span
            style={{
                color: getCompareCategoryColor(category),
                fontWeight: active ? 600 : 400,
                opacity: active ? 1 : 0.7,
            }}
        >
            {COMPARE_CELL_LABELS[category]}
        </span>
    );
}

/** Cell tint in compare mode, matching the bucket grid's row tint for the same category. */
export function getCompareCellBackground(
    info: PivotCompareInfo | undefined,
    setMode: CompareSetMode,
): string | undefined {
    if (!info?.category) return undefined;
    return getCompareCategoryBackground(info.category, isCategoryActive(info.category, setMode));
}

function getCoverageColumnConfig(
    theme: ThemeType,
    columnKey: string,
    cellMap?: Map<string, PivotCellInfo>,
    hoveredCell?: HoveredCell,
    setHoveredCell?: (cell: HoveredCell) => void,
    compare?: CompareViewContext,
): {
    render: (ratio: number, record?: RecordWithRatio & { rowKey?: string }) => React.ReactNode;
    onCell: (record: RecordWithRatio & { rowKey?: string }) => { style: React.CSSProperties };
} {
    const renderDisplay = (ratio: number) => {
        if (Number.isNaN(ratio) || Object.is(ratio, -0)) return "-";
        if (ratio < 0) return "!!!";
        return `${(Math.min(ratio, 1) * 100).toFixed(1)}%`;
    };

    return {
        render: (ratio: number, record?: RecordWithRatio & { rowKey?: string }) => {
            const cell =
                cellMap && record?.rowKey != null
                    ? cellMap.get(`${record.rowKey}\t${columnKey}`)
                    : undefined;
            const display = compare
                ? renderCompareDisplay(cell, compare.setMode)
                : renderDisplay(ratio);
            if (!cellMap || record?.rowKey == null) return display;

            const title = compare ? formatCompareCellTooltip(cell) : formatCellTooltip(cell);
            const open =
                hoveredCell != null &&
                hoveredCell.rowKey === record.rowKey &&
                hoveredCell.colKey === columnKey;
            const onMouseEnter = setHoveredCell
                ? () => setHoveredCell({ rowKey: record.rowKey!, colKey: columnKey })
                : undefined;
            const onMouseLeave = setHoveredCell ? () => setHoveredCell(null) : undefined;

            return (
                <span
                    style={{
                        position: "relative",
                        display: "block",
                        width: "100%",
                        minHeight: "32px",
                    }}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                >
                    <span style={{ position: "relative", zIndex: 0 }}>{display}</span>
                    <Tooltip
                        title={title}
                        open={open}
                        overlayStyle={{
                            borderRadius: 12,
                            padding: "8px 12px",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                            userSelect: "none",
                        }}
                    >
                        <span
                            style={{
                                position: "absolute",
                                inset: 0,
                                zIndex: 1,
                            }}
                            aria-hidden="true"
                        />
                    </Tooltip>
                </span>
            );
        },
        onCell: (record: RecordWithRatio & { rowKey?: string }) => {
            if (compare) {
                const cell =
                    cellMap && record.rowKey != null
                        ? cellMap.get(`${record.rowKey}\t${columnKey}`)
                        : undefined;
                return {
                    style: {
                        position: "relative",
                        backgroundColor: getCompareCellBackground(cell?.compare, compare.setMode),
                    },
                };
            }

            const ratio = record[columnKey] as number;
            let backgroundColor = "unset";
            let fontWeight = "unset";

            if (ratio >= 1) {
                backgroundColor = getCoverageColor(ratio, theme.theme.colors);
            } else if (Number.isNaN(ratio) || Object.is(ratio, -0)) {
                // pass
            } else if (ratio <= 0) {
                backgroundColor = getCoverageColor(ratio, theme.theme.colors);
                fontWeight = "bold";
            } else {
                backgroundColor = getCoverageColor(ratio, theme.theme.colors);
            }

            return {
                style: {
                    position: "relative",
                    backgroundColor,
                    fontWeight,
                },
            };
        },
    };
}

export type PointPivotViewProps = {
    node: PointNode;
    /** When set, cells show compare categories instead of hit ratios. */
    compare?: CompareViewContext;
};

function CompareLegend({
    compare,
    theme,
}: {
    compare: CompareViewContext;
    theme: ThemeType;
}) {
    const colors = theme.theme.colors;
    const hint = "Each cell combines its buckets' A and B hits before categorising";
    return (
        <Space size={12} wrap align="center">
            {COMPARE_CATEGORIES.map((category) => {
                const active = isCategoryActive(category, compare.setMode);
                return (
                    <Space key={category} size={4} align="center">
                        <span
                            aria-hidden="true"
                            style={{
                                display: "inline-block",
                                width: 12,
                                height: 12,
                                borderRadius: 2,
                                background: getCompareCategoryBackground(category, active),
                                border: `1px solid ${getCompareCategoryColor(category)}`,
                            }}
                        />
                        <span
                            style={{
                                fontSize: 12,
                                color: active
                                    ? colors.primarytxt.value
                                    : colors.desaturatedtxt.value,
                            }}
                        >
                            {COMPARE_CELL_LABELS[category]}
                        </span>
                    </Space>
                );
            })}
            <span style={{ fontSize: 12, color: colors.desaturatedtxt.value }}>{hint}</span>
        </Space>
    );
}

export function PointPivotView({ node, compare }: PointPivotViewProps) {
    const [rowAxes, setRowAxes] = useState<string[]>([]);
    const [colAxes, setColAxes] = useState<string[]>([]);
    const [suggestionIndex, setSuggestionIndex] = useState(0);
    const [hoveredCell, setHoveredCell] = useState<HoveredCell>(null);
    /** Fallback for Electron where dataTransfer.getData() can be empty on drop */
    const lastDragDataRef = useRef<AxisDragData | null>(null);

    const { buckets, axisNames, axisValueOrder } = useMemo(
        () => buildBucketRecords(node),
        [node],
    );

    const comparison = compare?.comparison;
    const { rowKeys, colKeys, cellMap, rowKeyToLabel, rowSpans } = useMemo(() => {
        const { rowKeys, colKeys, cellMap } = aggregatePivotCells(
            buckets,
            rowAxes,
            colAxes,
            comparison,
            axisValueOrder,
        );

        const rowKeyToLabel = new Map<string, string>();
        for (const rk of rowKeys) rowKeyToLabel.set(rk, labelForKey(rk));

        // Row spans for hierarchical row headers when multiple row axes
        const rowSpans: number[][] = [];
        if (rowAxes.length > 1) {
            for (let r = 0; r < rowKeys.length; r++) {
                const parts = rowKeys[r].split(KEY_SEP);
                rowSpans[r] = [];
                for (let a = 0; a < parts.length; a++) {
                    const prevParts = r > 0 ? rowKeys[r - 1].split(KEY_SEP) : [];
                    const sameAsPrev =
                        r > 0 && parts.slice(0, a + 1).every((p, i) => p === prevParts[i]);
                    if (sameAsPrev) {
                        rowSpans[r][a] = 0;
                    } else {
                        let count = 1;
                        for (let s = r + 1; s < rowKeys.length; s++) {
                            const sParts = rowKeys[s].split(KEY_SEP);
                            if (sParts.slice(0, a + 1).some((_, i) => sParts[i] !== parts[i])) {
                                break;
                            }
                            count++;
                        }
                        rowSpans[r][a] = count;
                    }
                }
            }
        }

        return { rowKeys, colKeys, cellMap, rowKeyToLabel, rowSpans };
    }, [buckets, rowAxes, colAxes, comparison, axisValueOrder]);

    const addToRow = (axisName: string, atIndex?: number) => {
        if (!axisNames.includes(axisName)) return;
        if (rowAxes.includes(axisName) && atIndex == null) return;
        if (atIndex != null) {
            const without = rowAxes.filter((x) => x !== axisName);
            const insert = Math.min(atIndex, without.length);
            setRowAxes([...without.slice(0, insert), axisName, ...without.slice(insert)]);
        } else if (!rowAxes.includes(axisName)) {
            setRowAxes([...rowAxes, axisName]);
        }
    };

    const addToCol = (axisName: string, atIndex?: number) => {
        if (!axisNames.includes(axisName)) return;
        if (colAxes.includes(axisName) && atIndex == null) return;
        if (atIndex != null) {
            const without = colAxes.filter((x) => x !== axisName);
            const insert = Math.min(atIndex, without.length);
            setColAxes([...without.slice(0, insert), axisName, ...without.slice(insert)]);
        } else if (!colAxes.includes(axisName)) {
            setColAxes([...colAxes, axisName]);
        }
    };

    const removeFromRow = (index: number) => {
        setRowAxes(rowAxes.filter((_, i) => i !== index));
    };

    const removeFromCol = (index: number) => {
        setColAxes(colAxes.filter((_, i) => i !== index));
    };
    const handleDragStart = (data: AxisDragData) => (e: React.DragEvent) => {
        setDragData(e, data);
        lastDragDataRef.current = data;
    };

    const handleDropRow = (e: React.DragEvent, insertBeforeIndex?: number) => {
        e.preventDefault();
        e.stopPropagation();
        const data = parseDragData(e) ?? lastDragDataRef.current;
        lastDragDataRef.current = null;
        if (!data || !axisNames.includes(data.name)) return;

        if (data.source === "col" && data.sourceIndex != null) {
            removeFromCol(data.sourceIndex);
            addToRow(data.name, insertBeforeIndex ?? rowAxes.length);
        } else if (data.source === "row" && data.sourceIndex != null && insertBeforeIndex != null) {
            const src = data.sourceIndex;
            const without = rowAxes.filter((_, i) => i !== src);
            const insertAt = src < insertBeforeIndex ? insertBeforeIndex - 1 : insertBeforeIndex;
            setRowAxes([...without.slice(0, insertAt), data.name, ...without.slice(insertAt)]);
        } else if (data.source === "palette" || data.source === "row") {
            addToRow(data.name, insertBeforeIndex);
        }
    };

    const handleDropCol = (e: React.DragEvent, insertBeforeIndex?: number) => {
        e.preventDefault();
        e.stopPropagation();
        const data = parseDragData(e) ?? lastDragDataRef.current;
        lastDragDataRef.current = null;
        if (!data || !axisNames.includes(data.name)) return;

        if (data.source === "row" && data.sourceIndex != null) {
            removeFromRow(data.sourceIndex);
            addToCol(data.name, insertBeforeIndex ?? colAxes.length);
        } else if (data.source === "col" && data.sourceIndex != null && insertBeforeIndex != null) {
            const src = data.sourceIndex;
            const without = colAxes.filter((_, i) => i !== src);
            const insertAt = src < insertBeforeIndex ? insertBeforeIndex - 1 : insertBeforeIndex;
            setColAxes([...without.slice(0, insertAt), data.name, ...without.slice(insertAt)]);
        } else if (data.source === "palette" || data.source === "col") {
            addToCol(data.name, insertBeforeIndex);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
    };
    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
    };

    const suggestions = useMemo(
        () => suggestAxesAll(buckets, axisNames),
        [buckets, axisNames],
    );
    const applySuggestion = () => {
        if (suggestions.length === 0) return;
        const idx = suggestionIndex % suggestions.length;
        const { rowAxes: suggestedRow, colAxes: suggestedCol } = suggestions[idx];
        setRowAxes(suggestedRow);
        setColAxes(suggestedCol);
        setSuggestionIndex((prev) => (prev + 1) % Math.max(suggestions.length, 1));
    };

    const hasRowAxes = rowAxes.length > 0;
    const hasColAxes = colAxes.length > 0;
    const showTable = hasRowAxes || hasColAxes;

    return (
        <Theme.Consumer>
            {({ theme }) => {
                const tagStyle = {
                    cursor: "grab" as const,
                    color: theme.theme.colors.primarytxt.value,
                    backgroundColor: theme.theme.colors.secondarybg.value,
                    borderColor: theme.theme.colors.desaturatedtxt?.value ?? "#888",
                };
                return (
                    <Flex vertical gap="middle" style={{ padding: 16 }}>
                        <Flex gap="large" wrap="wrap" align="center">
                            <Space align="center">
                                <span
                                    style={{
                                        color: theme.theme.colors.primarytxt.value,
                                        fontWeight: 500,
                                    }}
                                >
                                    Axes:
                                </span>
                                {axisNames.map((name) => (
                                    <Tag
                                        key={name}
                                        draggable
                                        onDragStart={handleDragStart({ name, source: "palette" })}
                                        style={tagStyle}
                                    >
                                        {name}
                                    </Tag>
                                ))}
                            </Space>
                            {axisNames.length > 0 && (
                                <Button
                                    type="text"
                                    size="small"
                                    icon={
                                        <WizardHatIcon
                                            style={{ color: "#A855F7", fontSize: 18 }}
                                        />
                                    }
                                    onClick={applySuggestion}
                                    title="Suggest axes to show holes and patterns (click again to try another suggestion)"
                                />
                            )}
                            {compare && <CompareLegend compare={compare} theme={theme} />}
                        </Flex>
                        <Flex gap="large" wrap="wrap">
                            <div
                                onDrop={(e) => handleDropRow(e)}
                                onDragOver={handleDragOver}
                                onDragEnter={handleDragEnter}
                                style={{
                                    border: `1px dashed ${theme.theme.colors.desaturatedtxt?.value ?? "#888"}`,
                                    borderRadius: 6,
                                    padding: 8,
                                    minWidth: 120,
                                    minHeight: 40,
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: 12,
                                        color: theme.theme.colors.primarytxt.value,
                                        marginBottom: 4,
                                    }}
                                >
                                    Row axes
                                </div>
                                <Space size={[4, 4]} wrap>
                                    {rowAxes.map((name, i) => (
                                        <Tag
                                        key={`row-${name}-${i}`}
                                        closable
                                        draggable
                                        onDragStart={handleDragStart({ name, source: "row", sourceIndex: i })}
                                        onDrop={(e) => handleDropRow(e, i)}
                                        onDragOver={handleDragOver}
                                        onDragEnter={handleDragEnter}
                                        style={tagStyle}
                                        onClose={() => removeFromRow(i)}
                                    >
                                            {name}
                                        </Tag>
                                    ))}
                                </Space>
                            </div>
                            <div
                                onDrop={(e) => handleDropCol(e)}
                                onDragOver={handleDragOver}
                                onDragEnter={handleDragEnter}
                                style={{
                                    border: `1px dashed ${theme.theme.colors.desaturatedtxt?.value ?? "#888"}`,
                                    borderRadius: 6,
                                    padding: 8,
                                    minWidth: 120,
                                    minHeight: 40,
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: 12,
                                        color: theme.theme.colors.primarytxt.value,
                                        marginBottom: 4,
                                    }}
                                >
                                    Column axes
                                </div>
                                <Space size={[4, 4]} wrap>
                                    {colAxes.map((name, i) => (
                                        <Tag
                                        key={`col-${name}-${i}`}
                                        closable
                                        draggable
                                        onDragStart={handleDragStart({ name, source: "col", sourceIndex: i })}
                                        onDrop={(e) => handleDropCol(e, i)}
                                        onDragOver={handleDragOver}
                                        onDragEnter={handleDragEnter}
                                        style={tagStyle}
                                        onClose={() => removeFromCol(i)}
                                    >
                                            {name}
                                        </Tag>
                                    ))}
                                </Space>
                            </div>
                        </Flex>
                        {!showTable ? (
                            <div
                                style={{
                                    color: theme.theme.colors.primarytxt.value,
                                    padding: 24,
                                    textAlign: "center",
                                }}
                            >
                                Drag axes to Row axes and Column axes to build the pivot table.
                            </div>
                        ) : (
                            // Pivot table: no bucket-state filters (Full/Partial/Empty/Illegal/Ignore)
                            <Table
                                {...view.body.content.table.props}
                                key={`pivot-${node.key}`}
                                size="small"
                                bordered
                                pagination={false}
                                sticky
                                dataSource={rowKeys.map((rowKey, r) => {
                                    const parts = rowKey ? rowKey.split(KEY_SEP) : [];
                                    const rowLabel = rowKeyToLabel.get(rowKey) ?? labelForKey(rowKey);
                                    const record: RecordWithRatio & {
                                        rowKey: string;
                                        rowLabel: string;
                                        __rowIndex: number;
                                        [k: `rowAxis_${number}`]: string;
                                    } = {
                                        rowKey,
                                        rowLabel,
                                        __rowIndex: r,
                                    };
                                    parts.forEach((part, i) => {
                                        record[`rowAxis_${i}`] = part;
                                    });
                                    for (const colKey of colKeys) {
                                        const cellKey = `${rowKey}\t${colKey}`;
                                        const cell = cellMap.get(cellKey);
                                        const ratio =
                                            cell && cell.sumTargets !== 0
                                                ? cell.sumHits / cell.sumTargets
                                                : Number.NaN;
                                        record[colKey] = ratio;
                                    }
                                    return record;
                                })}
                                columns={[
                                    ...(hasRowAxes && rowAxes.length > 1
                                        ? rowAxes.map((axisName, a) => ({
                                              title: axisName,
                                              dataIndex: `rowAxis_${a}`,
                                              key: `rowAxis_${a}`,
                                              fixed: a === 0 ? ("left" as const) : undefined,
                                              width: 100,
                                              onCell: (record: RecordWithRatio & { __rowIndex?: number }) => ({
                                                  rowSpan: record.__rowIndex != null ? (rowSpans[record.__rowIndex]?.[a] ?? 1) : 1,
                                              }),
                                          }))
                                        : [
                                              {
                                                  title: hasRowAxes ? rowAxes[0] : "Row",
                                                  dataIndex: "rowLabel",
                                                  key: "rowLabel",
                                                  fixed: "left" as const,
                                                  width: 140,
                                              },
                                          ]),
                                    ...buildNestedColumnHeaders(
                                        colKeys,
                                        colAxes,
                                        theme,
                                        cellMap,
                                        hoveredCell,
                                        setHoveredCell,
                                        compare,
                                    ),
                                ]}
                                rowKey="rowKey"
                            />
                        )}
                    </Flex>
                );
            }}
        </Theme.Consumer>
    );
}
