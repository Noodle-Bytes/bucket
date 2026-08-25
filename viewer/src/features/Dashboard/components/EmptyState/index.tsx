/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { Button, Typography } from "antd";
import { FolderOpenOutlined, LockOutlined } from "@ant-design/icons";
import Theme from "@/providers/Theme";

declare const __APP_VERSION__: string;

export type EmptyStateProps = {
    logoSrc: string;
    onOpenFile?: () => void | Promise<void>;
    isDragging?: boolean;
};

/**
 * Empty state component displayed when no coverage data is loaded
 */
export default function EmptyState({ logoSrc, onOpenFile, isDragging = false }: EmptyStateProps) {
    return (
        <Theme.Consumer>
            {({ theme }) => {
                const primaryTextColor = theme.theme.colors.primarytxt.value;
                const secondaryTextColor = theme.theme.colors.desaturatedtxt.value;
                const accent = theme.theme.colors.accentbg.value;
                const panel = theme.theme.colors.tertiarybg.value;
                const border = theme.theme.colors.secondarybg.value;
                const dropBorder = isDragging ? accent : border;
                const dropBg = isDragging
                    ? theme.theme.colors.highlightbg.value
                    : panel;

                return (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '100%',
                        padding: '48px 24px',
                        position: 'relative',
                    }}>
                        <div
                            style={{
                                width: 'min(440px, 100%)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                padding: '40px 32px 36px',
                                borderRadius: 12,
                                border: `2px dashed ${dropBorder}`,
                                backgroundColor: dropBg,
                                transition: 'border-color 0.2s ease, background-color 0.2s ease',
                            }}
                        >
                            <img
                                src={logoSrc}
                                alt="Bucket Logo"
                                style={{
                                    width: '96px',
                                    height: '96px',
                                    marginBottom: '28px',
                                    display: 'block'
                                }}
                            />
                            <Typography.Title
                                level={2}
                                style={{
                                    marginTop: 0,
                                    marginBottom: '12px',
                                    color: primaryTextColor,
                                    fontWeight: 600,
                                    fontSize: 22,
                                }}
                            >
                                No Coverage Loaded
                            </Typography.Title>
                            <Typography.Paragraph
                                style={{
                                    marginBottom: '28px',
                                    color: secondaryTextColor,
                                    fontSize: '15px',
                                    textAlign: 'center',
                                    maxWidth: 320,
                                }}
                            >
                                Load a coverage archive (.bktgz) to view coverage data.
                            </Typography.Paragraph>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' }}>
                                {onOpenFile ? (
                                    <>
                                        <Button
                                            type="primary"
                                            icon={<FolderOpenOutlined />}
                                            size="large"
                                            onClick={onOpenFile}
                                        >
                                            Open File...
                                        </Button>
                                        <Typography.Text style={{ fontSize: '13px', color: secondaryTextColor }}>
                                            Or drag and drop a `.bktgz` file here
                                        </Typography.Text>
                                    </>
                                ) : (
                                    <Typography.Text style={{ color: secondaryTextColor, fontSize: '14px' }}>
                                        Drag and drop a `.bktgz` file here
                                    </Typography.Text>
                                )}
                            </div>
                        </div>
                        <Typography.Text
                            style={{
                                marginTop: '28px',
                                fontSize: '13px',
                                color: secondaryTextColor,
                                textAlign: 'center',
                                maxWidth: '560px',
                            }}
                        >
                            <LockOutlined style={{ marginRight: 6 }} />
                            Coverage files are processed locally (nothing is
                            uploaded).
                        </Typography.Text>
                        <Typography.Text
                            style={{
                                position: 'absolute',
                                bottom: 16,
                                left: 0,
                                right: 0,
                                textAlign: 'center',
                                fontSize: 11,
                                color: primaryTextColor,
                            }}
                        >
                            v{__APP_VERSION__}
                        </Typography.Text>
                    </div>
                );
            }}
        </Theme.Consumer>
    );
}
