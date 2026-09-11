/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

/**
 * Match a sidecar waiver file against a readout (port of bucket.waiver.match_waivers)
 * with per-rule diagnostics so a dirty apply does not abort sibling rules.
 */

import {
    axisPatterns,
    type WaiverFileSpec,
    type WaiverSpec,
} from "@/services/waiverSpec";
import {
    InMemoryReadout,
    buildMergedPointHits,
    materializeReadout,
} from "@/services/readoutUtils";

export type WaiverRuleStatus =
    | "applied"
    | "disabled"
    | "no_match"
    /** Would match buckets, but earlier rules in file order already waived them all. */
    | "covered"
    | "bad_axis"
    | "parse_error";

export type WaiverRuleDiagnostic = {
    index: number;
    rule: WaiverSpec;
    status: WaiverRuleStatus;
    matchCount: number;
    matchedBucketStarts: number[];
    coverpointPaths: string[];
    /** Earlier rule indexes that already waived this rule's matching buckets. */
    coveredByIndexes?: number[];
    message?: string;
};

export type WaiverApplyReport = {
    matched: BucketWaiverTuple[];
    diagnostics: WaiverRuleDiagnostic[];
    waivedWithHits: number;
};

export function isWaiverProblemStatus(status: WaiverRuleStatus): boolean {
    return (
        status === "no_match"
        || status === "covered"
        || status === "bad_axis"
        || status === "parse_error"
    );
}

