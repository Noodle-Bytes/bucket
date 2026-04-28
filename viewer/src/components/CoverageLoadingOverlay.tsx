/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { LoadingOutlined } from "@ant-design/icons";
import { Progress, Spin, Typography } from "antd";
import Theme from "@/providers/Theme";
import type { LoadingProgress } from "@/hooks/useFileLoader";

type CoverageLoadingOverlayProps = {
    open: boolean;
    loadingProgress: LoadingProgress | null;
};

/** Bar fill while reading archives (never rounds up to 100% until every file has finished reading). */
function archiveReadPercent(completed: number, total: number): number {
    if (total <= 0) {
        return 0;
    }
    if (completed >= total) {
        return 100;
    }
    return Math.min(99, Math.floor((completed / total) * 100));
}

/**
 * Full-screen loading UI aligned with Bucket viewer themes (not the default Ant Spin tip).
 */
export function CoverageLoadingOverlay({ open, loadingProgress }: CoverageLoadingOverlayProps) {
    if (!open) {
        return null;
    }

    return (
        <Theme.Consumer>
            {({ theme }) => {
                const accent = theme.theme.colors.accentbg.value;
                const primaryBg = theme.theme.colors.primarybg.value;
                const panel = theme.theme.colors.tertiarybg.value;
                const border = theme.theme.colors.secondarybg.value;
                const titleColor = theme.theme.colors.primarytxt.value;
                const muted = theme.theme.colors.desaturatedtxt.value;
                const hasCounts = loadingProgress !== null && loadingProgress.total > 0;
                const isApplying = loadingProgress?.phase === "applying";
                const pct =
                    hasCounts && !isApplying
                        ? archiveReadPercent(
                              loadingProgress!.completed,
                              loadingProgress!.total,
                          )
                        : null;

                return (
                    <div
                        role={hasCounts && !isApplying ? "progressbar" : "status"}
                        aria-live="polite"
                        aria-busy="true"
                        aria-valuenow={pct !== null ? pct : undefined}
                        aria-valuemin={pct !== null ? 0 : undefined}
                        aria-valuemax={pct !== null ? 100 : undefined}
                        aria-valuetext={
                            hasCounts
                                ? isApplying
                                    ? "Applying to viewer"
                                    : `${loadingProgress!.completed} of ${loadingProgress!.total} archives read`
                                : "Loading"
                        }
                        style={{
                            position: "fixed",
                            inset: 0,
                            zIndex: 10000,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: primaryBg,
                            padding: 24,
                        }}>
                        <div
                            style={{
                                width: "min(420px, 100%)",
                                padding: "28px 32px 26px",
                                borderRadius: 20,
                                backgroundColor: panel,
                                border: `1px solid ${border}`,
                                boxShadow: `0 16px 48px rgba(0, 0, 0, 0.08)`,
                            }}>
                            <Typography.Title
                                level={4}
                                style={{
                                    marginTop: 0,
                                    marginBottom: 20,
                                    color: titleColor,
                                    fontWeight: 600,
                                    textAlign: "center",
                                }}>
                                {isApplying ? "Finishing up" : "Loading coverage"}
                            </Typography.Title>

                            {hasCounts ? (
                                isApplying ? (
                                    <>
                                        <div
                                            style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                gap: 18,
                                                padding: "8px 0 4px",
                                            }}>
                                            <Spin
                                                size="large"
                                                indicator={
                                                    <LoadingOutlined
                                                        spin
                                                        style={{ fontSize: 36, color: accent }}
                                                    />
                                                }
                                            />
                                        </div>
                                        <Typography.Text
                                            style={{
                                                display: "block",
                                                fontSize: 15,
                                                lineHeight: 1.5,
                                                color: titleColor,
                                                textAlign: "center",
                                            }}>
                                            {loadingProgress!.applyingKind === "merge"
                                                ? "Merging coverage from all archives into a single record."
                                                : `Preparing ${loadingProgress!.total} archives in the viewer (records, tree, and views).`}
                                        </Typography.Text>
                                        <Typography.Text
                                            style={{
                                                display: "block",
                                                marginTop: 12,
                                                fontSize: 13,
                                                lineHeight: 1.45,
                                                color: muted,
                                                textAlign: "center",
                                            }}>
                                            Archive decoding is finished. This step can take a while
                                            for very large batches and uses more memory the more
                                            archives you load at once.
                                        </Typography.Text>
                                    </>
                                ) : (
                                    <>
                                        <Progress
                                            percent={pct ?? 0}
                                            showInfo={false}
                                            strokeColor={accent}
                                            trailColor={border}
                                            strokeLinecap="round"
                                            style={{ marginBottom: 4 }}
                                        />
                                        <Typography.Text
                                            style={{
                                                display: "block",
                                                marginTop: 14,
                                                fontSize: 17,
                                                fontWeight: 500,
                                                color: titleColor,
                                                textAlign: "center",
                                            }}>
                                            {loadingProgress!.completed} / {loadingProgress!.total}{" "}
                                            archives read
                                        </Typography.Text>
                                        <Typography.Text
                                            style={{
                                                display: "block",
                                                marginTop: 10,
                                                fontSize: 14,
                                                lineHeight: 1.45,
                                                color: muted,
                                                textAlign: "center",
                                            }}>
                                            The bar tracks decoded archives. After the last one, the
                                            viewer runs a final preparation step before the UI is
                                            ready.
                                        </Typography.Text>
                                    </>
                                )
                            ) : (
                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: 16,
                                    }}>
                                    <Spin
                                        size="large"
                                        indicator={
                                            <LoadingOutlined
                                                spin
                                                style={{ fontSize: 36, color: accent }}
                                            />
                                        }
                                    />
                                    <Typography.Text
                                        style={{
                                            fontSize: 15,
                                            color: muted,
                                            textAlign: "center",
                                        }}>
                                        Updating loaded records…
                                    </Typography.Text>
                                </div>
                            )}
                        </div>
                    </div>
                );
            }}
        </Theme.Consumer>
    );
}
