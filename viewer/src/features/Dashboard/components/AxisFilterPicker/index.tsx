/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { Checkbox, Divider, Flex, Space, Tag, Typography } from "antd";
import {
    formatAxisFilterSummary,
    toggleAxisFilterValue,
} from "@/services/inferWaiverRules";

export type AxisValueOption = {
    name: string;
    values: string[];
};

type AxisFilterPickerProps = {
    axes: AxisValueOption[];
    filters: Record<string, string[]>;
    onChange: (filters: Record<string, string[]>) => void;
    /** Optional match count tag shown above the summary. */
    matchCount?: number | null;
    emptySummary?: string;
};

export default function AxisFilterPicker({
    axes,
    filters,
    onChange,
    matchCount = null,
    emptySummary = "No axis constraints (all buckets on the point)",
}: AxisFilterPickerProps) {
    const summary = formatAxisFilterSummary(filters);
    const hasFilters = Object.values(filters).some((values) => values.length > 0);

    const toggle = (axis: string, value: string) => {
        onChange(toggleAxisFilterValue(filters, axis, value));
    };

    return (
        <Flex vertical gap={12}>
            <Flex
                vertical
                gap={4}
                style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "rgba(0,0,0,0.04)",
                }}
            >
                <Space wrap size={[6, 6]}>
                    {matchCount !== null && (
                        <Tag color={hasFilters ? "blue" : "default"}>
                            {matchCount.toLocaleString()} bucket
                            {matchCount === 1 ? "" : "s"}
                        </Tag>
                    )}
                    {summary ? (
                        <Typography.Text code style={{ fontSize: 12 }}>
                            {summary}
                        </Typography.Text>
                    ) : (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {emptySummary}
                        </Typography.Text>
                    )}
                </Space>
            </Flex>

            {axes.length === 0 ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    No axis values available for this coverpoint yet. Load coverage or
                    open the matching coverpoint to edit axes with checkboxes.
                </Typography.Text>
            ) : (
                <Flex vertical gap={14} style={{ maxHeight: "40vh", overflowY: "auto" }}>
                    {axes.map((axis, index) => {
                        const selected = new Set(filters[axis.name] ?? []);
                        return (
                            <div key={axis.name}>
                                {index > 0 && <Divider style={{ margin: "4px 0 12px" }} />}
                                <Flex
                                    justify="space-between"
                                    align="center"
                                    style={{ marginBottom: 8 }}
                                >
                                    <Typography.Text strong>{axis.name}</Typography.Text>
                                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                        {selected.size > 0
                                            ? `${selected.size} of ${axis.values.length}`
                                            : "any value"}
                                    </Typography.Text>
                                </Flex>
                                <Flex wrap="wrap" gap={8}>
                                    {axis.values.map((value) => (
                                        <Checkbox
                                            key={`${axis.name}::${value}`}
                                            checked={selected.has(value)}
                                            onChange={() => toggle(axis.name, value)}
                                        >
                                            {value}
                                        </Checkbox>
                                    ))}
                                </Flex>
                            </div>
                        );
                    })}
                </Flex>
            )}
        </Flex>
    );
}
