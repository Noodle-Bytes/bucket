/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import CoverageTree, { PointNode } from "./coveragetree";
import { Table, TableProps } from "antd";
import { view } from "../theme";
import { TreeKey } from "./tree";
import {Theme as ThemeType} from "@/theme";
import { natCompare, numCompare } from "./compare";
import Theme from "@/providers/Theme";
import { FolderOutlined, FileTextOutlined, CaretRightOutlined, CaretDownOutlined } from "@ant-design/icons";
import { hexToRgba, getCoverageColor } from "@/utils/colors";
import React, { useState } from "react";

type CoverageRecord = {
    key: number;
    target: number;
    hits: number;
    hit_ratio: number;
    goal_name: string;
    [axisName: string]: string | number; // Dynamic axis names
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
};

// Type for records that have ratio properties used by getCoverageColumnConfig
type RecordWithRatio = {
    [key: string]: string | number;
    hit_ratio?: number;
    buckets_hit_ratio?: number;
    buckets_full_ratio?: number;
};

export type PointGridProps = {
    node: PointNode;
};

function getCoverageColumnConfig(theme: ThemeType, columnKey: string) {
    return {
        render: (ratio: number) => {
            if (Number.isNaN(ratio) || Object.is(ratio, -0)) {
                return '-';
            } else if (ratio < 0) {
                return '!!!';
            }
            return `${(Math.min(ratio, 1) * 100).toFixed(1)}%`;
        },
        onCell: (record: RecordWithRatio) => {
            const ratio = record[columnKey] as number;
            let backgroundColor = "unset";
            let fontWeight = "unset";
            if (ratio >= 1) {
                // >=1 if target is fully hit
                backgroundColor = getCoverageColor(ratio, theme.theme.colors);
            } else if (Number.isNaN(ratio) || Object.is(ratio, -0)) {
                // NaN if target is zero (don't care)
                // -0 if target is negative (illegal) and not hit
            } else if (ratio <= 0) {
                // <0 if target is negative (illegal) and hit
                backgroundColor = getCoverageColor(ratio, theme.theme.colors);
                fontWeight = "bold"
            } else {
                // 0<x<1 if target is hit but not fully
                backgroundColor = getCoverageColor(ratio, theme.theme.colors);
            }
            return {
                style: {
                    backgroundColor,
                    fontWeight
                },
            }
        }
    }
}

function getColumnMixedCompare(columnKey: string) {
    return (a: CoverageRecord | SummaryRecord, b: CoverageRecord | SummaryRecord) => natCompare(a[columnKey], b[columnKey]);
}


function getColumnNumCompare(columnKey: string) {
    return (a: CoverageRecord | SummaryRecord, b: CoverageRecord | SummaryRecord) => numCompare(a[columnKey], b[columnKey]);
}


