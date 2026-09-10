/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

/**
 * Sidecar waiver file schema (JSON). Matches Python bucket.waiver.Waiver /
 * WaiverFile. Archives do not embed waivers; this file is loaded separately.
 */

export type WaiverAxes = Record<string, string | string[]>;

export type WaiverSpec = {
    point: string;
    axes: WaiverAxes;
    reason: string;
    author: string;
    disabled: boolean;
};

export type WaiverFileSpec = {
    waivers: WaiverSpec[];
};

export class WaiverSpecError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "WaiverSpecError";
    }
}

function normaliseText(value: unknown): string {
    return String(value ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .join(" ");
}

function parseAxes(raw: unknown): WaiverAxes {
    if (raw === undefined || raw === null) {
        return {};
    }
    if (typeof raw !== "object" || Array.isArray(raw)) {
        throw new WaiverSpecError("waiver axes must be an object");
    }
    const axes: WaiverAxes = {};
    for (const [axis, patterns] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof patterns === "string") {
            if (!patterns) {
                throw new WaiverSpecError(`axis ${JSON.stringify(axis)} has an empty pattern`);
            }
            axes[axis] = patterns;
            continue;
        }
        if (Array.isArray(patterns)) {
            if (patterns.length === 0) {
                throw new WaiverSpecError(`axis ${JSON.stringify(axis)} has no patterns`);
            }
            if (!patterns.every((pattern) => typeof pattern === "string" && pattern.length > 0)) {
                throw new WaiverSpecError(
                    `axis ${JSON.stringify(axis)} patterns must be non-empty strings`,
                );
            }
            axes[axis] = patterns as string[];
            continue;
        }
        throw new WaiverSpecError(
            `axis ${JSON.stringify(axis)} must be a string or list of strings`,
        );
    }
    return axes;
}

export function parseWaiverSpec(raw: unknown): WaiverSpec {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new WaiverSpecError("each waiver must be an object");
    }
    const row = raw as Record<string, unknown>;
    const point = normaliseText(row.point);
    if (!point) {
        throw new WaiverSpecError("waiver point must not be empty");
    }
    const reason = normaliseText(row.reason);
    if (!reason) {
        throw new WaiverSpecError("waiver reason must not be empty");
    }
    return {
        point,
        axes: parseAxes(row.axes),
        reason,
        author: normaliseText(row.author),
        disabled: Boolean(row.disabled),
    };
}

export function parseWaiverFile(raw: unknown): WaiverFileSpec {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new WaiverSpecError("waiver file must be a JSON object");
    }
    const body = raw as Record<string, unknown>;
    // Coverage JSON has definitions/records — reject that shape clearly.
    if ("definitions" in body || "records" in body) {
        throw new WaiverSpecError(
            "this looks like a coverage JSON file, not a waivers.json sidecar",
        );
    }
    if (!Array.isArray(body.waivers)) {
        throw new WaiverSpecError('waiver file must contain a "waivers" array');
    }
    return {
        waivers: body.waivers.map((entry, index) => {
            try {
                return parseWaiverSpec(entry);
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                throw new WaiverSpecError(`waivers[${index}]: ${detail}`);
            }
        }),
    };
}

export function parseWaiverFileText(text: string): WaiverFileSpec {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        throw new WaiverSpecError("waiver file is not valid JSON");
    }
    return parseWaiverFile(raw);
}

export function emptyWaiverFile(): WaiverFileSpec {
    return { waivers: [] };
}

export function serializeWaiverFile(
    file: WaiverFileSpec,
    options: { includeDisabled?: boolean } = {},
): string {
    const includeDisabled = options.includeDisabled ?? true;
    const waivers = file.waivers
        .filter((waiver) => includeDisabled || !waiver.disabled)
        .map((waiver) => {
            const row: Record<string, unknown> = {
                point: waiver.point,
                reason: waiver.reason,
            };
            if (Object.keys(waiver.axes).length > 0) {
                row.axes = waiver.axes;
            }
            if (waiver.author) {
                row.author = waiver.author;
            }
            if (waiver.disabled) {
                row.disabled = true;
            }
            return row;
        });
    return `${JSON.stringify({ waivers }, null, 2)}\n`;
}

export function axisPatterns(waiver: WaiverSpec): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [axis, patterns] of Object.entries(waiver.axes)) {
        result[axis] = (typeof patterns === "string" ? [patterns] : patterns).map((pattern) =>
            pattern.toLowerCase(),
        );
    }
    return result;
}

/** Expand waiver axes to a multi-value filter map (preserves original casing). */
export function waiverAxesToFilters(axes: WaiverAxes): Record<string, string[]> {
    const filters: Record<string, string[]> = {};
    for (const [axis, patterns] of Object.entries(axes)) {
        filters[axis] = typeof patterns === "string" ? [patterns] : [...patterns];
    }
    return filters;
}

/** Compact a filter map back to waiver axes (single value stays a string). */
export function filtersToWaiverAxes(filters: Record<string, string[]>): WaiverAxes {
    const axes: WaiverAxes = {};
    for (const [axis, values] of Object.entries(filters)) {
        if (values.length === 0) {
            continue;
        }
        axes[axis] = values.length === 1 ? values[0] : [...values];
    }
    return axes;
}

/** Human-readable axes, e.g. `hazard_type=RAW ∧ stall_cycles∈{0, 2}`. */
export function formatWaiverAxesSummary(axes: WaiverAxes): string {
    const entries = waiverAxesEntries(axes);
    if (entries.length === 0) {
        return "all axes";
    }
    return entries
        .map(({ axis, values }) =>
            values.length === 1
                ? `${axis}=${values[0]}`
                : `${axis}∈{${values.join(", ")}}`,
        )
        .join(" ∧ ");
}

/** One entry per axis for scannable multi-line display. */
export function waiverAxesEntries(
    axes: WaiverAxes,
): Array<{ axis: string; values: string[] }> {
    return Object.entries(axes).map(([axis, patterns]) => ({
        axis,
        values: typeof patterns === "string" ? [patterns] : [...patterns],
    }));
}
