/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { useEffect, useMemo, useState } from "react";
import {
    Modal,
    Typography,
    List,
    Tag,
    Space,
    Button,
    Spin,
    Alert,
} from "antd";
import {
    applyRemoveBucketsResult,
    mergeWaiverSpecs,
    removeBucketsFromWaiverRules,
    wouldCondenseWaiverSpecs,
    type RemoveBucketsFromWaiversResult,
    type SelectedBucket,
} from "@/services/inferWaiverRules";
import { useWaiverSession } from "@/hooks/useWaiverSession";
import WaiverAxesList from "../WaiverAxesList";

const COLLAPSED_RULE_COUNT = 3;

type RemoveWaiverModalProps = {
    open: boolean;
    onClose: () => void;
    /** Called after rules are updated (before close). */
    onRemoved?: () => void;
    pointPath: string;
    selectedKeys: number[];
    allWaivable: SelectedBucket[];
};

function ruleNumber(index: number): string {
    return `#${index + 1}`;
}

export default function RemoveWaiverModal({
    open,
    onClose,
    onRemoved,
    pointPath,
    selectedKeys,
    allWaivable,
}: RemoveWaiverModalProps) {
    const waivers = useWaiverSession();
    const [result, setResult] = useState<RemoveBucketsFromWaiversResult | null>(null);
    const [computing, setComputing] = useState(false);
    const [rulesExpanded, setRulesExpanded] = useState(false);
    const [openAxisRules, setOpenAxisRules] = useState<Set<number>>(() => new Set());
    const [condensePromptOpen, setCondensePromptOpen] = useState(false);

    useEffect(() => {
        if (!open) {
            setResult(null);
            setComputing(false);
            setRulesExpanded(false);
            setOpenAxisRules(new Set());
            setCondensePromptOpen(false);
            return;
        }

        let cancelled = false;
        setComputing(true);
        setResult(null);
        setRulesExpanded(false);
        setOpenAxisRules(new Set());
        setCondensePromptOpen(false);

        const handle = window.setTimeout(() => {
            const diagnostics = waivers.report?.diagnostics ?? [];
            const next = removeBucketsFromWaiverRules(
                waivers.file.waivers,
                diagnostics,
                pointPath,
                selectedKeys,
                allWaivable,
            );
            if (!cancelled) {
                setResult(next);
                setComputing(false);
            }
        }, 0);

        return () => {
            cancelled = true;
            window.clearTimeout(handle);
        };
    }, [open, selectedKeys, allWaivable, pointPath, waivers.file.waivers, waivers.report]);

    const canSubmit =
        !computing
        && result !== null
        && (result.removedCount > 0 || result.deletedIndexes.length > 0);

    const hiddenRuleCount = Math.max(
        0,
        (result?.replacements.length ?? 0) - COLLAPSED_RULE_COUNT,
    );
    const visibleReplacements =
        result === null
            ? []
            : rulesExpanded || hiddenRuleCount === 0
              ? result.replacements
              : result.replacements.slice(0, COLLAPSED_RULE_COUNT);

    const condensePreview = useMemo(() => {
        if (!result || result.replacements.length === 0) {
            return null;
        }
        const separateTotal = result.unchanged.length + result.replacements.length;
        const condensedTotal = mergeWaiverSpecs(
            result.unchanged,
            result.replacements,
        ).length;
        return {
            incoming: result.replacements.length,
            separateTotal,
            condensedTotal,
            absorbed: separateTotal - condensedTotal,
        };
    }, [result]);

    const finishApply = (condense: boolean) => {
        if (!result) {
            return;
        }
        const next = applyRemoveBucketsResult(result, condense);
        waivers.replaceRules(next);
        setCondensePromptOpen(false);
        onRemoved?.();
        onClose();
    };

    const submit = () => {
        if (!result || !canSubmit) {
            return;
        }
        if (wouldCondenseWaiverSpecs(result.unchanged, result.replacements)) {
            setCondensePromptOpen(true);
            return;
        }
        finishApply(false);
    };

    const summaryParts: string[] = [];
    if (result) {
        if (result.removedCount > 0) {
            summaryParts.push(
                `Remove ${result.removedCount} waived bucket${result.removedCount === 1 ? "" : "s"}`,
            );
        }
        if (result.rewrittenIndexes.length > 0) {
            summaryParts.push(
                `rewrite ${result.rewrittenIndexes.map(ruleNumber).join(", ")}`,
            );
        }
        if (result.deletedIndexes.length > 0) {
            summaryParts.push(
                `delete ${result.deletedIndexes.map(ruleNumber).join(", ")}`,
            );
        }
    }

    return (
        <>
            <Modal
                title={`Remove from waivers · ${pointPath}`}
                open={open}
                onCancel={onClose}
                footer={null}
                destroyOnClose
            >
                {computing ? (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 12,
                            padding: "24px 0",
                        }}
                    >
                        <Spin />
                        <Typography.Text type="secondary">
                            Updating waiver rules…
                        </Typography.Text>
                    </div>
                ) : (
                    <>
                        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                            {summaryParts.length > 0
                                ? `${summaryParts.join("; ")}.`
                                : "No waived buckets in the selection can be removed."}
                        </Typography.Paragraph>

                        {result && result.skippedMultiPointCount > 0 && (
                            <Alert
                                type="warning"
                                showIcon
                                style={{ marginBottom: 12 }}
                                message={
                                    `${result.skippedMultiPointCount} selected bucket${
                                        result.skippedMultiPointCount === 1 ? "" : "s"
                                    } stay waived — owned by a multi-coverpoint rule. Edit or remove that rule in Manage waivers.`
                                }
                            />
                        )}

                        <Space style={{ width: "100%", justifyContent: "flex-end", marginBottom: 16 }}>
                            <Button onClick={onClose}>Cancel</Button>
                            <Button type="primary" danger disabled={!canSubmit} onClick={submit}>
                                Remove from waivers
                            </Button>
                        </Space>

                        {result && result.deletedIndexes.length > 0 && result.replacements.length === 0 && (
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                Selected buckets were the only matches for{" "}
                                {result.deletedIndexes.map(ruleNumber).join(", ")}; those rules
                                will be deleted.
                            </Typography.Text>
                        )}

                        {result && result.replacements.length > 0 && (
                            <List
                                size="small"
                                header={
                                    <Typography.Text strong>
                                        Replacement rules ({result.replacements.length})
                                    </Typography.Text>
                                }
                                dataSource={visibleReplacements}
                                footer={
                                    hiddenRuleCount > 0 ? (
                                        <Button
                                            type="link"
                                            size="small"
                                            style={{ paddingInline: 0 }}
                                            onClick={() => setRulesExpanded((prev) => !prev)}
                                        >
                                            {rulesExpanded
                                                ? "Show less"
                                                : `Show more (${hiddenRuleCount} more)`}
                                        </Button>
                                    ) : null
                                }
                                renderItem={(rule, index) => {
                                    const axesOpen = openAxisRules.has(index);
                                    return (
                                        <List.Item>
                                            <Space
                                                direction="vertical"
                                                size={6}
                                                style={{ width: "100%" }}
                                            >
                                                <Typography.Text strong style={{ fontSize: 12 }}>
                                                    {rule.point}
                                                </Typography.Text>
                                                <Space size={6} wrap>
                                                    <Tag>{rule.reason}</Tag>
                                                    {rule.author ? (
                                                        <Tag>{rule.author}</Tag>
                                                    ) : null}
                                                </Space>
                                                <Button
                                                    type="link"
                                                    size="small"
                                                    style={{ paddingInline: 0, height: "auto" }}
                                                    onClick={() =>
                                                        setOpenAxisRules((prev) => {
                                                            const next = new Set(prev);
                                                            if (next.has(index)) {
                                                                next.delete(index);
                                                            } else {
                                                                next.add(index);
                                                            }
                                                            return next;
                                                        })
                                                    }
                                                >
                                                    {axesOpen ? "Hide rule" : "Show rule"}
                                                </Button>
                                                {axesOpen && <WaiverAxesList axes={rule.axes} />}
                                            </Space>
                                        </List.Item>
                                    );
                                }}
                            />
                        )}
                    </>
                )}
            </Modal>
            <Modal
                title="Condense with existing rules?"
                open={condensePromptOpen}
                onCancel={() => setCondensePromptOpen(false)}
                destroyOnClose
                footer={
                    <Space style={{ width: "100%", justifyContent: "flex-end" }}>
                        <Button onClick={() => setCondensePromptOpen(false)}>Cancel</Button>
                        <Button onClick={() => finishApply(false)}>Keep separate</Button>
                        <Button type="primary" onClick={() => finishApply(true)}>
                            Condense
                        </Button>
                    </Space>
                }
            >
                <Typography.Paragraph style={{ marginTop: 0 }}>
                    {condensePreview
                        ? `These ${condensePreview.incoming} replacement rule${
                              condensePreview.incoming === 1 ? "" : "s"
                          } share a reason and compatible axes with rules still in the session. Condensing would store ${condensePreview.condensedTotal} rule${
                              condensePreview.condensedTotal === 1 ? "" : "s"
                          } total instead of ${condensePreview.separateTotal}.`
                        : "These replacement rules can merge with existing session rules that share the same reason and compatible axes."}
                </Typography.Paragraph>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    Condensing combines axis values into fewer rules. Keep separate leaves every
                    replacement as its own entry.
                </Typography.Paragraph>
            </Modal>
        </>
    );
}
