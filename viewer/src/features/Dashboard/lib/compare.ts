
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
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

    if (aIsNeg0 && bIsNeg0) {
        return 0;
    } else if (aIsNeg0) {
        return -1;
    } else if (bIsNeg0) {
        return 1;
    }
    return 0;
}

type AxisSortKind = "number" | "range" | "text";

export type AxisSortMeta = {
    sort_kind?: string | null;
    sort_low?: number | null;
    sort_high?: number | null;
};

type AxisSortKey = {
    kindOrder: number;
    low: number;
    high: number;
    text: string;
};

function axisSortKindOrder(kind: AxisSortKind): number {
    switch (kind) {
        case "number":
            return 0;
        case "range":
            return 1;
        default:
            return 2;
    }
}

function parseAxisSortKey(value: string, meta?: AxisSortMeta): AxisSortKey {
    if (meta?.sort_kind === "number" && meta.sort_low !== null && meta.sort_low !== undefined) {
        return {
            kindOrder: axisSortKindOrder("number"),
            low: meta.sort_low,
            high: meta.sort_low,
            text: value,
        };
    }

    if (
        meta?.sort_kind === "range"
        && meta.sort_low !== null
        && meta.sort_low !== undefined
        && meta.sort_high !== null
        && meta.sort_high !== undefined
    ) {
        return {
            kindOrder: axisSortKindOrder("range"),
            low: meta.sort_low,
            high: meta.sort_high,
            text: value,
        };
    }

    const numericMatch = value.trim().match(/^[-+]?\d+(\.\d+)?$/);
    if (numericMatch) {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) {
            return {
                kindOrder: axisSortKindOrder("number"),
                low: parsed,
                high: parsed,
                text: value,
            };
        }
    }

    const rangeMatch = value.match(/^\s*([-+]?\d+)\s*->\s*([-+]?\d+)\s*$/);
    if (rangeMatch) {
        const low = Math.min(Number(rangeMatch[1]), Number(rangeMatch[2]));
        const high = Math.max(Number(rangeMatch[1]), Number(rangeMatch[2]));
        return {
            kindOrder: axisSortKindOrder("range"),
            low,
            high,
            text: value,
        };
    }

    return {
        kindOrder: axisSortKindOrder("text"),
        low: 0,
        high: 0,
        text: value,
    };
}

export function axisValueCompare(
    a: String | Number,
    b: String | Number,
    aMeta?: AxisSortMeta,
    bMeta?: AxisSortMeta,
): number {
    const aText = a.toString();
    const bText = b.toString();
    const aKey = parseAxisSortKey(aText, aMeta);
    const bKey = parseAxisSortKey(bText, bMeta);

    if (aKey.kindOrder !== bKey.kindOrder) {
        return aKey.kindOrder - bKey.kindOrder;
    }

    const lowCmp = numCompare(aKey.low, bKey.low);
    if (lowCmp !== 0) {
        return lowCmp;
    }

    const highCmp = numCompare(aKey.high, bKey.high);
    if (highCmp !== 0) {
        return highCmp;
    }

    return natCompare(aKey.text, bKey.text);
}
