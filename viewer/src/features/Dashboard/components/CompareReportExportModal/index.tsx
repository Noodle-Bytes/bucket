/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { CheckCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import { Button, ConfigProvider, Modal, Segmented, Spin, Typography } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import Theme from "@/providers/Theme";
import { buildBucketAntModalTheme } from "@/utils/bucketAntModalTheme";
import { getThemePreference } from "@/utils/themePreference";
import {
    buildCompareExportSummary,
    exportCompareReportAsync,
    type CompareReportExportPhase,
    type CompareReportExportProgress,
} from "@/services/coverageCompareReport";
import type {
    ComparePatternDetailLevel,
    ComparePatternSideFilter,
} from "@/services/coverageComparePatterns";
import type { ComparisonResult, CoverageDefinition } from "@/types/coverageCompare";

export type CompareReportExportModalProps = {
    open: boolean;
    comparison: ComparisonResult | null;
    onClose: () => void;
    onExportingChange?: (exporting: boolean) => void;
};

type ExportStatus = "idle" | "running" | "complete" | "canceled" | "error";

const PATTERN_SCOPE_OPTIONS: Array<{ value: ComparePatternDetailLevel; label: string }> = [
    { value: "fast", label: "Largest only" },
    { value: "medium", label: "Balanced" },
    { value: "detailed", label: "All mismatches" },
];

const PHASE_LABELS: Record<CompareReportExportPhase, string> = {
    buckets: "Preparing buckets",
    patterns: "Detecting patterns",
    serialize: "Building report",
    save: "Saving file",
};

export default function CompareReportExportModal({
    open,
    comparison,
    onClose,
    onExportingChange,
}: CompareReportExportModalProps) {
    const pref = getThemePreference();
    const colors = pref.theme.colors;
    const abortRef = useRef<AbortController | null>(null);

    const [format, setFormat] = useState<"json" | "html">("html");
    const [patternDetail, setPatternDetail] = useState<ComparePatternDetailLevel>("medium");
    const [sideFilter, setSideFilter] = useState<ComparePatternSideFilter>("both");
    const [definition, setDefinition] = useState<CoverageDefinition>(
        comparison?.definition ?? "any_hit",
    );
    const [status, setStatus] = useState<ExportStatus>("idle");
    const [progress, setProgress] = useState<CompareReportExportProgress | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const sideFilterOptions = useMemo(
        () => [
            { value: "both" as const, label: "Both directions" },
            { value: "a_only" as const, label: "A only" },
            { value: "b_only" as const, label: "B only" },
        ],
        [],
    );

    const exportSummary = useMemo(
        () =>
            buildCompareExportSummary({
                format,
                patternDetail,
                sideFilter,
                definition,
            }),
        [format, patternDetail, sideFilter, definition],
    );

    useEffect(() => {
        if (open) {
            setDefinition(comparison?.definition ?? "any_hit");
            return;
        }
        abortRef.current?.abort();
        abortRef.current = null;
        setStatus("idle");
        setProgress(null);
        setErrorMessage(null);
        onExportingChange?.(false);
    }, [open, comparison, onExportingChange]);

    const isRunning = status === "running";
    const phaseLabel = progress ? PHASE_LABELS[progress.phase] : null;

    async function startExport() {
        if (!comparison || isRunning) {
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
            await exportCompareReportAsync(comparison, format, {
                signal: controller.signal,
                patternDetail,
                sideFilter,
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
                  ? "Generating compare report"
                  : "Export compare report";

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
                                        Coverage direction
                                    </Typography.Text>
                                    <Segmented
                                        block
                                        value={sideFilter}
                                        onChange={(value) =>
                                            setSideFilter(value as ComparePatternSideFilter)
                                        }
                                        options={sideFilterOptions}
                                    />
                                </div>
                                <div style={optionBlockStyle}>
                                    <Typography.Text
                                        strong
                                        style={{ display: "block", marginBottom: 8 }}
                                    >
                                        Pattern scope
                                    </Typography.Text>
                                    <Segmented
                                        block
                                        value={patternDetail}
                                        onChange={(value) =>
                                            setPatternDetail(value as ComparePatternDetailLevel)
                                        }
                                        options={PATTERN_SCOPE_OPTIONS}
                                    />
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
                                        disabled={!comparison}
                                    >
                                        Start export
                                    </Button>
                                </div>
                            </>
                        )}

                        {(isRunning || status === "complete" || status === "canceled" || status === "error") && (
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
