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
};

/**
 * Empty state component displayed when no coverage data is loaded
 */
export default function EmptyState({ logoSrc, onOpenFile }: EmptyStateProps) {
    return (
        <Theme.Consumer>
            {({ theme }) => {
                const primaryTextColor = theme.theme.colors.primarytxt.value;
                const secondaryTextColor = theme.theme.colors.desaturatedtxt.value;

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
                        <img
                            src={logoSrc}
                            alt="Bucket Logo"
                            style={{
                                width: '128px',
                                height: '128px',
                                marginBottom: '32px',
                                display: 'block'
                            }}
                        />
                        <Typography.Title
                            level={2}
                            style={{
                                marginTop: 0,
                                marginBottom: '16px',
                                color: primaryTextColor,
                                fontWeight: 600
                            }}
                        >
                            No Coverage Loaded
                        </Typography.Title>
                        <Typography.Paragraph
                            style={{
                                marginBottom: '32px',
                                color: secondaryTextColor,
                                fontSize: '16px',
                                textAlign: 'center',
                            }}
                        >
                            Load a coverage archive (.bktgz) to view coverage data.
                        </Typography.Paragraph>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
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
                                    <Typography.Text style={{ fontSize: '14px', color: secondaryTextColor }}>
                                        Or drag and drop a `.bktgz` file here
                                    </Typography.Text>
                                </>
                            ) : (
                                <Typography.Text style={{ color: secondaryTextColor, fontSize: '14px' }}>
                                    Drag and drop a `.bktgz` file here
                                </Typography.Text>
                            )}
                        </div>
                        <Typography.Text
                            style={{
                                marginTop: '40px',
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
