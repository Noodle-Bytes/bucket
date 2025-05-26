
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved
 */

/**
 * Splits strings into alpha and numeric portions before comparison
 * and tries to treat the numeric portions as numbers.
 * @returns negative if a < b, positive if a > b, zero if a == b
 */
export function natCompare(a: String | Number, b: String | Number): number {
    const num_regex = /(\d+\.?\d*)/g
    const aParts = a.toString().split(num_regex);
    const bParts = b.toString().split(num_regex);
    while (true) {
        const aPart = aParts.shift();
        const bPart = bParts.shift();

        if (aPart === undefined || bPart === undefined) {
            if (aPart !== undefined) {
                return 1;
            }
            if (bPart !== undefined) {
                return -1;
            }
            return 0;
        }

        const numComparison = Number.parseInt(aPart) - Number.parseInt(bPart);
        if (!Number.isNaN(numComparison) && numComparison != 0) {
            return numComparison;
        }
        const strComparison = aPart.localeCompare(bPart);
        if (strComparison != 0) {
            return strComparison;
        }
    }
}

/**
 * Numeric comparison that takes an opinionated stance on NaN and -0/+0 for
 * consistency.
 * NaN is considered less than any number, and -0 is considered less than +0.
 * @returns negative if a < b, positive if a > b, zero if a == b
 */
export function numCompare(a: number, b: number): number {
    const rel = a - b;
    if (Number.isFinite(rel) && (a !== 0 || b !== 0)) {
        return rel;
    }

    const aIsNaN = Number.isNaN(a);
    const bIsNaN = Number.isNaN(b);

    if (aIsNaN && bIsNaN) {
        return 0;
    } else if (aIsNaN) {
        return -1;
    } else if (bIsNaN) {
        return 1;
    }

    const aIsNeg0 = Object.is(a, -0);
    const bIsNeg0 = Object.is(b, -0);

    console.log("Comparing -0 and 0", a, b, aIsNeg0, bIsNeg0);
    if (aIsNeg0 && bIsNeg0) {
        return 0;
    } else if (aIsNeg0) {
        return -1;
    } else if (bIsNeg0) {
        return 1;
    }
    return 0;
}