export function PointGrid({node}: PointGridProps) {
    const pointData = node.data;
    const readout = pointData.readout;
    let dataSource: CoverageRecord[] = [];
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
    const axes = Array.from(
        pointData.readout.iter_axes(axis_start, axis_end),
    );

    const axis_values = Array.from(
        pointData.readout.iter_axis_values(
            axis_value_start,
            axis_value_end,
        ),
    );
    const goals = Array.from(
        pointData.readout.iter_goals(goal_start, goal_end),
    );

    const getColumns = (theme: ThemeType): TableProps['columns'] => [
        {
            title: "Bucket",
            dataIndex: "key",
            key: "key",
        },
        {
            title: "Axes",
            children: axes.map(axis => {
                return {
                    title: axis.name,
                    dataIndex: axis.name,
                    key: axis.name,
                    filters: axis_values.slice(axis.value_start - axis_value_start, axis.value_end - axis_value_start).map(axis_value => ({
                        text: axis_value.value,
                        value: axis_value.value
                    })),
                    filterMode: 'tree',
                    filterSearch: true,
                    onFilter: (value, record) => record[axis.name] == value,
                    sorter: getColumnMixedCompare(axis.name)
                }
            })
        },
        {
            title: "Goal",
            children: [
                {
                    title: "Name",
                    dataIndex: "goal_name",
                    key: "goal_name",
                    filters: goals.map(goal => ({
                        text: `${goal.name} - ${goal.description}`,
                        value: goal.name
                    })),
                    filterMode: 'tree',
                    filterSearch: true,
                    onFilter: (value, record) => record["goal_name"] == value,
                    sorter: getColumnMixedCompare("goal_name")
                },
                {
                    title: "Target",
                    dataIndex: "target",
                    key: "target",
                    sorter: getColumnNumCompare('target')
                },
                {
                    title: "Hits",
                    dataIndex: "hits",
                    key: "hits",
                    sorter: getColumnNumCompare('hits')
                },
                {
                    title: "Hit %",
                    dataIndex: "hit_ratio",
                    key: "hit_ratio",
                    filters: [
                        {
                          text: 'Full',
                          value: 'full',
                        },
                        {
                          text: 'Partial',
                          value: 'partial'
                        },
                        {
                          text: 'Empty',
                          value: 'empty'
                        },
                        {
                          text: 'Illegal',
                          value: 'illegal'
                        },
                        {
                          text: 'Ignore',
                          value: 'ignore'
                        },
                    ],
                    onFilter: (value, record) => {
                        switch (value) {
                            case "full":
                                return (record["target"] > 0) && (record["hits"] >= record["target"])
                            case "partial":
                                return (record["target"] > 0) && (record["hits"] > 0) && (record["hits"] < record["target"])
                            case "empty":
                                return (record["target"] > 0) && (record["hits"] === 0)
                            case "illegal":
                                return (record["target"] < 0)
                            case "ignore":
                                return (record["target"] === 0)
                            default:
                                throw new Error(`Unexpected value ${value}`);
                        }
                    },
                    filterMode: 'tree',
                    filterSearch: true,
                    ...getCoverageColumnConfig(theme, "hit_ratio"),
                    sorter: getColumnNumCompare('hit_ratio')
                },
            ]
        }
    ]


    const bucket_hits = readout.iter_bucket_hits(bucket_start, bucket_end);
    for (const bucket_goal of readout.iter_bucket_goals(
        bucket_start,
        bucket_end,
    )) {
        const bucket_hit = bucket_hits.next().value;
        const goal = goals[bucket_goal.goal - goal_start];
        const datum: CoverageRecord = {
            key: bucket_hit.start,
            target: goal.target,
            hits: bucket_hit.hits,
            hit_ratio: bucket_hit.hits / goal.target,
            goal_name: goal.name
        };

        let offset = bucket_goal.start - bucket_start;
        for (let axis_idx = axes.length - 1; axis_idx >= 0; axis_idx--) {
            const axis = axes[axis_idx];
            const axis_offset = axis.value_start - axis_value_start;
            const axis_size = axis.value_end - axis.value_start;
            const axis_value_idx = offset % axis_size;
            datum[axis.name] = axis_values[axis_offset + axis_value_idx].value;
            offset = Math.floor(offset / axis_size);
        }

        dataSource.push(datum);
    }

    return <Theme.Consumer>
        {({ theme }) => {
            return <Table { ...view.body.content.table.props }
                key={node.key}
                columns={getColumns(theme)}
                dataSource={dataSource}
            />
        }}
    </Theme.Consumer>
}

export type PointSummaryGridProps = {
    tree: CoverageTree;
    node: PointNode;
    setSelectedTreeKeys: (newSelectedKeys: TreeKey[]) => void;
};


