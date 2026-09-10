/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { useEffect, useMemo, useState } from "react";
import { Modal, Checkbox, Flex, Typography, Button, Space, Tag, Divider } from "antd";
import {
    bucketsMatchingAxisFilters,
    formatAxisFilterSummary,
    toggleAxisFilterValue,
} from "@/services/inferWaiverRules";
import type { SelectedBucket } from "@/services/inferWaiverRules";

export type AxisValueOption = {
    name: string;
    values: string[];
};

type SelectByAxisModalProps = {
    open: boolean;
    onClose: () => void;
    onApply: (filters: Record<string, string[]>) => void;
    axes: AxisValueOption[];
    initialFilters: Record<string, string[]>;
    allWaivable: SelectedBucket[];
};

export default function SelectByAxisModal({
    open,
    onClose,
    onApply,
    axes,
    initialFilters,
    allWaivable,
}: SelectByAxisModalProps) {
    const [draft, setDraft] = useState<Record<string, string[]>>(initialFilters);

    useEffect(() => {
        if (open) {
            setDraft(initialFilters);
        }
    }, [open, initialFilters]);

    const matchCount = useMemo(
        () => bucketsMatchingAxisFilters(allWaivable, draft).length,
        [allWaivable, draft],
    );

    const summary = useMemo(() => formatAxisFilterSummary(draft), [draft]);
    const hasFilters = Object.values(draft).some((values) => values.length > 0);

    const toggle = (axis: string, value: string) => {
        setDraft((prev) => toggleAxisFilterValue(prev, axis, value));
    };

    const apply = () => {
        onApply(draft);
        onClose();
    };

    return (
        <Modal
            title="Select by axis"
            open={open}
            onCancel={onClose}
            width={520}
            destroyOnClose
            footer={
                <Flex justify="space-between" align="center" wrap="wrap" gap={8}>
                    <Button onClick={() => setDraft({})}>Clear</Button>
                    <Space>
                        <Button onClick={onClose}>Cancel</Button>
                        <Button type="primary" onClick={apply}>
                            Apply selection
                        </Button>
                    </Space>
                </Flex>
            }
        >
            <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                Tick values on an axis to <strong>add</strong> them (OR). Tick values on other
                axes to <strong>narrow</strong> the set (AND).
            </Typography.Paragraph>

            <Flex
                vertical
                gap={4}
                style={{
                    marginBottom: 12,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "rgba(0,0,0,0.04)",
                }}
            >
                <Space wrap size={[6, 6]}>
                    <Tag color={hasFilters ? "blue" : "default"}>
                        {matchCount.toLocaleString()} bucket{matchCount === 1 ? "" : "s"}
                    </Tag>
                    {summary ? (
                        <Typography.Text code style={{ fontSize: 12 }}>
                            {summary}
                        </Typography.Text>
                    ) : (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            No axis values selected yet
                        </Typography.Text>
                    )}
                </Space>
            </Flex>

            <Flex vertical gap={14} style={{ maxHeight: "50vh", overflowY: "auto" }}>
                {axes.map((axis, index) => {
                    const selected = new Set(draft[axis.name] ?? []);
                    return (
                        <div key={axis.name}>
                            {index > 0 && <Divider style={{ margin: "4px 0 12px" }} />}
                            <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
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
        </Modal>
    );
}
