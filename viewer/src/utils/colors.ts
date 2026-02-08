/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

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
