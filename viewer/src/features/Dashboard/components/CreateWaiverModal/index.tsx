/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { useEffect, useMemo, useState } from "react";
import {
    Modal,
    Input,
    Form,
    Typography,
    List,
    Tag,
    Space,
    AutoComplete,
    Button,
    Spin,
} from "antd";
import {
    inferWaiverRules,
    inferredRulesToSpecs,
    type InferredWaiverRule,
    type SelectedBucket,
} from "@/services/inferWaiverRules";
import { useWaiverSession } from "@/hooks/useWaiverSession";

const COLLAPSED_RULE_COUNT = 3;

type CreateWaiverModalProps = {
    open: boolean;
    onClose: () => void;
    /** Called after rules are appended to the session (before close). */
    onCreated?: () => void;
    pointPath: string;
    selectedKeys: number[];
    allWaivable: SelectedBucket[];
};

export default function CreateWaiverModal({
    open,
    onClose,
    onCreated,
    pointPath,
    selectedKeys,
    allWaivable,
}: CreateWaiverModalProps) {
    const waivers = useWaiverSession();
    const [reason, setReason] = useState("");
    const [author, setAuthor] = useState("");
    const [rulesExpanded, setRulesExpanded] = useState(false);
    const [rules, setRules] = useState<InferredWaiverRule[]>([]);
    const [inferring, setInferring] = useState(false);

    // First create in the session: blank author. After that, reuse last used.
    useEffect(() => {
        if (open) {
            setReason("");
            setAuthor(waivers.lastAuthor);
            setRulesExpanded(false);
        }
    }, [open, waivers.lastAuthor]);

    // Open immediately; infer on a later turn so the modal can paint first.
    useEffect(() => {
        if (!open) {
            setRules([]);
            setInferring(false);
            return;
        }

        let cancelled = false;
        setInferring(true);
        setRules([]);

        const handle = window.setTimeout(() => {
            const selectedSet = new Set(selectedKeys);
            const selected = allWaivable.filter((bucket) => selectedSet.has(bucket.start));
            const next = inferWaiverRules(selected, pointPath, allWaivable);
            if (!cancelled) {
                setRules(next);
                setInferring(false);
            }
        }, 0);

        return () => {
            cancelled = true;
            window.clearTimeout(handle);
        };
    }, [open, selectedKeys, allWaivable, pointPath]);

    const preview = useMemo(() => {
        const totalSelected = rules.reduce((sum, rule) => sum + rule.selectedCovered, 0);
        return { totalSelected };
    }, [rules]);

    const reasonOptions = useMemo(() => {
        const seen = new Set<string>();
        const options: { value: string }[] = [];
        for (const rule of waivers.file.waivers) {
            const value = rule.reason.trim();
            if (!value || seen.has(value)) {
                continue;
            }
            seen.add(value);
            options.push({ value });
        }
        return options;
    }, [waivers.file.waivers]);

    const authorOptions = useMemo(() => {
        const seen = new Set<string>();
        const options: { value: string }[] = [];
        for (const rule of waivers.file.waivers) {
            const value = rule.author.trim();
            if (!value || seen.has(value)) {
                continue;
            }
            seen.add(value);
            options.push({ value });
        }
        return options;
    }, [waivers.file.waivers]);

    const canSubmit = !inferring && reason.trim().length > 0 && rules.length > 0;
    const hiddenRuleCount = Math.max(0, rules.length - COLLAPSED_RULE_COUNT);
    const visibleRules =
        rulesExpanded || hiddenRuleCount === 0
            ? rules
            : rules.slice(0, COLLAPSED_RULE_COUNT);

    const submit = () => {
        const trimmed = reason.trim();
        if (!trimmed || inferring || rules.length === 0) {
            return;
        }
        const specs = inferredRulesToSpecs(rules, trimmed, author.trim());
        waivers.appendRules(specs);
        setReason("");
        onCreated?.();
        onClose();
    };

    return (
        <Modal
            title={`Create waiver · ${pointPath}`}
            open={open}
            onCancel={onClose}
            footer={null}
            destroyOnClose
        >
            <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                {inferring
                    ? "Inferring rules…"
                    : `Inferred ${rules.length} rule${rules.length === 1 ? "" : "s"} covering ${preview.totalSelected} selected bucket${preview.totalSelected === 1 ? "" : "s"}.`}
            </Typography.Paragraph>

            <Form layout="vertical">
                <Form.Item label="Reason" required>
                    <AutoComplete
                        value={reason}
                        options={reasonOptions}
                        onChange={setReason}
                        filterOption={(input, option) =>
                            String(option?.value ?? "")
                                .toLowerCase()
                                .includes(input.toLowerCase())
                        }
                        style={{ width: "100%" }}
                    >
                        <Input.TextArea
                            rows={3}
                            placeholder="Why these buckets are excused"
                        />
                    </AutoComplete>
                </Form.Item>
                <Form.Item label="Author">
                    <AutoComplete
                        value={author}
                        options={authorOptions}
                        onChange={setAuthor}
                        filterOption={(input, option) =>
                            String(option?.value ?? "")
                                .toLowerCase()
                                .includes(input.toLowerCase())
                        }
                        placeholder={
                            waivers.lastAuthor
                                ? "Defaults to last used author"
                                : "Optional — autocomplete after the first save"
                        }
                        style={{ width: "100%" }}
                    />
                </Form.Item>
            </Form>

            <Space style={{ width: "100%", justifyContent: "flex-end", marginBottom: 16 }}>
                <Button onClick={onClose}>Cancel</Button>
                <Button type="primary" disabled={!canSubmit} onClick={submit}>
                    Add to session
                </Button>
            </Space>

            {inferring ? (
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
                    <Typography.Text type="secondary">Inferring rules…</Typography.Text>
                </div>
            ) : (
                <List
                    size="small"
                    header={<Typography.Text strong>Rules</Typography.Text>}
                    dataSource={visibleRules}
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
                    renderItem={(rule) => (
                        <List.Item>
                            <Space direction="vertical" size={2} style={{ width: "100%" }}>
                                <Typography.Text code style={{ fontSize: 12 }}>
                                    {rule.point}
                                    {Object.keys(rule.axes).length > 0
                                        ? ` · ${JSON.stringify(rule.axes)}`
                                        : " · (all axes)"}
                                </Typography.Text>
                                <Space size={6}>
                                    <Tag>
                                        {rule.selectedCovered} selected
                                    </Tag>
                                    {rule.extraCount > 0 && (
                                        <Tag color="orange">+{rule.extraCount} extra</Tag>
                                    )}
                                </Space>
                            </Space>
                        </List.Item>
                    )}
                />
            )}
        </Modal>
    );
}
