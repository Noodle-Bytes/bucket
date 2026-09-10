/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Button,
    Checkbox,
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
    SearchOutlined,
} from "@ant-design/icons";
import { useWaiverSession } from "@/hooks/useWaiverSession";
import {
    isWaiverProblemStatus,
    matchesPointPath,
    type WaiverRuleStatus,
} from "@/services/matchWaivers";
import { notifySuccess, notifyInfo } from "@/utils/themedStaticNotification";
import { saveExportBytes } from "@/services/exportSaver";
import { formatWaiverAxesSummary } from "@/services/waiverSpec";
import EditWaiverModal from "../EditWaiverModal";
import WaiverAxesList from "../WaiverAxesList";

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

function ruleNumber(index: number): string {
    return `#${index + 1}`;
}

function coveredOverlapLabels(
    coveredByIndexes: number[],
    rules: Array<{ reason: string }>,
): Array<{ index: number; label: string }> {
    return coveredByIndexes.map((index) => {
        const reason = rules[index]?.reason.trim();
        return {
            index,
            label: reason ? `${ruleNumber(index)} · ${reason}` : ruleNumber(index),
        };
    });
}

function ruleSearchHaystack(
    index: number,
    status: WaiverRuleStatus,
    rule: { point: string; reason: string; author: string; axes: Record<string, string | string[]> },
): string {
    return [
        ruleNumber(index),
        statusLabel(status),
        rule.point,
        rule.reason,
        rule.author,
        formatWaiverAxesSummary(rule.axes),
        JSON.stringify(rule.axes),
    ]
        .join("\n")
        .toLowerCase();
}

export default function WaiversPanel() {
    const waivers = useWaiverSession();
    const [filter, setFilter] = useState<FilterMode>("all");
    const [search, setSearch] = useState("");
    const [currentPointOnly, setCurrentPointOnly] = useState(false);
    const [includeDisabledOnSave, setIncludeDisabledOnSave] = useState(true);
    const [editIndex, setEditIndex] = useState<number | null>(null);
    const [mergeIndex, setMergeIndex] = useState<number | null>(null);
    const [mergeReason, setMergeReason] = useState("");
    const [scrollToIndex, setScrollToIndex] = useState<number | null>(null);
    const [expandedAxes, setExpandedAxes] = useState<Set<number>>(() => new Set());
    const ruleRefs = useRef(new Map<number, HTMLDivElement>());

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

    const activePointPath = waivers.activePointPath;

    useEffect(() => {
        if (!activePointPath) {
            setCurrentPointOnly(false);
        }
    }, [activePointPath]);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return diagnostics.filter((row) => {
            if (filter === "applied" && row.status !== "applied") {
                return false;
            }
            if (filter === "disabled" && !(row.status === "disabled" || row.rule.disabled)) {
                return false;
            }
            if (
                filter === "problems"
                && !isWaiverProblemStatus(row.status)
            ) {
                return false;
            }
            if (currentPointOnly && activePointPath) {
                const applies =
                    matchesPointPath(activePointPath, row.rule.point)
                    || row.coverpointPaths.includes(activePointPath);
                if (!applies) {
                    return false;
                }
            }
            if (query) {
                const haystack = ruleSearchHaystack(row.index, row.status, row.rule);
                if (!haystack.includes(query)) {
                    return false;
                }
            }
            return true;
        });
    }, [diagnostics, filter, search, currentPointOnly, activePointPath]);

    useEffect(() => {
        if (scrollToIndex === null) {
            return;
        }
        const node = ruleRefs.current.get(scrollToIndex);
        if (node) {
            node.scrollIntoView({ behavior: "smooth", block: "nearest" });
            setScrollToIndex(null);
        }
    }, [scrollToIndex, filtered]);

    const disabledCount = waivers.file.waivers.filter((rule) => rule.disabled).length;
    const problemCount = diagnostics.filter((row) =>
        isWaiverProblemStatus(row.status),
    ).length;
    const currentPointCount = activePointPath
        ? diagnostics.filter(
            (row) =>
                matchesPointPath(activePointPath, row.rule.point)
                || row.coverpointPaths.includes(activePointPath),
        ).length
        : 0;

    const jumpToRule = (index: number) => {
        setFilter("all");
        setSearch("");
        setCurrentPointOnly(false);
        setExpandedAxes((prev) => {
            if (prev.has(index)) {
                return prev;
            }
            const next = new Set(prev);
            next.add(index);
            return next;
        });
        setScrollToIndex(index);
    };

    const toggleAxesExpanded = (index: number) => {
        setExpandedAxes((prev) => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

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

                <Input
                    allowClear
                    size="small"
                    prefix={<SearchOutlined />}
                    placeholder="Search rules by #, point, reason, author…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    disabled={waivers.file.waivers.length === 0}
                />

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

                <Tooltip
                    title={
                        activePointPath
                            ? `Show rules whose point pattern matches ${activePointPath}`
                            : "Open a coverpoint to filter waivers for it"
                    }
                >
                    <Checkbox
                        checked={currentPointOnly}
                        disabled={!activePointPath}
                        onChange={(event) => setCurrentPointOnly(event.target.checked)}
                    >
                        Current coverpoint
                        {activePointPath ? ` (${currentPointCount})` : ""}
                    </Checkbox>
                </Tooltip>

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
                                ref={(node) => {
                                    if (node) {
                                        ruleRefs.current.set(row.index, node);
                                    } else {
                                        ruleRefs.current.delete(row.index);
                                    }
                                }}
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
                                            <Typography.Text
                                                strong
                                                style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}
                                            >
                                                {ruleNumber(row.index)}
                                            </Typography.Text>
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
                                                    {overlapLabels.map((item, itemIndex) => (
                                                        <span key={item.index}>
                                                            {itemIndex > 0 ? ", " : ""}
                                                            <Button
                                                                type="link"
                                                                size="small"
                                                                style={{
                                                                    padding: 0,
                                                                    height: "auto",
                                                                    fontSize: 12,
                                                                }}
                                                                onClick={() => jumpToRule(item.index)}
                                                            >
                                                                {item.label}
                                                            </Button>
                                                        </span>
                                                    ))}
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

                                    <Button
                                        type="link"
                                        size="small"
                                        style={{ paddingInline: 0, height: "auto", alignSelf: "flex-start" }}
                                        onClick={() => toggleAxesExpanded(row.index)}
                                    >
                                        {expandedAxes.has(row.index) ? "Hide rule" : "Show rule"}
                                    </Button>

                                    {expandedAxes.has(row.index) && (
                                        <Flex vertical gap={8}>
                                            {extraPaths.length > 0 && (
                                                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                                    {extraPaths.join(", ")}
                                                </Typography.Text>
                                            )}
                                            <WaiverAxesList axes={row.rule.axes} />
                                            {row.rule.author ? (
                                                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                                    Author: {row.rule.author}
                                                </Typography.Text>
                                            ) : null}
                                        </Flex>
                                    )}
                                </Flex>
                            </div>
                        );
                    })}
                    {filtered.length === 0 && (
                        <Typography.Text type="secondary">
                            {waivers.file.waivers.length === 0
                                ? "No rules in this filter."
                                : "No rules match the current search/filters."}
                        </Typography.Text>
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
                        Overlapping rules:{" "}
                        {coveredOverlapLabels(
                            mergeRow?.coveredByIndexes ?? [],
                            waivers.file.waivers,
                        )
                            .map((item) => item.label)
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
