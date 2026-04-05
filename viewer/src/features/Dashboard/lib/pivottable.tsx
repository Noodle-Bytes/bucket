/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { PointNode } from "./coveragetree";
import { Table, TableProps, Tag, Space, Flex, Button, Tooltip } from "antd";
import { view } from "../theme";
import { Theme as ThemeType } from "@/theme";
import Theme from "@/providers/Theme";
import { getCoverageColor } from "@/utils/colors";
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
    [axisName: string]: string | number;
    hits: number;
    target: number;
};

function buildBucketRecords(node: PointNode): { buckets: BucketRecord[]; axisNames: string[] } {
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
    const buckets: BucketRecord[] = [];

    for (const bucketGoal of readout.iter_bucket_goals(bucket_start, bucket_end)) {
        const bucketHit = bucketHits.next().value;
        const goal = goals[bucketGoal.goal - goal_start];
        const datum: BucketRecord = {
            hits: bucketHit.hits,
            target: goal.target,
        };
        let offset = bucketGoal.start - bucket_start;
        for (let axisIdx = axes.length - 1; axisIdx >= 0; axisIdx--) {
            const axis = axes[axisIdx];
            const axisOffset = axis.value_start - axis_value_start;
            const axisSize = axis.value_end - axis.value_start;
            const axisValueIdx = offset % axisSize;
            datum[axis.name] = axisValues[axisOffset + axisValueIdx].value;
            offset = Math.floor(offset / axisSize);
        }
        buckets.push(datum);
    }

    return { buckets, axisNames: axes.map((a) => a.name) };
}

function keyFor(record: BucketRecord, axisNames: string[]): string {
    if (axisNames.length === 0) return "";
    return axisNames
        .map((name) => String(record[name] ?? ""))
        .join(KEY_SEP);
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
            const v = String(b[axisName] ?? "");
            const cur = byValue.get(v) ?? { hits: 0, target: 0 };
            cur.hits += b.hits;
            cur.target += b.target;
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
type CellInfo = { sumHits: number; sumTargets: number; bucketCount: number };

function buildNestedColumnHeaders(
    colKeys: string[],
    colAxes: string[],
    theme: ThemeType,
    cellMap: Map<string, CellInfo>,
    hoveredCell: HoveredCell,
    setHoveredCell: (cell: HoveredCell) => void,
): ColumnType[] {
    if (colAxes.length <= 1) {
        return colKeys.map(
            (colKey): ColumnType => ({
                title: labelForKey(colKey),
                dataIndex: colKey,
                key: colKey,
                width: 90,
                ...getCoverageColumnConfig(
                    theme,
                    colKey,
                    cellMap,
                    hoveredCell,
                    setHoveredCell,
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
                    width: 90,
                    ...getCoverageColumnConfig(
                        theme,
                        colKey,
                        cellMap,
                        hoveredCell,
                        setHoveredCell,
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

function formatCellTooltip(cell: CellInfo | undefined): string {
    if (!cell) return "No data";
    const pct =
        cell.sumTargets !== 0
            ? `${((cell.sumHits / cell.sumTargets) * 100).toFixed(1)}%`
            : "—";
    const bucketLabel = cell.bucketCount === 1 ? "bucket" : "buckets";
    return `${cell.bucketCount} ${bucketLabel}, ${cell.sumHits}/${cell.sumTargets} hits (${pct})`;
}

function getCoverageColumnConfig(
    theme: ThemeType,
    columnKey: string,
    cellMap?: Map<string, CellInfo>,
    hoveredCell?: HoveredCell,
    setHoveredCell?: (cell: HoveredCell) => void,
): {
    render: (ratio: number, record?: RecordWithRatio & { rowKey?: string }) => React.ReactNode;
    onCell: (record: RecordWithRatio) => { style: React.CSSProperties };
} {
    const renderDisplay = (ratio: number) => {
        if (Number.isNaN(ratio) || Object.is(ratio, -0)) return "-";
        if (ratio < 0) return "!!!";
        return `${(Math.min(ratio, 1) * 100).toFixed(1)}%`;
    };

    return {
        render: (ratio: number, record?: RecordWithRatio & { rowKey?: string }) => {
            const display = renderDisplay(ratio);
            if (!cellMap || record?.rowKey == null) return display;

            const cell = cellMap.get(`${record.rowKey}\t${columnKey}`);
            const title = formatCellTooltip(cell);
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
        onCell: (record: RecordWithRatio) => {
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
};

export function PointPivotView({ node }: PointPivotViewProps) {
    const [rowAxes, setRowAxes] = useState<string[]>([]);
    const [colAxes, setColAxes] = useState<string[]>([]);
    const [suggestionIndex, setSuggestionIndex] = useState(0);
    const [hoveredCell, setHoveredCell] = useState<HoveredCell>(null);
    /** Fallback for Electron where dataTransfer.getData() can be empty on drop */
    const lastDragDataRef = useRef<AxisDragData | null>(null);

    const { buckets, axisNames } = useMemo(
        () => buildBucketRecords(node),
        [node],
    );

    const { rowKeys, colKeys, cellMap, rowKeyToLabel, rowSpans } = useMemo(() => {
        const rowKeySet = new Set<string>();
        const colKeySet = new Set<string>();
        for (const b of buckets) {
            rowKeySet.add(keyFor(b, rowAxes));
            colKeySet.add(keyFor(b, colAxes));
        }
        if (rowAxes.length === 0) rowKeySet.add("");
        if (colAxes.length === 0) colKeySet.add("");
        const rowKeys = Array.from(rowKeySet).sort();
        const colKeys = Array.from(colKeySet).sort();

        const cellMap = new Map<
            string,
            { sumHits: number; sumTargets: number; bucketCount: number }
        >();
        for (const b of buckets) {
            const rk = rowAxes.length ? keyFor(b, rowAxes) : "";
            const ck = colAxes.length ? keyFor(b, colAxes) : "";
            const key = `${rk}\t${ck}`;
            const cur = cellMap.get(key) ?? {
                sumHits: 0,
                sumTargets: 0,
                bucketCount: 0,
            };
            cur.sumHits += b.hits;
            cur.sumTargets += b.target;
            cur.bucketCount += 1;
            cellMap.set(key, cur);
        }

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
    }, [buckets, rowAxes, colAxes]);

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
                                                  rowSpan: (record.__rowIndex != null && rowSpans[record.__rowIndex]?.[a]) ?? 1,
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