export function PointSummaryGrid({tree, node, setSelectedTreeKeys}: PointSummaryGridProps) {
    // Initialize all covergroups as expanded by default
    const [expandedCovergroups, setExpandedCovergroups] = useState<Set<TreeKey>>(() => {
        const initialExpanded = new Set<TreeKey>();
        const isRoot = node.key == CoverageTree.ROOT;
        const root = isRoot ? null : [node];
        for (const [subNode, _parent] of tree.walk(root)) {
            const isCovergroup = (subNode.children?.length ?? 0) > 0;
            if (isCovergroup) {
                initialExpanded.add(subNode.key);
            }
        }
        return initialExpanded;
    });

    const toggleCovergroup = (key: TreeKey, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row click
        setExpandedCovergroups(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) {
                newSet.delete(key);
            } else {
                newSet.add(key);
            }
            return newSet;
        });
    };

    const getColumns = (theme: ThemeType): TableProps['columns'] => [
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
                                fontSize: '12px',
                                cursor: 'pointer'
                            }}
                            onClick={(e) => toggleCovergroup(record.key, e)}
                        />
                    ) : (
                        <CaretRightOutlined
                            style={{
                                color: theme.theme.colors.accentbg.value,
                                marginRight: 4,
                                fontSize: '12px',
                                cursor: 'pointer'
                            }}
                            onClick={(e) => toggleCovergroup(record.key, e)}
                        />
                    )
                ) : (
                    <span style={{ width: '16px', display: 'inline-block' }} />
                );
                const icon = record.isCovergroup ? (
                    <FolderOutlined style={{
                        color: theme.theme.colors.accentbg.value,
                        marginRight: 8,
                        fontSize: '16px'
                    }} />
                ) : (
                    <FileTextOutlined style={{
                        color: theme.theme.colors.desaturatedtxt.value,
                        marginRight: 8,
                        fontSize: '14px'
                    }} />
                );
                return (
                    <a
                        style={{
                            paddingLeft: `${indent}px`,
                            display: 'flex',
                            alignItems: 'center',
                            fontWeight: record.isCovergroup ? 700 : 400,
                            fontSize: record.isCovergroup ? '14px' : '13px',
                            color: record.isCovergroup
                                ? theme.theme.colors.primarytxt.value
                                : theme.theme.colors.desaturatedtxt.value
                        }}
                    >
                        {arrowIcon}
                        {icon}
                        {text}
                    </a>
                );
            },
            onCell: record => ({
                onClick: () => setSelectedTreeKeys([record.key]),
                style: { cursor: 'pointer' }
            }),
            sorter: getColumnMixedCompare('name')
        },
        {
            title: "Description",
            dataIndex: "desc",
            key: "desc",
            onCell: (record: SummaryRecord) => ({
                style: {
                    backgroundColor: record.isCovergroup
                        ? hexToRgba(theme.theme.colors.accentbg.value, 0.2)
                        : 'transparent',
                    borderLeft: record.isCovergroup
                        ? `4px solid ${theme.theme.colors.accentbg.value}`
                        : 'none',
                    fontWeight: record.isCovergroup ? 500 : 400,
                    paddingLeft: record.isCovergroup ? '12px' : '8px',
                }
            }),
            sorter: getColumnMixedCompare('desc')
        },
        {
            title: "Goal",
            children: [
                {
                    title: "Target",
                    dataIndex: "target",
                    key: "target",
                    sorter: getColumnNumCompare('target'),
                    onCell: (record: SummaryRecord) => ({
                        style: {
                            backgroundColor: record.isCovergroup
                                ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                                : 'transparent',
                        }
                    }),
                },
                {
                    title: "Hits",
                    dataIndex: "hits",
                    key: "hits",
                    sorter: getColumnNumCompare('hits'),
                    onCell: (record: SummaryRecord) => ({
                        style: {
                            backgroundColor: record.isCovergroup
                                ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                                : 'transparent',
                        }
                    }),
                },
                {
                    title: "Hit %",
                    dataIndex: "hit_ratio",
                    key: "hit_ratio",
                    ...getCoverageColumnConfig(theme, "hit_ratio"),
                    sorter: getColumnNumCompare('hit_ratio'),
                    onCell: (record: SummaryRecord) => {
                        const coverageConfig = getCoverageColumnConfig(theme, "hit_ratio");
                        const coverageStyle = coverageConfig.onCell ? coverageConfig.onCell(record).style : {} as React.CSSProperties;
                        const covergroupBg = record.isCovergroup
                            ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                            : 'transparent';
                        return {
                            style: {
                                ...coverageStyle,
                                backgroundColor: coverageStyle.backgroundColor && coverageStyle.backgroundColor !== "unset"
                                    ? coverageStyle.backgroundColor
                                    : covergroupBg,
                            }
                        };
                    },
                },
            ]
        },
        {
            title: "Buckets",
            children: [
                {
                    title: "Target",
                    dataIndex: "target_buckets",
                    key: "target_buckets",
                    sorter:  getColumnNumCompare('target_buckets'),
                    onCell: (record: SummaryRecord) => ({
                        style: {
                            backgroundColor: record.isCovergroup
                                ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                                : 'transparent',
                        }
                    }),
                },
                {
                    title: "Hit",
                    dataIndex: "hit_buckets",
                    key: "hit_buckets",
                    sorter:  getColumnNumCompare('hit_buckets'),
                    onCell: (record: SummaryRecord) => ({
                        style: {
                            backgroundColor: record.isCovergroup
                                ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                                : 'transparent',
                        }
                    }),
                },
                {
                    title: "Full",
                    dataIndex: "full_buckets",
                    key: "full_buckets",
                    sorter:  getColumnNumCompare('full_buckets'),
                    onCell: (record: SummaryRecord) => ({
                        style: {
                            backgroundColor: record.isCovergroup
                                ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                                : 'transparent',
                        }
                    }),
                },
                {
                    title: "Hit %",
                    dataIndex: "buckets_hit_ratio",
                    key: "buckets_hit_ratio",
                    ...getCoverageColumnConfig(theme, "buckets_hit_ratio"),
                    sorter:  getColumnNumCompare('buckets_hit_ratio'),
                    onCell: (record: SummaryRecord) => {
                        const coverageConfig = getCoverageColumnConfig(theme, "buckets_hit_ratio");
                        const coverageStyle = coverageConfig.onCell ? coverageConfig.onCell(record).style : {} as React.CSSProperties;
                        const covergroupBg = record.isCovergroup
                            ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                            : 'transparent';
                        return {
                            style: {
                                ...coverageStyle,
                                backgroundColor: coverageStyle.backgroundColor && coverageStyle.backgroundColor !== "unset"
                                    ? coverageStyle.backgroundColor
                                    : covergroupBg,
                            }
                        };
                    },
                },
                {
                    title: "Full %",
                    dataIndex: "buckets_full_ratio",
                    key: "buckets_full_ratio",
                    ...getCoverageColumnConfig(theme, "buckets_full_ratio"),
                    sorter:  getColumnNumCompare('buckets_full_ratio'),
                    onCell: (record: SummaryRecord) => {
                        const coverageConfig = getCoverageColumnConfig(theme, "buckets_full_ratio");
                        const coverageStyle = coverageConfig.onCell ? coverageConfig.onCell(record).style : {} as React.CSSProperties;
                        const covergroupBg = record.isCovergroup
                            ? hexToRgba(theme.theme.colors.accentbg.value, 0.1)
                            : 'transparent';
                        return {
                            style: {
                                ...coverageStyle,
                                backgroundColor: coverageStyle.backgroundColor && coverageStyle.backgroundColor !== "unset"
                                    ? coverageStyle.backgroundColor
                                    : covergroupBg,
                            }
                        };
                    },
                },
            ]
        }
    ];
    const dataSource: SummaryRecord[] = [];

    const gather = (n: PointNode):PointNode[] => [n].concat(...n.children?.map(gather) ?? [])


    const isRoot = node.key == CoverageTree.ROOT;

    const root = isRoot ? null : [node];
    const nodePath = tree.getAncestorsByKey(node.key);
    const baseDepth = isRoot ? 1 : nodePath.length; // For root, subtract 1 (the root itself); for nodes, use full path length

    // Build a map of node keys to their parent keys for filtering
    const parentMap = new Map<TreeKey, TreeKey | null>();
    for (const [subNode, parent] of tree.walk(root)) {
        const parentKey = parent?.key;
        parentMap.set(subNode.key, parentKey !== undefined ? parentKey : null);
    }

    // Filter function to check if a node should be visible
    const isVisible = (nodeKey: TreeKey): boolean => {
        const parentKey = parentMap.get(nodeKey);
        if (parentKey === null || parentKey === undefined) {
            // Root level nodes are always visible
            return true;
        }
        const parentNode = tree.getNodeByKey(parentKey);
        if (!parentNode || !parentNode.children || parentNode.children.length === 0) {
            // Not a covergroup, always visible
            return true;
        }
        // Check if parent is expanded
        if (!expandedCovergroups.has(parentKey)) {
            return false; // Parent is collapsed, hide this node
        }
        // Recursively check ancestors
        return isVisible(parentKey);
    };

    for (const [subNode, _parent] of tree.walk(root)) {
        // Skip if any ancestor is collapsed
        if (!isVisible(subNode.key)) {
            continue;
        }

        const ancestors = tree.getAncestorsByKey(subNode.key);
        const depth = isRoot
            ? ancestors.length - 1  // For root view, subtract 1 to account for root
            : ancestors.length - baseDepth; // For node view, relative to selected node
        const {point, point_hit} = subNode.data;
        const isCovergroup = (subNode.children?.length ?? 0) > 0;

        const hit_ratio =
            point_hit.hits / point.target;
        const buckets_hit_ratio =
            point_hit.hit_buckets / point.target_buckets;
        const buckets_full_ratio =
            point_hit.full_buckets / point.target_buckets;

        dataSource.push({
            key: subNode.key,
            name: subNode.title as string,
            desc: point.description,
            depth: depth,
            isCovergroup: isCovergroup,
            target: point.target,
            hits: point_hit.hits,
            target_buckets: point.target_buckets,
            hit_buckets: point_hit.hit_buckets,
            full_buckets: point_hit.full_buckets,
            hit_ratio,
            buckets_hit_ratio,
            buckets_full_ratio,
        });
    }

    return <Theme.Consumer>
        {({ theme }) => {
            return <Table { ...view.body.content.table.props }
                key={node.key}
                columns={getColumns(theme)}
                dataSource={dataSource}
                onRow={(record: SummaryRecord) => {
                    return {
                        style: {
                            backgroundColor: record.isCovergroup
                                ? hexToRgba(theme.theme.colors.accentbg.value, 0.12)
                                : 'transparent',
                            borderLeft: record.isCovergroup
                                ? `3px solid ${theme.theme.colors.accentbg.value}`
                                : '3px solid transparent',
                        },
                    };
                }}
            />
        }}
    </Theme.Consumer>
}
