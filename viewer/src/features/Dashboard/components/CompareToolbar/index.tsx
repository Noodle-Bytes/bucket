/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { Button, Flex, Segmented, Select, Space, Typography } from "antd";
import { CloseOutlined, DownloadOutlined } from "@ant-design/icons";
import { useState } from "react";
import Theme from "@/providers/Theme";
import { formatCategoryPercent } from "@/services/coverageCompare";
import {
    getCompareCategoryBackground,
    getCompareCategoryColor,
    type CompareBucketCategory,
} from "@/utils/colors";
import type { UseCoverageCompareResult } from "@/hooks/useCoverageCompare";
import type { CompareRecordRow } from "@/hooks/useCoverageCompare";
import CompareReportExportModal from "@/features/Dashboard/components/CompareReportExportModal";

export type CompareToolbarProps = {
    compare: UseCoverageCompareResult;
    records: CompareRecordRow[];
    onClose: () => void;
};

function SummaryStat({
    label,
    count,
    valid,
    category,
    showPercent = true,
}: {
    label: string;
    count: number;
    valid: number;
    category?: CompareBucketCategory;
    showPercent?: boolean;
}) {
    const accent = category ? getCompareCategoryColor(category) : undefined;

    return (
        <Theme.Consumer>
            {({ theme }) => {
                const colors = theme.theme.colors;
                const background = category
                    ? getCompareCategoryBackground(category, false)
                    : colors.tertiarybg.value;

                return (
                    <div
                        style={{
                            flex: "1 1 130px",
                            maxWidth: 180,
                            minWidth: 120,
                            padding: "10px 12px",
                            borderRadius: 2,
                            border: `1px solid ${colors.secondarybg.value}`,
                            borderLeft: accent ? `4px solid ${accent}` : undefined,
                            background,
                        }}
                    >
                        <Typography.Text
                            style={{
                                fontSize: 12,
                                display: "block",
                                color: colors.desaturatedtxt.value,
                            }}
                        >
                            {label}
                        </Typography.Text>
                        <Typography.Text
                            strong
                            style={{ fontSize: 18, color: colors.saturatedtxt.value }}
                        >
                            {count.toLocaleString()}
                        </Typography.Text>
                        {showPercent && (
                            <Typography.Text
                                style={{
                                    fontSize: 11,
                                    display: "block",
                                    color: colors.desaturatedtxt.value,
                                }}
                            >
                                {formatCategoryPercent(count, valid)}
                            </Typography.Text>
                        )}
                    </div>
                );
            }}
        </Theme.Consumer>
    );
}

export default function CompareToolbar({ compare, records, onClose }: CompareToolbarProps) {
    const compatibleRecords = records.filter((record) =>
        compare.compatibleRecordIds.includes(record.id),
    );
    const recordOptions = compatibleRecords.map((record) => ({
        value: record.id,
        label: record.label,
    }));

    const [exportOpen, setExportOpen] = useState(false);
    const [exporting, setExporting] = useState(false);

    const global = compare.comparison?.global;
    const valid = global?.valid ?? 0;

    return (
        <Theme.Consumer>
            {({ theme }) => {
                const colors = theme.theme.colors;

                return (
                    <>
                        <CompareReportExportModal
                            open={exportOpen}
                            comparison={compare.comparison}
                            onClose={() => setExportOpen(false)}
                            onExportingChange={setExporting}
                        />
                        <div
                            style={{
                                padding: "12px 16px",
                                borderBottom: `1px solid ${colors.secondarybg.value}`,
                                background: colors.primarybg.value,
                            }}
                        >
                            <Flex align="center" justify="space-between" gap="middle" wrap="wrap">
                                <Space wrap size="middle">
                                    <Typography.Text strong>Compare</Typography.Text>
                                    <Space size={6} align="center">
                                        <Typography.Text strong style={{ minWidth: 14 }}>
                                            A
                                        </Typography.Text>
                                        <Select
                                            size="small"
                                            style={{ minWidth: 180 }}
                                            value={compare.recordIdA ?? undefined}
                                            options={recordOptions}
                                            onChange={compare.setRecordIdA}
                                            placeholder="Select record"
                                            disabled={exporting}
                                        />
                                    </Space>
                                    <Space size={6} align="center">
                                        <Typography.Text strong style={{ minWidth: 14 }}>
                                            B
                                        </Typography.Text>
                                        <Select
                                            size="small"
                                            style={{ minWidth: 180 }}
                                            value={compare.recordIdB ?? undefined}
                                            options={recordOptions}
                                            onChange={compare.setRecordIdB}
                                            placeholder="Select record"
                                            disabled={exporting}
                                        />
                                    </Space>
                                    <Segmented
                                        size="small"
                                        value={compare.definition}
                                        onChange={(value) =>
                                            compare.setDefinition(value as typeof compare.definition)
                                        }
                                        options={[
                                            { label: "Any hit", value: "any_hit" },
                                            { label: "Met goal", value: "met_goal" },
                                        ]}
                                        disabled={exporting}
                                    />
                                    <Segmented
                                        size="small"
                                        value={compare.setMode}
                                        onChange={(value) =>
                                            compare.setSetMode(value as typeof compare.setMode)
                                        }
                                        options={[
                                            { label: "A only", value: "a_only" },
                                            { label: "Both", value: "both" },
                                            { label: "B only", value: "b_only" },
                                            { label: "Neither", value: "neither" },
                                            { label: "All", value: "all" },
                                        ]}
                                        disabled={exporting}
                                    />
                                </Space>
                                <Space>
                                    <Button
                                        size="small"
                                        icon={<DownloadOutlined />}
                                        disabled={!compare.comparison || exporting}
                                        loading={exporting}
                                        onClick={() => setExportOpen(true)}
                                    >
                                        Generate report
                                    </Button>
                                    <Button
                                        size="small"
                                        icon={<CloseOutlined />}
                                        onClick={onClose}
                                        disabled={exporting}
                                    >
                                        Exit compare
                                    </Button>
                                </Space>
                            </Flex>
                            {compare.comparisonError && (
                                <Typography.Text type="danger" style={{ display: "block", marginTop: 8 }}>
                                    {compare.comparisonError}
                                </Typography.Text>
                            )}
                            {global && (
                                <Flex gap="small" wrap="wrap" style={{ marginTop: 12 }}>
                                    <SummaryStat
                                        label="A only"
                                        count={global.a_only}
                                        valid={valid}
                                        category="a_only"
                                    />
                                    <SummaryStat
                                        label="Both"
                                        count={global.both}
                                        valid={valid}
                                        category="both"
                                    />
                                    <SummaryStat
                                        label="B only"
                                        count={global.b_only}
                                        valid={valid}
                                        category="b_only"
                                    />
                                    <SummaryStat
                                        label="Neither"
                                        count={global.neither}
                                        valid={valid}
                                        category="neither"
                                    />
                                    <SummaryStat
                                        label="Valid buckets"
                                        count={valid}
                                        valid={valid}
                                        showPercent={false}
                                    />
                                </Flex>
                            )}
                        </div>
                    </>
                );
            }}
        </Theme.Consumer>
    );
}