function escapeRegexLiteral(value: string): string {
    return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

/** Case-sensitive fnmatch for already-lowercased strings (`*` / `?` / `[abc]`). */
export function fnmatchCase(name: string, pattern: string): boolean {
    let regex = "";
    for (let i = 0; i < pattern.length; i += 1) {
        const char = pattern[i];
        if (char === "*") {
            regex += ".*";
            continue;
        }
        if (char === "?") {
            regex += ".";
            continue;
        }
        if (char === "[") {
            const end = pattern.indexOf("]", i + 1);
            if (end === -1) {
                regex += "\\[";
                continue;
            }
            let body = pattern.slice(i + 1, end);
            let negated = false;
            if (body.startsWith("!")) {
                negated = true;
                body = body.slice(1);
            }
            regex += `[${negated ? "^" : ""}${body.replace(/\\/g, "\\\\")}]`;
            i = end;
            continue;
        }
        regex += escapeRegexLiteral(char);
    }
    return new RegExp(`^${regex}$`).test(name);
}

export function matchesPointPath(path: string, pattern: string): boolean {
    const normalised = pattern.toLowerCase();
    const parts = path.toLowerCase().split(".");
    for (let count = 1; count <= parts.length; count += 1) {
        if (fnmatchCase(parts.slice(0, count).join("."), normalised)) {
            return true;
        }
    }
    return false;
}

export function matchesAxisValues(
    axisValues: Record<string, string>,
    waiver: WaiverSpec,
): boolean {
    for (const [axis, patterns] of Object.entries(axisPatterns(waiver))) {
        const value = String(axisValues[axis] ?? "").toLowerCase();
        if (!patterns.some((pattern) => fnmatchCase(value, pattern))) {
            return false;
        }
    }
    return true;
}

export function iterPointPaths(readout: Readout): Array<{ path: string; index: number; depth: number }> {
    const names: string[] = [];
    const result: Array<{ path: string; index: number; depth: number }> = [];
    let index = 0;
    for (const point of readout.iter_points()) {
        names.length = point.depth;
        names.push(point.name);
        result.push({ path: names.join("."), index, depth: point.depth });
        index += 1;
    }
    return result;
}

export type CoverpointAxisOption = {
    name: string;
    values: string[];
};

/**
 * Axis names/values for coverpoints matched by a waiver point pattern.
 * Prefer `preferredPath` when it matches, so edit UI follows the open coverpoint.
 */
export function collectAxisOptionsForPoint(
    readout: Readout,
    pointPattern: string,
    preferredPath: string | null = null,
): CoverpointAxisOption[] {
    const points = Array.from(readout.iter_points());
    const allAxes = Array.from(readout.iter_axes(0, null));
    const allAxisValues = Array.from(readout.iter_axis_values(0, null));
    const paths = iterPointPaths(readout);

    const matching = paths.filter(({ path, index }) => {
        const point = points[index];
        if (!point || point.end !== point.start + 1) {
            return false;
        }
        return matchesPointPath(path, pointPattern);
    });

    const preferred = preferredPath
        ? matching.filter(({ path }) => path === preferredPath)
        : [];
    const selected = preferred.length > 0 ? preferred : matching;

    const byAxis = new Map<string, Set<string>>();
    for (const { index } of selected) {
        const point = points[index];
        const axes = allAxes.filter(
            (axis) => axis.start >= point.axis_start && axis.start < point.axis_end,
        );
        for (const axis of axes) {
            if (!byAxis.has(axis.name)) {
                byAxis.set(axis.name, new Set());
            }
            const values = byAxis.get(axis.name)!;
            for (let offset = axis.value_start; offset < axis.value_end; offset += 1) {
                const value = allAxisValues[offset]?.value;
                if (value !== undefined && value !== "") {
                    values.add(value);
                }
            }
        }
    }

    const natCompare = (a: string, b: string) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

    return [...byAxis.entries()]
        .sort(([a], [b]) => natCompare(a, b))
        .map(([name, values]) => ({
            name,
            values: [...values].sort(natCompare),
        }));
}

function decodeAxisValues(
    row: number,
    axisModels: Array<{ name: string; offset: number; size: number; stride: number }>,
    axisValues: AxisValueTuple[],
): Record<string, string> {
    const values: Record<string, string> = {};
    for (const axis of axisModels) {
        const local = Math.floor(row / axis.stride) % Math.max(axis.size, 1);
        values[axis.name] = axisValues[axis.offset + local]?.value ?? "";
    }
    return values;
}

function buildAxisModels(
    axes: AxisTuple[],
    axisValueStart: number,
): Array<{ name: string; offset: number; size: number; stride: number }> {
    const models = axes.map((axis) => ({
        name: axis.name,
        offset: axis.value_start - axisValueStart,
        size: axis.value_end - axis.value_start,
        stride: 1,
    }));
    let stride = 1;
    for (let i = models.length - 1; i >= 0; i -= 1) {
        models[i].stride = stride;
        stride *= Math.max(models[i].size, 1);
    }
    return models;
}

/**
 * Match enabled rules against a readout. Bad-axis / no-match rules are
 * recorded in diagnostics and skipped; siblings still apply.
 */
export function matchWaiversWithReport(
    readout: Readout,
    waiverFile: WaiverFileSpec,
): WaiverApplyReport {
    const points = Array.from(readout.iter_points());
    const goals = Array.from(readout.iter_goals(0, null));
    const goalTargetByStart = new Map(goals.map((goal) => [goal.start, goal.target]));
    const bucketGoals = Array.from(readout.iter_bucket_goals(0, null));
    const bucketHits = Array.from(readout.iter_bucket_hits(0, null));
    const hitByStart = new Map(bucketHits.map((hit) => [hit.start, hit.hits]));
    const allAxes = Array.from(readout.iter_axes(0, null));
    const allAxisValues = Array.from(readout.iter_axis_values(0, null));

    const diagnostics: WaiverRuleDiagnostic[] = waiverFile.waivers.map((rule, index) => ({
        index,
        rule,
        status: rule.disabled ? "disabled" : "no_match",
        matchCount: 0,
        matchedBucketStarts: [],
        coverpointPaths: [],
    }));

    const matched = new Map<number, { reason: string; ruleIndex: number }>();
    const paths = iterPointPaths(readout);

    for (const { path, index } of paths) {
        const point = points[index];
        if (!point || point.end !== point.start + 1) {
            continue;
        }

        const axes = allAxes.filter(
            (axis) => axis.start >= point.axis_start && axis.start < point.axis_end,
        );
        const axisNames = new Set(axes.map((axis) => axis.name));
        const axisModels = buildAxisModels(axes, point.axis_value_start);
        const pointAxisValues = allAxisValues.slice(point.axis_value_start, point.axis_value_end);

        const applicableIndexes: number[] = [];
        for (let ruleIndex = 0; ruleIndex < waiverFile.waivers.length; ruleIndex += 1) {
            const rule = waiverFile.waivers[ruleIndex];
            if (rule.disabled) {
                continue;
            }
            if (!matchesPointPath(path, rule.point)) {
                continue;
            }
            const unknown = Object.keys(rule.axes)
                .filter((axis) => !axisNames.has(axis))
                .sort();
            if (unknown.length > 0) {
                diagnostics[ruleIndex].status = "bad_axis";
                diagnostics[ruleIndex].message =
                    `names unknown axis/axes ${JSON.stringify(unknown)} on coverpoint ${JSON.stringify(path)}; axes are ${JSON.stringify([...axisNames].sort())}`;
                continue;
            }
            applicableIndexes.push(ruleIndex);
        }

        if (applicableIndexes.length === 0) {
            continue;
        }

        for (let row = 0; row < point.bucket_end - point.bucket_start; row += 1) {
            const bucketStart = point.bucket_start + row;
            const bucketGoal = bucketGoals[bucketStart];
            if (!bucketGoal) {
                continue;
            }
            const target = goalTargetByStart.get(bucketGoal.goal) ?? 0;
            if (target <= 0 || matched.has(bucketStart)) {
                continue;
            }
            const axisValues = decodeAxisValues(row, axisModels, pointAxisValues);
            for (const ruleIndex of applicableIndexes) {
                const rule = waiverFile.waivers[ruleIndex];
                if (!matchesAxisValues(axisValues, rule)) {
                    continue;
                }
                matched.set(bucketStart, { reason: rule.reason, ruleIndex });
                const diag = diagnostics[ruleIndex];
                diag.status = "applied";
                diag.matchCount += 1;
                diag.matchedBucketStarts.push(bucketStart);
                if (!diag.coverpointPaths.includes(path)) {
                    diag.coverpointPaths.push(path);
                }
                break;
            }
        }
    }

    // Rules still marked no_match may actually collide with earlier rules:
    // they would waive buckets, but first-match order already claimed them all.
    for (let ruleIndex = 0; ruleIndex < diagnostics.length; ruleIndex += 1) {
        const diag = diagnostics[ruleIndex];
        if (diag.status !== "no_match") {
            continue;
        }
        const rule = waiverFile.waivers[ruleIndex];
        const coveredBy = new Set<number>();
        let wouldMatch = 0;
        const pathsHit = new Set<string>();

        for (const { path, index } of paths) {
            const point = points[index];
            if (!point || point.end !== point.start + 1) {
                continue;
            }
            if (!matchesPointPath(path, rule.point)) {
                continue;
            }
            const axes = allAxes.filter(
                (axis) => axis.start >= point.axis_start && axis.start < point.axis_end,
            );
            const axisNames = new Set(axes.map((axis) => axis.name));
            const unknown = Object.keys(rule.axes).filter((axis) => !axisNames.has(axis));
            if (unknown.length > 0) {
                continue;
            }
            const axisModels = buildAxisModels(axes, point.axis_value_start);
            const pointAxisValues = allAxisValues.slice(
                point.axis_value_start,
                point.axis_value_end,
            );

            for (let row = 0; row < point.bucket_end - point.bucket_start; row += 1) {
                const bucketStart = point.bucket_start + row;
                const bucketGoal = bucketGoals[bucketStart];
                if (!bucketGoal) {
                    continue;
                }
                const target = goalTargetByStart.get(bucketGoal.goal) ?? 0;
                if (target <= 0) {
                    continue;
                }
                const axisValues = decodeAxisValues(row, axisModels, pointAxisValues);
                if (!matchesAxisValues(axisValues, rule)) {
                    continue;
                }
                wouldMatch += 1;
                pathsHit.add(path);
                const prior = matched.get(bucketStart);
                if (prior && prior.ruleIndex !== ruleIndex) {
                    coveredBy.add(prior.ruleIndex);
                }
            }
        }

        if (wouldMatch > 0 && coveredBy.size > 0) {
            diag.status = "covered";
            diag.matchCount = wouldMatch;
            diag.coveredByIndexes = [...coveredBy].sort((a, b) => a - b);
            diag.coverpointPaths = [...pathsHit];
            const labels = diag.coveredByIndexes.map((index) => {
                const other = waiverFile.waivers[index];
                const reason = other.reason.trim();
                return reason ? `#${index + 1} (“${reason}”)` : `#${index + 1}`;
            });
            diag.message =
                `All ${wouldMatch} matching bucket${wouldMatch === 1 ? "" : "s"} already waived by earlier rule${labels.length === 1 ? "" : "s"} ${labels.join(", ")} (first match wins).`;
        }
    }

    const matchedRows: BucketWaiverTuple[] = Array.from(matched.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([start, { reason }]) => ({ start, reason }));

    let waivedWithHits = 0;
    for (const waiver of matchedRows) {
        if ((hitByStart.get(waiver.start) ?? 0) > 0) {
            waivedWithHits += 1;
        }
    }

    return { matched: matchedRows, diagnostics, waivedWithHits };
}

/** Apply a waiver file in memory: rescore point hits, expose iter_bucket_waivers. */
export function applyWaiverFileToReadout(
    readout: Readout,
    waiverFile: WaiverFileSpec,
): { readout: Readout; report: WaiverApplyReport } {
    const report = matchWaiversWithReport(readout, waiverFile);
    if (report.matched.length === 0 && waiverFile.waivers.every((rule) => rule.disabled)) {
        // Still materialise so callers get a stable InMemoryReadout when desired.
    }
    const data = materializeReadout(readout);
    // Sidecar overlay replaces any legacy embedded waivers on the source.
    data.bucketWaivers = report.matched;
    data.pointHits = buildMergedPointHits(
        data.points,
        data.bucketGoals,
        data.goals,
        data.bucketHits,
        data.bucketWaivers,
    );
    return { readout: new InMemoryReadout(data), report };
}

export function summariseApplyReport(report: WaiverApplyReport): string {
    const applied = report.diagnostics.filter((row) => row.status === "applied").length;
    const problems = report.diagnostics.filter((row) =>
        isWaiverProblemStatus(row.status),
    ).length;
    const disabled = report.diagnostics.filter((row) => row.status === "disabled").length;
    const parts = [
        `Applied ${report.matched.length} bucket${report.matched.length === 1 ? "" : "s"} from ${applied} rule${applied === 1 ? "" : "s"}`,
    ];
    if (disabled > 0) {
        parts.push(`${disabled} disabled`);
    }
    if (problems > 0) {
        parts.push(`${problems} warning${problems === 1 ? "" : "s"}`);
    }
    if (report.waivedWithHits > 0) {
        parts.push(`${report.waivedWithHits} waived with hits`);
    }
    return parts.join(" · ");
}
