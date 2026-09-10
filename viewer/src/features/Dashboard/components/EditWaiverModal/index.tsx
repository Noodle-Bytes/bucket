/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { useEffect, useMemo, useState } from "react";
import {
    Modal,
    Input,
    Form,
    AutoComplete,
    Typography,
    Switch,
    Alert,
    Button,
    Flex,
    Space,
} from "antd";
import { useWaiverSession } from "@/hooks/useWaiverSession";
import {
    parseWaiverSpec,
    WaiverSpecError,
    waiverAxesToFilters,
    filtersToWaiverAxes,
    type WaiverSpec,
} from "@/services/waiverSpec";
import { collectAxisOptionsForPoint } from "@/services/matchWaivers";
import AxisFilterPicker from "../AxisFilterPicker";

type EditWaiverModalProps = {
    open: boolean;
    ruleIndex: number | null;
    onClose: () => void;
};

export default function EditWaiverModal({ open, ruleIndex, onClose }: EditWaiverModalProps) {
    const waivers = useWaiverSession();
    const rule: WaiverSpec | null =
        ruleIndex !== null ? (waivers.file.waivers[ruleIndex] ?? null) : null;

    const [point, setPoint] = useState("");
    const [reason, setReason] = useState("");
    const [author, setAuthor] = useState("");
    const [axisFilters, setAxisFilters] = useState<Record<string, string[]>>({});
    const [disabled, setDisabled] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !rule) {
            return;
        }
        setPoint(rule.point);
        setReason(rule.reason);
        setAuthor(rule.author);
        setAxisFilters(waiverAxesToFilters(rule.axes));
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

    const axisOptions = useMemo(() => {
        const readout = waivers.activeReadouts[0];
        if (!readout || !point.trim()) {
            return [];
        }
        const collected = collectAxisOptionsForPoint(
            readout,
            point.trim(),
            waivers.activePointPath,
        );
        // Keep any patterns already on the saved rule visible/toggleable.
        const byName = new Map(collected.map((axis) => [axis.name, new Set(axis.values)]));
        if (rule) {
            for (const [axis, patterns] of Object.entries(rule.axes)) {
                if (!byName.has(axis)) {
                    byName.set(axis, new Set());
                }
                const set = byName.get(axis)!;
                for (const value of typeof patterns === "string" ? [patterns] : patterns) {
                    set.add(value);
                }
            }
        }
        const natCompare = (a: string, b: string) =>
            a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
        return [...byName.entries()]
            .sort(([a], [b]) => natCompare(a, b))
            .map(([name, values]) => ({
                name,
                values: [...values].sort(natCompare),
            }));
    }, [waivers.activeReadouts, waivers.activePointPath, point, rule]);

    const submit = () => {
        if (ruleIndex === null) {
            return;
        }
        try {
            const parsed = parseWaiverSpec({
                point,
                reason,
                author,
                axes: filtersToWaiverAxes(axisFilters),
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
            destroyOnClose
            width={560}
            footer={
                <Flex justify="space-between" align="center" wrap="wrap" gap={8}>
                    <Button onClick={() => setAxisFilters({})}>Clear axes</Button>
                    <Space>
                        <Button onClick={onClose}>Cancel</Button>
                        <Button type="primary" onClick={submit}>
                            Save
                        </Button>
                    </Space>
                </Flex>
            }
        >
            <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                Update reason, author, coverpoint path, or axis values. Scoring updates live when
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
                    label="Axes"
                    extra="Tick values on an axis to add them (OR). Tick values on other axes to narrow (AND). Leave an axis unticked for any value."
                >
                    <AxisFilterPicker
                        axes={axisOptions}
                        filters={axisFilters}
                        onChange={setAxisFilters}
                        emptySummary="No axis constraints (entire coverpoint)"
                    />
                </Form.Item>
                <Form.Item label="Enabled">
                    <Switch checked={!disabled} onChange={(checked) => setDisabled(!checked)} />
                </Form.Item>
            </Form>
        </Modal>
    );
}
