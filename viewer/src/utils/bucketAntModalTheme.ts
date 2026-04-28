/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import type { ThemeConfig } from "antd";
import type { Theme as BucketTheme } from "@/theme";

/**
 * Ant Design theme overrides for dialogs that render in a portal (outside the Stitches
 * wrapper), so they match the active Bucket light/dark/odd palette.
 */
export function buildBucketAntModalTheme(pref: BucketTheme): ThemeConfig {
    const cl = pref.theme.colors;
    const panel = cl.tertiarybg.value;
    const border = cl.secondarybg.value;
    const txt = cl.primarytxt.value;
    const primaryBg = cl.primarybg.value;
    const muted = cl.desaturatedtxt.value;
    const secondaryBg = cl.secondarybg.value;
    const highlightBg = cl.highlightbg.value;
    const isDarkUi = pref.name === "dark" || pref.name.startsWith("auto (dark)");
    // Slightly brighter than secondarybg so outlines (checkboxes, inputs) read in dark mode
    const uiBorder = isDarkUi ? "rgba(255, 255, 255, 0.28)" : border;

    return {
        token: {
            // Standard Ant primary blue: readable white-on-blue; matches header actions like Load
            colorPrimary: "#1677ff",
            // Drop the default “outline” shadow under primary/default buttons on dark modal chrome
            controlOutline: "rgba(22, 119, 255, 0)",
            controlTmpOutline: "rgba(0, 0, 0, 0)",
            colorText: txt,
            colorTextHeading: txt,
            colorTextSecondary: muted,
            colorTextDescription: muted,
            colorBgElevated: panel,
            colorBorder: uiBorder,
            // Align split-line color with page background so list/table row rules do not read as gray stripes
            colorSplit: primaryBg,
            colorBgContainer: primaryBg,
            fontSize: 14,
            colorTextDisabled: isDarkUi ? "rgba(255, 255, 255, 0.55)" : "rgba(0, 0, 0, 0.38)",
            colorBgContainerDisabled: isDarkUi ? secondaryBg : highlightBg,
            // Select suffix, modal close, and other icons: default token is too dim on dark panels
            colorIcon: isDarkUi ? "rgba(255, 255, 255, 0.78)" : muted,
            ...(isDarkUi
                ? { colorTextQuaternary: "rgba(255, 255, 255, 0.55)" }
                : {}),
        },
        components: {
            Modal: {
                contentBg: panel,
                headerBg: panel,
                footerBg: panel,
                titleColor: txt,
                titleFontSize: 16,
                titleLineHeight: 1.4,
            },
            Button: {
                // Default / outline buttons: sit off tertiary modal chrome (footer) so they stay visible
                defaultBg: primaryBg,
                defaultColor: txt,
                defaultBorderColor: uiBorder,
                defaultHoverBg: highlightBg,
                defaultHoverColor: txt,
                defaultHoverBorderColor: isDarkUi ? "rgba(255, 255, 255, 0.42)" : cl.lowlightbg.value,
                defaultActiveBg: secondaryBg,
                defaultActiveColor: txt,
                defaultActiveBorderColor: uiBorder,
                borderColorDisabled: uiBorder,
                fontWeight: 500,
                primaryShadow: "none",
                defaultShadow: "none",
                dangerShadow: "none",
            },
            Input: {
                borderRadius: 6,
                colorBorder: uiBorder,
                colorBgContainer: primaryBg,
                colorText: txt,
                colorTextPlaceholder: muted,
            },
            Select: {
                colorBgContainer: primaryBg,
                colorBorder: uiBorder,
                colorText: txt,
                colorTextDescription: isDarkUi ? "rgba(255, 255, 255, 0.65)" : muted,
                optionSelectedBg: cl.highlightbg.value,
            },
            Checkbox: {
                colorText: txt,
                colorBgContainer: primaryBg,
            },
            Switch: {
                colorText: txt,
            },
            Table: {
                headerBg: panel,
                colorBgContainer: primaryBg,
                // Hide row/cell rules (rc-table still uses borderBottom with this color)
                borderColor: "transparent",
                colorText: txt,
                rowHoverBg: secondaryBg,
                headerColor: txt,
                // Remove vertical hairline between header cells
                headerSplitColor: "transparent",
                cellPaddingBlockMD: 10,
                cellPaddingInlineMD: 12,
            },
        },
    };
}
