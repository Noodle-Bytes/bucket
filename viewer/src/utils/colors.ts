/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import Color from "colorjs.io";

/**
 * Convert a hex color to rgba format
 * @param hex - Hex color string (with or without #)
 * @param alpha - Alpha value between 0 and 1 (default: 1)
 * @returns rgba color string
 */
export function hexToRgba(hex: string, alpha: number = 1): string {
    // Remove # if present
    const cleanHex = hex.replace('#', '');

    // Parse RGB values
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Theme colors interface for coverage color calculation
 */
type CoverageThemeColors = {
    positivebg: { value: string };
    negativebg: { value: string };
    desaturatedtxt?: { value: string };
};

export type CompareBucketCategory = "a_only" | "both" | "b_only" | "neither";

const COMPARE_CATEGORY_COLORS: Record<CompareBucketCategory, string> = {
    a_only: "#2563eb",
    both: "#16a34a",
    b_only: "#ea580c",
    neither: "#6b7280",
};

/**
 * Calculate coverage color based on ratio
 * Creates a gradient between 0.2 and 0.6 mix ratios for better visibility
 * so full hit and fully missed are distinguishable
 *
 * @param ratio - Coverage ratio (0-1 for normal, <0 for illegal, >=1 for full, NaN/-0 for ignored)
 * @param colors - Theme colors object with positivebg, negativebg, and optionally desaturatedtxt
 * @param options - Optional configuration
 * @param options.defaultColor - Default color for NaN/-0 cases (defaults to desaturatedtxt or "unset")
 * @returns Color string in the format returned by Color.toString()
 */
export function getCoverageColor(
    ratio: number,
    colors: CoverageThemeColors,
    options?: { defaultColor?: string }
): string {
    const good = new Color(colors.positivebg.value);
    const bad = new Color(colors.negativebg.value);
    const defaultColor = options?.defaultColor ?? colors.desaturatedtxt?.value ?? "unset";

    if (Number.isNaN(ratio) || Object.is(ratio, -0)) {
        return defaultColor;
    } else if (ratio < 0) {
        return bad.toString();
    } else if (ratio === 0) {
        // Unhit buckets should be pure red (bad color)
        return bad.toString();
    } else if (ratio >= 1) {
        return good.toString();
    } else {
        // 0 < ratio < 1: Interpolate between bad and good, leaving some margin
        // Creates a gradient between 0.2 and 0.6 mix ratios for better visibility
        const mix = Color.range(
            Color.mix(bad, good, 0.2, { space: 'hsl' }),
            Color.mix(bad, good, 0.6, { space: 'hsl' }),
            { space: 'hsl' }
        );
        const clamped = Math.min(Math.max(ratio, 0), 1);
        return mix(clamped).toString();
    }
}

export function getCompareCategoryColor(category: CompareBucketCategory): string {
    return COMPARE_CATEGORY_COLORS[category];
}

export function getCompareCategoryBackground(
    category: CompareBucketCategory,
    active: boolean,
): string {
    const alpha = active ? 0.35 : 0.12;
    return hexToRgba(getCompareCategoryColor(category), alpha);
}

export function getCompareCategoryLabel(category: CompareBucketCategory): string {
    switch (category) {
        case "a_only":
            return "A only";
        case "both":
            return "Both";
        case "b_only":
            return "B only";
        case "neither":
            return "Neither";
        default:
            return category;
    }
}
