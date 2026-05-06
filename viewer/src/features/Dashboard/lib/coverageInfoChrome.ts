/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import Color from "colorjs.io";
import type { CSSProperties } from "react";

/**
 * Theme colors shared by Coverage Info, donut center, and coverpoint Details.
 * Surfaces are tinted from **primarybg** (layout body) so blocks read as part of
 * the canvas, not separate cards.
 */
export type CoverageInfoChromeColors = {
    accentbg: { value: string };
    primarybg: { value: string };
    secondarybg: { value: string };
    saturatedtxt: { value: string };
    primarytxt: { value: string };
};

/** Shared rounding — Collapse headers / outer boxes */
export const COVERAGE_INFO_SURFACE_RADIUS = 2;

function mixBaseAccent(baseHex: string, accentHex: string, accentRatio: number): string {
    const base = new Color(baseHex);
    const tint = new Color(accentHex);
    return Color.mix(base, tint, accentRatio, { space: "srgb" }).toString({ format: "hex" });
}

/** Same plane as Layout body — very light accent wash only */
export function coverageInfoCardSurface(colors: CoverageInfoChromeColors): string {
    return mixBaseAccent(colors.primarybg.value, colors.accentbg.value, 0.065);
}

/** Header strip — slightly stronger tint; still tied to primary canvas */
export function coverageInfoCardHeaderSurface(colors: CoverageInfoChromeColors): string {
    return mixBaseAccent(colors.primarybg.value, colors.accentbg.value, 0.095);
}

/** Divider/border: structural neutrals (matches inputs, layout chrome), not accent frames */
function coverageInfoStructuralBorder(colors: CoverageInfoChromeColors): string {
    return colors.secondarybg.value;
}

/**
 * Outer shell + CSS vars for `.point-metadata-collapse` — **Coverage Info** and
 * **coverpoint Details** must both use this so layout matches (full width, no extra margins).
 */
export function coverageInfoChromeOuterBox(colors: CoverageInfoChromeColors): CSSProperties {
    return {
        margin: 0,
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        border: `1px solid ${coverageInfoStructuralBorder(colors)}`,
        borderRadius: COVERAGE_INFO_SURFACE_RADIUS,
        backgroundColor: coverageInfoCardSurface(colors),
        overflow: "hidden",
        "--point-metadata-header-bg": coverageInfoCardHeaderSurface(colors),
        "--point-metadata-header-text": colors.saturatedtxt.value,
        "--point-metadata-header-subtext": colors.primarytxt.value,
    } as CSSProperties;
}

/**
 * Donut hub — fill matches panel tint; stroke matches ring separators (secondarybg)
 * so it sits inside the chart rather than floating above it.
 */
export function coverageInfoDonutCenterCircleAttrs(colors: CoverageInfoChromeColors): {
    fill: string;
    stroke: string;
    strokeWidth: number;
} {
    return {
        fill: coverageInfoCardSurface(colors),
        stroke: colors.secondarybg.value,
        strokeWidth: 1.25,
    };
}
