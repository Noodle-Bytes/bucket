/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { CheckCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import { Button, Checkbox, ConfigProvider, Modal, Segmented, Spin, Typography } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import Theme from "@/providers/Theme";
import { buildBucketAntModalTheme } from "@/utils/bucketAntModalTheme";
import { getThemePreference } from "@/utils/themePreference";
import {
    buildCoverageExportSummary,
    exportCoverageReportAsync,
    type CoverageReportExportPhase,
    type CoverageReportExportProgress,
} from "@/services/coverageReportExport";
import type { CoveragePatternDetailLevel } from "@/services/coverageUnhitPatterns";
import { mergeReadoutsStrict } from "@/services/readoutUtils";
import type { CompareRecordMeta, CoverageDefinition } from "@/types/coverageCompare";

export type CoverageReportRecordOption = {
    id: string;
    label: string;
    readout: Readout;
};

export type CoverageReportExportModalProps = {
    open: boolean;
    records: CoverageReportRecordOption[];
    onClose: () => void;
    onExportingChange?: (exporting: boolean) => void;
};

type ExportStatus = "idle" | "running" | "complete" | "canceled" | "error";

const PATTERN_SCOPE_OPTIONS: Array<{ value: CoveragePatternDetailLevel; label: string }> = [
    { value: "off", label: "Off" },
    { value: "fast", label: "Largest only" },
    { value: "medium", label: "Balanced" },
    { value: "detailed", label: "All unhit" },
];

const PHASE_LABELS: Record<CoverageReportExportPhase, string> = {
    buckets: "Preparing coverage",
    patterns: "Detecting patterns",
    serialize: "Building report",
    save: "Saving file",
};

function toRecordMeta(record: CoverageReportRecordOption): CompareRecordMeta {
    return {
        id: record.id,
        label: record.label,
        source: record.readout.get_source(),
        sourceKey: record.readout.get_source_key(),
        defSha: record.readout.get_def_sha(),
        recSha: record.readout.get_rec_sha(),
    };
}

export default function CoverageReportExportModal({
    open,
    records,
    onClose,
    onExportingChange,
}: CoverageReportExportModalProps) {
    const pref = getThemePreference();
    const colors = pref.theme.colors;
    const abortRef = useRef<AbortController | null>(null);

    const [format, setFormat] = useState<"json" | "html">("html");
    const [patternDetail, setPatternDetail] = useState<CoveragePatternDetailLevel>("medium");
    const [definition, setDefinition] = useState<CoverageDefinition>("any_hit");
    const [mergeBeforeWrite, setMergeBeforeWrite] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [status, setStatus] = useState<ExportStatus>("idle");
    const [progress, setProgress] = useState<CoverageReportExportProgress | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const exportSummary = useMemo(
        () =>
            buildCoverageExportSummary({
                format,
                patternDetail,
                definition,
            }),
        [format, patternDetail, definition],
    );

    useEffect(() => {
        if (open) {
            setSelectedIds(records.map((record) => record.id));
            setMergeBeforeWrite(false);
            return;
        }
        abortRef.current?.abort();
        abortRef.current = null;
        setStatus("idle");
        setProgress(null);
        setErrorMessage(null);
        onExportingChange?.(false);
    }, [open, records, onExportingChange]);

    const isRunning = status === "running";
    const phaseLabel = progress ? PHASE_LABELS[progress.phase] : null;
    const selectedRecords = records.filter((record) => selectedIds.includes(record.id));

    async function startExport() {
        if (selectedRecords.length === 0 || isRunning) {
            return;
        }

        const controller = new AbortController();
        abortRef.current = controller;
        setStatus("running");
        setErrorMessage(null);
        setProgress({
            phase: "buckets",
            message: "Preparing report…",
        });
        onExportingChange?.(true);

        try {
            const inputs =
                mergeBeforeWrite && selectedRecords.length > 1
                    ? [
                          {
                              readout: mergeReadoutsStrict(
                                  selectedRecords.map((record) => record.readout),
                              ),
                              record: {
                                  ...toRecordMeta(selectedRecords[0]),
                                  id: "merged",
                                  label: "Merged coverage",
                                  recSha: "",
                              },
                              title: "Merged coverage",
                          },
                      ]
                    : selectedRecords.map((record) => ({
                          readout: record.readout,
                          record: toRecordMeta(record),
                          title: record.label,
                      }));

            await exportCoverageReportAsync(inputs, format, {
                signal: controller.signal,
                patternDetail,
                definition,
                onProgress: setProgress,
            });
            setStatus("complete");
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                setStatus("canceled");
                setProgress({
                    phase: "patterns",
                    message: "Export canceled",
                });
            } else {
                const detail = error instanceof Error ? error.message : String(error);
                setStatus("error");
                setErrorMessage(detail);
            }
        } finally {
            abortRef.current = null;
            onExportingChange?.(false);
        }
    }

    function cancelExport() {
        abortRef.current?.abort();
    }

    function handleClose() {
        if (isRunning) {
            return;
        }
        onClose();
    }

    const title =
        status === "complete"
            ? "Report saved"
            : status === "error"
              ? "Export failed"
              : status === "canceled"
                ? "Export canceled"
                : isRunning
                  ? "Generating coverage report"
                  : "Generate coverage report";

    const optionBlockStyle = { marginBottom: 16 };

    return (
        <ConfigProvider theme={buildBucketAntModalTheme(pref)}>
            <Theme.Consumer>
                {() => (
                    <Modal
                        open={open}
                        title={title}
                        footer={null}
                        closable={!isRunning}
                        maskClosable={!isRunning}
                        keyboard={!isRunning}
                        onCancel={handleClose}
                        rootClassName={pref.theme.className}
                        styles={{
                            content: {
                                backgroundColor: colors.tertiarybg.value,
                                border: `1px solid ${colors.secondarybg.value}`,
                            },
                            body: {
                                paddingTop: 8,
                            },
                        }}
                    >
                        {status === "idle" && (
                            <>
                                <div style={optionBlockStyle}>
                                    <Typography.Text
                                        strong
                                        style={{ display: "block", marginBottom: 8 }}
                                    >
                                        Format
                                    </Typography.Text>
                                    <Segmented
                                        block
                                        value={format}
                                        onChange={(value) => setFormat(value as "json" | "html")}
                                        options={[
                                            { label: "HTML", value: "html" },
                                            { label: "JSON", value: "json" },
                                        ]}
                                    />
                                </div>
                                <div style={optionBlockStyle}>
                                    <Typography.Text
                                        strong
                                        style={{ display: "block", marginBottom: 8 }}
                                    >
                                        Coverage definition
                                    </Typography.Text>
                                    <Segmented
                                        block
                                        value={definition}
                                        onChange={(value) =>
                                            setDefinition(value as CoverageDefinition)
                                        }
                                        options={[
                                            { label: "Any hit", value: "any_hit" },
                                            { label: "Met goal", value: "met_goal" },
                                        ]}
                                    />
                                </div>
                                <div style={optionBlockStyle}>
                                    <Typography.Text
                                        strong
                                        style={{ display: "block", marginBottom: 8 }}
                                    >
                                        Unhit pattern analysis
                                    </Typography.Text>
                                    <Segmented
                                        block
                                        value={patternDetail}
                                        onChange={(value) =>
                                            setPatternDetail(value as CoveragePatternDetailLevel)
                                        }
                                        options={PATTERN_SCOPE_OPTIONS}
                                    />
                                </div>
                                <div style={optionBlockStyle}>
                                    <Typography.Text
                                        strong
                                        style={{ display: "block", marginBottom: 8 }}
                                    >
                                        Records
                                    </Typography.Text>
                                    {records.length === 0 ? (
                                        <Typography.Text type="secondary">
                                            No loaded records available.
                                        </Typography.Text>
                                    ) : (
                                        <div
                                            style={{
                                                maxHeight: 160,
                                                overflow: "auto",
                                                padding: "8px 10px",
                                                borderRadius: 8,
                                                background: colors.primarybg.value,
                                                border: `1px solid ${colors.secondarybg.value}`,
                                            }}
                                        >
                                            <Checkbox.Group
                                                style={{ display: "flex", flexDirection: "column", gap: 6 }}
                                                value={selectedIds}
                                                onChange={(values) =>
                                                    setSelectedIds(values.map((value) => String(value)))
                                                }
                                                options={records.map((record) => ({
                                                    label: record.label,
                                                    value: record.id,
                                                }))}
                                            />
                                        </div>
                                    )}
                                    {records.length > 1 && (
                                        <Checkbox
                                            style={{ marginTop: 10 }}
                                            checked={mergeBeforeWrite}
                                            onChange={(event) =>
                                                setMergeBeforeWrite(event.target.checked)
                                            }
                                            disabled={selectedIds.length < 2}
                                        >
                                            Merge selected records before writing
                                        </Checkbox>
                                    )}
                                </div>
                                <div
                                    style={{
                                        marginBottom: 20,
                                        padding: "12px 14px",
                                        borderRadius: 8,
                                        background: colors.secondarybg.value,
                                        border: `1px solid ${colors.secondarybg.value}`,
                                    }}
                                >
                                    <Typography.Text
                                        style={{
                                            display: "block",
                                            color: colors.primarytxt.value,
                                            lineHeight: 1.5,
                                        }}
                                    >
                                        {exportSummary}
                                    </Typography.Text>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <Button onClick={handleClose} style={{ marginRight: 8 }}>
                                        Cancel
                                    </Button>
                                    <Button
                                        type="primary"
                                        onClick={() => void startExport()}
                                        disabled={selectedRecords.length === 0}
                                    >
                                        Start export
                                    </Button>
                                </div>
                            </>
                        )}

                        {(isRunning
                            || status === "complete"
                            || status === "canceled"
                            || status === "error") && (
                            <>
                                <div style={{ textAlign: "center", padding: "12px 0 8px" }}>
                                    {status === "complete" ? (
                                        <CheckCircleOutlined
                                            style={{
                                                fontSize: 36,
                                                color: colors.accentbg.value,
                                            }}
                                        />
                                    ) : (
                                        <Spin
                                            indicator={
                                                <LoadingOutlined
                                                    spin
                                                    style={{
                                                        fontSize: 36,
                                                        color: colors.accentbg.value,
                                                    }}
                                                />
                                            }
                                        />
                                    )}
                                </div>

                                {isRunning && phaseLabel && (
                                    <Typography.Text
                                        type="secondary"
                                        style={{
                                            display: "block",
                                            textAlign: "center",
                                            fontSize: 12,
                                            letterSpacing: "0.04em",
                                            textTransform: "uppercase",
                                        }}
                                    >
                                        {phaseLabel}
                                    </Typography.Text>
                                )}

                                <Typography.Text
                                    style={{
                                        display: "block",
                                        marginTop: 12,
                                        textAlign: "center",
                                        color: colors.primarytxt.value,
                                        lineHeight: 1.45,
                                    }}
                                >
                                    {status === "complete"
                                        ? `${format.toUpperCase()} report saved.`
                                        : status === "error"
                                          ? `Export failed: ${errorMessage}`
                                          : status === "canceled"
                                            ? (progress?.message ?? "Export canceled")
                                            : (progress?.message ?? "Starting…")}
                                </Typography.Text>

                                {(isRunning || status === "complete") && (
                                    <Typography.Text
                                        type="secondary"
                                        style={{
                                            display: "block",
                                            marginTop: 8,
                                            fontSize: 12,
                                            lineHeight: 1.45,
                                            textAlign: "center",
                                        }}
                                    >
                                        {exportSummary}
                                    </Typography.Text>
                                )}

                                <div style={{ marginTop: 20, textAlign: "right" }}>
                                    {isRunning ? (
                                        <Button onClick={cancelExport}>Cancel</Button>
                                    ) : (
                                        <>
                                            {status === "error" && (
                                                <Button
                                                    onClick={() => {
                                                        setStatus("idle");
                                                        setProgress(null);
                                                        setErrorMessage(null);
                                                    }}
                                                    style={{ marginRight: 8 }}
                                                >
                                                    Back
                                                </Button>
                                            )}
                                            <Button type="primary" onClick={handleClose}>
                                                Close
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </>
                        )}
                    </Modal>
                )}
            </Theme.Consumer>
        </ConfigProvider>
    );
}
