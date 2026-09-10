/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { useEffect, useMemo, useState } from "react";
import { Modal, Input, Form, AutoComplete, Typography, Switch, Alert } from "antd";
import { useWaiverSession } from "@/hooks/useWaiverSession";
import {
    parseWaiverSpec,
    WaiverSpecError,
    type WaiverAxes,
    type WaiverSpec,
} from "@/services/waiverSpec";

type EditWaiverModalProps = {
    open: boolean;
    ruleIndex: number | null;
    onClose: () => void;
};

function axesToText(axes: WaiverAxes): string {
    return JSON.stringify(axes, null, 2);
}

export default function EditWaiverModal({ open, ruleIndex, onClose }: EditWaiverModalProps) {
    const waivers = useWaiverSession();
    const rule: WaiverSpec | null =
        ruleIndex !== null ? (waivers.file.waivers[ruleIndex] ?? null) : null;

    const [point, setPoint] = useState("");
    const [reason, setReason] = useState("");
    const [author, setAuthor] = useState("");
    const [axesText, setAxesText] = useState("{}");
    const [disabled, setDisabled] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !rule) {
            return;
        }
        setPoint(rule.point);
        setReason(rule.reason);
        setAuthor(rule.author);
        setAxesText(axesToText(rule.axes));
        setDisabled(rule.disabled);
        setError(null);
    }, [open, rule]);

    const reasonOptions = useMemo(() => {
        const seen = new Set<string>();
        const options: { value: string }[] = [];
        for (const row of waivers.file.waivers) {
            const value = row.reason.trim();
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
        for (const row of waivers.file.waivers) {
            const value = row.author.trim();
            if (!value || seen.has(value)) {
                continue;
            }
            seen.add(value);
            options.push({ value });
        }
        return options;
    }, [waivers.file.waivers]);

    const submit = () => {
        if (ruleIndex === null) {
            return;
        }
        try {
            let axesRaw: unknown = {};
            try {
                axesRaw = JSON.parse(axesText || "{}");
            } catch {
                throw new WaiverSpecError("axes must be valid JSON (object of string or string[])");
            }
            const parsed = parseWaiverSpec({
                point,
                reason,
                author,
                axes: axesRaw,
                disabled,
            });
            waivers.updateRule(ruleIndex, parsed);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    };

    return (
        <Modal
            title={rule ? `Edit waiver · ${rule.point}` : "Edit waiver"}
            open={open && ruleIndex !== null && rule !== null}
            onCancel={onClose}
            onOk={submit}
            okText="Save"
            destroyOnClose
            width={520}
        >
            <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                Update reason, author, coverpoint path, or axis patterns. Scoring updates live when
                you save.
            </Typography.Paragraph>

            {error && (
                <Alert
                    type="error"
                    showIcon
                    message={error}
                    style={{ marginBottom: 12 }}
                />
            )}

            <Form layout="vertical">
                <Form.Item label="Point" required>
                    <Input value={point} onChange={(event) => setPoint(event.target.value)} />
                </Form.Item>
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
                        <Input.TextArea rows={3} />
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
                        style={{ width: "100%" }}
                        placeholder="Optional"
                    />
                </Form.Item>
                <Form.Item
                    label="Axes (JSON)"
                    extra='Example: {"x": ["0","1"]} or {"kind": "A"}'
                >
                    <Input.TextArea
                        value={axesText}
                        onChange={(event) => setAxesText(event.target.value)}
                        rows={5}
                        style={{ fontFamily: "monospace", fontSize: 12 }}
                    />
                </Form.Item>
                <Form.Item label="Enabled">
                    <Switch checked={!disabled} onChange={(checked) => setDisabled(!checked)} />
                </Form.Item>
            </Form>
        </Modal>
    );
}
