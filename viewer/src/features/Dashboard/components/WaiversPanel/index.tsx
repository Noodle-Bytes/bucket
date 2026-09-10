/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { useMemo, useState } from "react";
import {
    Alert,
    Button,
    Drawer,
    Flex,
    Input,
    Radio,
    Space,
    Switch,
    Tag,
    Typography,
    Modal,
    Tooltip,
} from "antd";
import {
    DeleteOutlined,
    DownloadOutlined,
    CopyOutlined,
    EditOutlined,
} from "@ant-design/icons";
import { useWaiverSession } from "@/hooks/useWaiverSession";
import {
    isWaiverProblemStatus,
    type WaiverRuleStatus,
} from "@/services/matchWaivers";
import { notifySuccess, notifyInfo } from "@/utils/themedStaticNotification";
import { saveExportBytes } from "@/services/exportSaver";
import EditWaiverModal from "../EditWaiverModal";

type FilterMode = "all" | "applied" | "disabled" | "problems";

function statusColor(status: WaiverRuleStatus): string {
    switch (status) {
        case "applied":
            return "green";
        case "disabled":
            return "default";
        case "no_match":
            return "orange";
        case "covered":
            return "gold";
        case "bad_axis":
        case "parse_error":
            return "red";
        default:
            return "default";
    }
}

function statusLabel(status: WaiverRuleStatus): string {
    switch (status) {
        case "applied":
            return "Applied";
        case "disabled":
            return "Disabled";
        case "no_match":
            return "No match";
        case "covered":
            return "Already covered";
        case "bad_axis":
            return "Bad axis";
        case "parse_error":
            return "Parse error";
        default:
            return status;
    }
}

function coveredOverlapLabels(
    coveredByIndexes: number[],
    rules: Array<{ reason: string }>,
): string[] {
    return coveredByIndexes.map((index) => {
        const reason = rules[index]?.reason.trim();
        return reason || `Rule #${index + 1}`;
    });
}

