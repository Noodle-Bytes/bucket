/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import type React from "react";
import type { ThemeConfig } from "antd";
import { Modal } from "antd";
import type { ModalFuncProps } from "antd/es/modal/interface";
import { buildBucketAntModalTheme } from "@/utils/bucketAntModalTheme";
import { getThemePreference } from "@/utils/themePreference";

type StaticModalConfig = ModalFuncProps & { theme?: ThemeConfig };

function ensureReadableNode(node: React.ReactNode, color: string): React.ReactNode {
    if (typeof node === "string" || typeof node === "number") {
        return (
            <span style={{ color, fontSize: 14, lineHeight: 1.5 }}>
                {node}
            </span>
        );
    }
    return node;
}

function withStaticModalTheme(config: StaticModalConfig): StaticModalConfig {
    const pref = getThemePreference();
    const cl = pref.theme.colors;
    const panel = cl.tertiarybg.value;
    const border = cl.secondarybg.value;
    const txt = cl.primarytxt.value;
    const antTheme = buildBucketAntModalTheme(pref);

    const resolved: StaticModalConfig = {
        theme: antTheme,
        rootClassName: pref.theme.className,
        ...config,
        title: ensureReadableNode(config.title, txt),
        content: ensureReadableNode(config.content, txt),
        styles: {
            mask: { backgroundColor: "rgba(0, 0, 0, 0.55)" },
            content: {
                padding: 0,
                border: `1px solid ${border}`,
                backgroundColor: panel,
                borderRadius: 12,
                overflow: "hidden",
            },
            body: {
                padding: "16px 22px",
                backgroundColor: panel,
                color: txt,
            },
            ...config.styles,
        },
    };
    return resolved;
}

export function confirmThemed(config: StaticModalConfig) {
    return Modal.confirm(withStaticModalTheme(config));
}

export function infoThemed(config: StaticModalConfig) {
    return Modal.info(withStaticModalTheme(config));
}