export default function WaiversPanel() {
    const waivers = useWaiverSession();
    const [filter, setFilter] = useState<FilterMode>("all");
    const [includeDisabledOnSave, setIncludeDisabledOnSave] = useState(true);
    const [editIndex, setEditIndex] = useState<number | null>(null);
    const [mergeIndex, setMergeIndex] = useState<number | null>(null);
    const [mergeReason, setMergeReason] = useState("");

    const diagnostics = waivers.report?.diagnostics ?? waivers.file.waivers.map((rule, index) => ({
        index,
        rule,
        status: (rule.disabled ? "disabled" : "no_match") as WaiverRuleStatus,
        matchCount: 0,
        matchedBucketStarts: [] as number[],
        coverpointPaths: [] as string[],
        message: undefined as string | undefined,
    }));

    const mergeRow = mergeIndex === null
        ? null
        : diagnostics.find((row) => row.index === mergeIndex) ?? null;

    const filtered = useMemo(() => {
        return diagnostics.filter((row) => {
            if (filter === "all") {
                return true;
            }
            if (filter === "applied") {
                return row.status === "applied";
            }
            if (filter === "disabled") {
                return row.status === "disabled" || row.rule.disabled;
            }
            return (
                row.status === "no_match"
                || row.status === "covered"
                || row.status === "bad_axis"
                || row.status === "parse_error"
            );
        });
    }, [diagnostics, filter]);

    const disabledCount = waivers.file.waivers.filter((rule) => rule.disabled).length;
    const problemCount = diagnostics.filter((row) =>
        isWaiverProblemStatus(row.status),
    ).length;

    const openMergeCovered = (index: number) => {
        const row = diagnostics.find((diag) => diag.index === index);
        if (!row || row.status !== "covered") {
            return;
        }
        setMergeIndex(index);
        setMergeReason(row.rule.reason);
    };

    const closeMergeCovered = () => {
        setMergeIndex(null);
        setMergeReason("");
    };

    const submitMergeCovered = () => {
        if (mergeIndex === null || !mergeReason.trim()) {
            return;
        }
        waivers.mergeCoveredRule(mergeIndex, mergeReason);
        closeMergeCovered();
    };

    const confirmRemove = (index: number, matchCount: number) => {
        Modal.confirm({
            title: "Remove waiver rule?",
            content: `Remove this rule → ${matchCount} bucket${matchCount === 1 ? "" : "s"} will become unwaived (scoring and styling update immediately).`,
            okText: "Remove",
            okButtonProps: { danger: true },
            onOk: () => {
                const removed = waivers.removeRule(index);
                if (!removed) {
                    return;
                }
                notifyInfo({
                    message: "Waiver rule removed",
                    description: (
                        <Button
                            type="link"
                            size="small"
                            onClick={() => waivers.restoreRule(index, removed)}
                            style={{ padding: 0 }}
                        >
                            Undo
                        </Button>
                    ),
                    duration: 6,
                });
            },
        });
    };

    const download = async () => {
        const text = waivers.serialize(includeDisabledOnSave);
        const bytes = new TextEncoder().encode(text);
        const result = await saveExportBytes(
            bytes,
            "json",
            waivers.fileName ?? "waivers.json",
        );
        if (!result.canceled) {
            waivers.markSaved();
            notifySuccess({ message: "Waivers saved" });
        }
    };

    const copyJson = async () => {
        const text = waivers.serialize(includeDisabledOnSave);
        await navigator.clipboard.writeText(text);
        notifySuccess({ message: "Copied waivers JSON" });
    };

    return (
        <Drawer
            title={
                (waivers.fileName ? `Waivers · ${waivers.fileName}` : "Waivers")
                + (waivers.isDirty ? " *" : "")
            }
            open={waivers.panelOpen}
            onClose={() => waivers.setPanelOpen(false)}
            width={440}
            destroyOnClose={false}
            extra={
                <Space>
                    <Tooltip title="Download waivers.json">
                        <Button
                            icon={<DownloadOutlined />}
                            size="small"
                            onClick={() => void download()}
                            disabled={waivers.file.waivers.length === 0}
                        />
                    </Tooltip>
                    <Tooltip title="Copy JSON">
                        <Button
                            icon={<CopyOutlined />}
                            size="small"
                            onClick={() => void copyJson()}
                            disabled={waivers.file.waivers.length === 0}
                        />
                    </Tooltip>
                </Space>
            }
        >
            <Flex vertical gap={12}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {waivers.applySummary
                        ?? (waivers.file.waivers.length === 0
                            ? "No waiver rules in the session draft."
                            : "Load coverage to see how rules apply.")}
                    {waivers.report && waivers.report.waivedWithHits > 0
                        ? ` · ${waivers.report.waivedWithHits} waived with hits`
                        : ""}
                </Typography.Text>

                <Radio.Group
                    size="small"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    optionType="button"
                    options={[
                        { label: "All", value: "all" },
                        { label: "Applied", value: "applied" },
                        { label: `Disabled (${disabledCount})`, value: "disabled" },
                        { label: `Problems (${problemCount})`, value: "problems" },
                    ]}
                />

                <Flex gap={8} wrap>
                    <Button size="small" onClick={waivers.disableAllProblems} disabled={problemCount === 0}>
                        Disable problems
                    </Button>
                    <Button size="small" onClick={waivers.removeDisabled} disabled={disabledCount === 0}>
                        Remove disabled
                    </Button>
                    <Button size="small" danger onClick={waivers.clear} disabled={waivers.file.waivers.length === 0}>
                        Clear all
                    </Button>
                </Flex>

                {disabledCount > 0 && (
                    <Flex align="center" gap={8}>
                        <Switch
                            size="small"
                            checked={includeDisabledOnSave}
                            onChange={setIncludeDisabledOnSave}
                        />
                        <Typography.Text style={{ fontSize: 12 }}>
                            {includeDisabledOnSave
                                ? `Save includes ${disabledCount} disabled rule${disabledCount === 1 ? "" : "s"}`
                                : `Save skips ${disabledCount} disabled rule${disabledCount === 1 ? "" : "s"}`}
                        </Typography.Text>
                    </Flex>
                )}

                <Flex vertical gap={8}>
                    {filtered.map((row) => {
                        const overlapLabels =
                            row.status === "covered" && row.coveredByIndexes?.length
                                ? coveredOverlapLabels(
                                    row.coveredByIndexes,
                                    waivers.file.waivers,
                                )
                                : [];
                        const extraPaths = row.coverpointPaths.filter(
                            (path) => path !== row.rule.point,
                        );
                        return (
                            <div
                                key={row.index}
                                style={{
                                    border: "1px solid var(--ant-color-border, #d9d9d9)",
                                    borderRadius: 8,
                                    padding: 10,
                                    opacity: row.rule.disabled ? 0.7 : 1,
                                }}
                            >
                                <Flex vertical gap={8}>
                                    <Flex
                                        justify="space-between"
                                        align="center"
                                        gap={8}
                                        wrap="wrap"
                                    >
                                        <Space size={6} wrap>
                                            <Tag color={statusColor(row.status)}>
                                                {statusLabel(row.status)}
                                            </Tag>
                                            {row.matchCount > 0 && (
                                                <Typography.Text
                                                    type="secondary"
                                                    style={{ fontSize: 12 }}
                                                >
                                                    {row.matchCount} bucket
                                                    {row.matchCount === 1 ? "" : "s"}
                                                </Typography.Text>
                                            )}
                                        </Space>
                                        <Space size={2}>
                                            <Tooltip title="Edit reason, author, axes">
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    icon={<EditOutlined />}
                                                    onClick={() => setEditIndex(row.index)}
                                                />
                                            </Tooltip>
                                            <Tooltip title="Remove rule">
                                                <Button
                                                    type="text"
                                                    danger
                                                    size="small"
                                                    icon={<DeleteOutlined />}
                                                    onClick={() =>
                                                        confirmRemove(row.index, row.matchCount)
                                                    }
                                                />
                                            </Tooltip>
                                            <Switch
                                                size="small"
                                                checked={!row.rule.disabled}
                                                onChange={(checked) =>
                                                    waivers.setRuleDisabled(row.index, !checked)
                                                }
                                                title={row.rule.disabled ? "Enable" : "Disable"}
                                            />
                                        </Space>
                                    </Flex>

                                    <Flex vertical gap={4}>
                                        <Typography.Text strong style={{ fontSize: 13 }}>
                                            {row.rule.point}
                                        </Typography.Text>
                                        <Typography.Paragraph
                                            style={{ margin: 0, fontSize: 12 }}
                                            type="secondary"
                                            ellipsis={{ rows: 2, tooltip: row.rule.reason }}
                                        >
                                            {row.rule.reason}
                                        </Typography.Paragraph>
                                    </Flex>

                                    {row.status === "covered" && overlapLabels.length > 0 ? (
                                        <Alert
                                            type="warning"
                                            showIcon
                                            style={{ padding: "8px 10px" }}
                                            message={
                                                <Typography.Text style={{ fontSize: 12 }}>
                                                    Already covered by earlier rule
                                                    {overlapLabels.length === 1 ? "" : "s"}{" "}
                                                    {overlapLabels
                                                        .map((label) => `“${label}”`)
                                                        .join(", ")}
                                                    .
                                                </Typography.Text>
                                            }
                                            description={
                                                <Button
                                                    size="small"
                                                    type="primary"
                                                    ghost
                                                    style={{ marginTop: 6 }}
                                                    onClick={() => openMergeCovered(row.index)}
                                                >
                                                    Merge into one rule…
                                                </Button>
                                            }
                                        />
                                    ) : row.message ? (
                                        <Alert
                                            type="error"
                                            showIcon
                                            style={{ padding: "8px 10px" }}
                                            message={
                                                <Typography.Text style={{ fontSize: 12 }}>
                                                    {row.message}
                                                </Typography.Text>
                                            }
                                        />
                                    ) : null}

                                    {extraPaths.length > 0 && (
                                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                            {extraPaths.join(", ")}
                                        </Typography.Text>
                                    )}
                                    <Typography.Text
                                        code
                                        style={{ fontSize: 11, whiteSpace: "pre-wrap" }}
                                    >
                                        {JSON.stringify(
                                            {
                                                point: row.rule.point,
                                                axes: row.rule.axes,
                                                ...(row.rule.author ? { author: row.rule.author } : {}),
                                                ...(row.rule.disabled ? { disabled: true } : {}),
                                            },
                                            null,
                                            0,
                                        )}
                                    </Typography.Text>
                                </Flex>
                            </div>
                        );
                    })}
                    {filtered.length === 0 && (
                        <Typography.Text type="secondary">No rules in this filter.</Typography.Text>
                    )}
                </Flex>
            </Flex>
            <EditWaiverModal
                open={editIndex !== null}
                ruleIndex={editIndex}
                onClose={() => setEditIndex(null)}
            />
            <Modal
                title="Merge overlapping waiver rules"
                open={mergeRow !== null}
                onCancel={closeMergeCovered}
                onOk={submitMergeCovered}
                okText="Merge"
                okButtonProps={{ disabled: !mergeReason.trim() }}
                destroyOnClose
            >
                <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                    Replace this rule and the{" "}
                    {mergeRow?.coveredByIndexes?.length ?? 0} earlier rule
                    {(mergeRow?.coveredByIndexes?.length ?? 0) === 1 ? "" : "s"} that
                    already cover its buckets with one combined rule.
                </Typography.Paragraph>
                {(mergeRow?.coveredByIndexes?.length ?? 0) > 0 && (
                    <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                        Overlapping reasons:{" "}
                        {coveredOverlapLabels(
                            mergeRow?.coveredByIndexes ?? [],
                            waivers.file.waivers,
                        )
                            .map((label) => `“${label}”`)
                            .join(", ")}
                    </Typography.Paragraph>
                )}
                <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>
                    Reason for merged rule
                </Typography.Text>
                <Input.TextArea
                    rows={3}
                    value={mergeReason}
                    onChange={(event) => setMergeReason(event.target.value)}
                    placeholder="Why these buckets are excused"
                />
            </Modal>
        </Drawer>
    );
}
