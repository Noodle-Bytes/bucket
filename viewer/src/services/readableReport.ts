/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

/**
 * Human-readable HTML coverage report.
 *
 * This module is the single source of truth for report generation: it is used
 * by the viewer's export action in the browser and by the headless node entry
 * (scripts/report.ts) which the Python `ReportWriter`/`bucket write report`
 * shell out to. It must stay free of React/antd/DOM dependencies.
 *
 * Mirrors the compare-report pattern: build one intermediate model from
 * readouts, then serialize it to the output format.
 *
 * The report always renders every section it knows about (descriptions,
 * motivations, tier/tags, axes and their values, goals, bucket counts, the
 * rollup summary tables, and recorded results). The only options are scope
 * controls that narrow *which* coverpoints appear and how many axis values
 * to list.
 */

export type ReadableReportOptions = {
    /** Cap on listed values per axis; 0 means unlimited. Default 64. */
    maxAxisValues?: number;
    /** Only include coverpoints with tier <= maxTier; null disables. Default null. */
    maxTier?: number | null;
    /** Only include coverpoints carrying at least one of these tags. Default []. */
    tags?: string[];
    /**
     * Only include coverpoints whose dotted path (or an ancestor's path)
     * matches this glob, e.g. "Pets.dogs*" or "Pets.cats". Default null.
     */
    point?: string | null;
};

type ResolvedReportOptions = Required<ReadableReportOptions>;

const DEFAULT_OPTIONS: ResolvedReportOptions = {
    maxAxisValues: 64,
    maxTier: null,
    tags: [],
    point: null,
};

export type ReportAxis = {
    name: string;
    description: string;
    valueCount: number;
    /** Values listed in axis order, capped at maxAxisValues. */
    values: string[];
    /** Number of values omitted by the maxAxisValues cap. */
    omittedValues: number;
};

export type ReportGoal = {
    name: string;
    description: string;
    target: number;
};

export type ReportResults = {
    hits: number;
    hitBuckets: number;
    fullBuckets: number;
};

export type ReportPoint = {
    name: string;
    /** Full dotted path from the root, e.g. "top.dogs.chew_toys". */
    path: string;
    depth: number;
    isGroup: boolean;
    description: string;
    motivation: string;
    tier: number | null;
    tags: string[];
    bucketCount: number;
    targetBuckets: number;
    target: number;
    axes: ReportAxis[];
    goals: ReportGoal[];
    results: ReportResults | null;
    children: ReportPoint[];
};

export type RollupRow = {
    /** Tier number or tag name this row aggregates. */
    key: string;
    coverpoints: number;
    buckets: number;
    validBuckets: number;
    target: number;
    /** Total hits across the row's coverpoints; null only if no hit data. */
    hits: number | null;
};

export type ReportReadout = {
    title: string;
    source: string;
    sourceKey: string;
    defSha: string;
    recSha: string;
    bucketVersion: string;
    /**
     * Whether this readout recorded any hits. When false (e.g. a plan review
     * before any simulation has run) results are dropped entirely rather than
     * printing 0% everywhere.
     */
    hasResults: boolean;
    roots: ReportPoint[];
    tierSummary: RollupRow[];
    tagSummary: RollupRow[];
};

export type ReportModel = {
    options: ResolvedReportOptions;
    readouts: ReportReadout[];
};

/**
 * Decode stored point tags: JSON array first, comma-separated fallback.
 * Mirrors decode_point_tags in bucket/rw/common.py.
 */
function parsePointTags(tags: string | null | undefined): string[] {
    if (!tags) {
        return [];
    }
    try {
        const decoded: unknown = JSON.parse(tags);
        if (Array.isArray(decoded)) {
            return decoded.map((tag) => String(tag));
        }
        return [String(decoded)];
    } catch {
        return tags
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0);
    }
}

type NumericValueParts = {
    prefix: string;
    num: string;
    suffix: string;
    value: number;
};

function splitNumericValue(value: string): NumericValueParts | null {
    const match = /^(.*?)(\d+)(\D*)$/.exec(value);
    if (!match) {
        return null;
    }
    return {
        prefix: match[1],
        num: match[2],
        suffix: match[3],
        value: parseInt(match[2], 10),
    };
}

function hasLeadingZero(num: string): boolean {
    return num.length > 1 && num.startsWith("0");
}

function numericRunContinues(
    prev: NumericValueParts,
    next: NumericValueParts,
): boolean {
    if (prev.prefix !== next.prefix || prev.suffix !== next.suffix) {
        return false;
    }
    if (next.value !== prev.value + 1) {
        return false;
    }
    // Zero-padded sequences only stay a run while the width is stable, so
    // e.g. universe_00..universe_39 collapses but universe_09,universe_100
    // does not pretend to be contiguous.
    if (hasLeadingZero(prev.num) || hasLeadingZero(next.num)) {
        return prev.num.length === next.num.length;
    }
    return true;
}

// Runs shorter than this are listed in full; a two-value "range" saves nothing.
const MIN_RANGE_RUN = 3;

/**
 * Collapse contiguous numeric runs of axis values into ranges for readability:
 * "0","1",...,"18" -> "0..18" and "universe_00",... -> "universe_[00..39]".
 * Each returned entry records how many raw values it represents.
 */
export function compactAxisValues(
    values: string[],
): { text: string; count: number }[] {
    const entries: { text: string; count: number }[] = [];
    let idx = 0;
    while (idx < values.length) {
        const start = splitNumericValue(values[idx]);
        if (start === null) {
            entries.push({ text: values[idx], count: 1 });
            idx += 1;
            continue;
        }
        let end = start;
        let endIdx = idx;
        while (endIdx + 1 < values.length) {
            const next = splitNumericValue(values[endIdx + 1]);
            if (next === null || !numericRunContinues(end, next)) {
                break;
            }
            end = next;
            endIdx += 1;
        }
        const runLength = endIdx - idx + 1;
        if (runLength >= MIN_RANGE_RUN) {
            const text =
                start.prefix === "" && start.suffix === ""
                    ? `${start.num}..${end.num}`
                    : `${start.prefix}[${start.num}..${end.num}]${start.suffix}`;
            entries.push({ text, count: runLength });
        } else {
            for (let runIdx = idx; runIdx <= endIdx; runIdx += 1) {
                entries.push({ text: values[runIdx], count: 1 });
            }
        }
        idx = endIdx + 1;
    }
    return entries;
}

function buildAxes(
    readout: Readout,
    point: PointTuple,
    options: ResolvedReportOptions,
): ReportAxis[] {
    const axes: ReportAxis[] = [];
    for (const axis of readout.iter_axes(point.axis_start, point.axis_end)) {
        const valueCount = axis.value_end - axis.value_start;
        const raw = Array.from(
            readout.iter_axis_values(axis.value_start, axis.value_end),
            (axisValue) => axisValue.value,
        );
        const entries = compactAxisValues(raw);
        const cap = options.maxAxisValues;
        const kept =
            cap > 0 && entries.length > cap ? entries.slice(0, cap) : entries;
        const values = kept.map((entry) => entry.text);
        const omittedValues =
            valueCount - kept.reduce((total, entry) => total + entry.count, 0);
        axes.push({
            name: axis.name,
            description: axis.description,
            valueCount,
            values,
            omittedValues,
        });
    }
    return axes;
}

function buildGoals(readout: Readout, point: PointTuple): ReportGoal[] {
    return Array.from(readout.iter_goals(point.goal_start, point.goal_end), (goal) => ({
        name: goal.name,
        description: goal.description,
        target: goal.target,
    }));
}

function buildReadoutModel(
    readout: Readout,
    options: ResolvedReportOptions,
): ReportReadout {
    const source = readout.get_source() ?? "";
    const recSha = readout.get_rec_sha();

    const roots: ReportPoint[] = [];
    // Points arrive in prefix order; `depth` gives the nesting level.
    const stack: ReportPoint[] = [];
    const pointHits = readout.iter_point_hits();

    for (const point of readout.iter_points()) {
        const hit = pointHits.next().value as PointHitTuple | undefined;
        const isGroup = point.end !== point.start + 1;

        stack.length = point.depth;
        const parent = stack[stack.length - 1];
        const path = parent ? `${parent.path}.${point.name}` : point.name;

        const reportPoint: ReportPoint = {
            name: point.name,
            path,
            depth: point.depth,
            isGroup,
            description: point.description,
            motivation: point.motivation ?? "",
            tier: point.tier ?? null,
            tags: parsePointTags(point.tags),
            bucketCount: point.bucket_end - point.bucket_start,
            targetBuckets: point.target_buckets,
            target: point.target,
            axes: !isGroup ? buildAxes(readout, point, options) : [],
            goals: !isGroup ? buildGoals(readout, point) : [],
            results: hit
                ? {
                      hits: hit.hits,
                      hitBuckets: hit.hit_buckets,
                      fullBuckets: hit.full_buckets,
                  }
                : null,
            children: [],
        };

        if (parent) {
            parent.children.push(reportPoint);
        } else {
            roots.push(reportPoint);
        }
        stack.push(reportPoint);
    }

    const filteredRoots = pruneTree(roots, buildLeafFilter(options));
    for (const root of filteredRoots) {
        recomputeGroupAggregates(root);
    }
    const leaves = Array.from(walkPoints(filteredRoots)).filter(
        (point) => !point.isGroup,
    );

    // A readout with no recorded hits (a plan review before any run) shows
    // nothing useful in the results, so drop them rather than print 0%
    // everywhere. Rollups are then built without hit columns too.
    const hasResults = leaves.some((leaf) => (leaf.results?.hits ?? 0) > 0);
    if (!hasResults) {
        for (const point of walkPoints(filteredRoots)) {
            point.results = null;
        }
    }

    return {
        title: source || `Record ${recSha.slice(0, 12)}`,
        source,
        sourceKey: readout.get_source_key() ?? "",
        defSha: readout.get_def_sha(),
        recSha,
        bucketVersion: readout.get_bucket_version(),
        hasResults,
        roots: filteredRoots,
        tierSummary: buildTierSummary(leaves),
        tagSummary: buildTagSummary(leaves),
    };
}

function globToRegExp(glob: string): RegExp {
    const escaped = glob.replace(/[.*+?^${}()|[\]\\]/g, (ch) => {
        if (ch === "*") {
            return "[^]*";
        }
        if (ch === "?") {
            return "[^]";
        }
        return `\\${ch}`;
    });
    return new RegExp(`^${escaped}$`);
}

/** Match the point's own path or any ancestor path, so a glob naming a
 * covergroup (e.g. "Pets.dogs") selects its whole subtree. */
function pathOrAncestorMatches(path: string, pattern: RegExp): boolean {
    const parts = path.split(".");
    for (let idx = 1; idx <= parts.length; idx += 1) {
        if (pattern.test(parts.slice(0, idx).join("."))) {
            return true;
        }
    }
    return false;
}

function buildLeafFilter(
    options: ResolvedReportOptions,
): (point: ReportPoint) => boolean {
    const pattern = options.point ? globToRegExp(options.point) : null;
    return (point: ReportPoint): boolean => {
        // Untiered points count as tier 0, matching the sampler's default.
        if (options.maxTier !== null && (point.tier ?? 0) > options.maxTier) {
            return false;
        }
        if (
            options.tags.length > 0 &&
            !point.tags.some((tag) => options.tags.includes(tag))
        ) {
            return false;
        }
        if (pattern !== null && !pathOrAncestorMatches(point.path, pattern)) {
            return false;
        }
        return true;
    };
}

/** Drop excluded coverpoints and any covergroups left with no children. */
function pruneTree(
    points: ReportPoint[],
    includeLeaf: (point: ReportPoint) => boolean,
): ReportPoint[] {
    const kept: ReportPoint[] = [];
    for (const point of points) {
        if (point.isGroup) {
            point.children = pruneTree(point.children, includeLeaf);
            if (point.children.length > 0) {
                kept.push(point);
            }
        } else if (includeLeaf(point)) {
            kept.push(point);
        }
    }
    return kept;
}

/** After pruning, group totals must reflect only the coverpoints kept. */
function recomputeGroupAggregates(point: ReportPoint): void {
    if (!point.isGroup) {
        return;
    }
    point.bucketCount = 0;
    point.targetBuckets = 0;
    point.target = 0;
    const results: ReportResults = { hits: 0, hitBuckets: 0, fullBuckets: 0 };
    let haveResults = false;
    for (const child of point.children) {
        recomputeGroupAggregates(child);
        point.bucketCount += child.bucketCount;
        point.targetBuckets += child.targetBuckets;
        point.target += child.target;
        if (child.results) {
            haveResults = true;
            results.hits += child.results.hits;
            results.hitBuckets += child.results.hitBuckets;
            results.fullBuckets += child.results.fullBuckets;
        }
    }
    point.results = haveResults ? results : null;
}

function buildRollup(
    leaves: ReportPoint[],
    keyOf: (leaf: ReportPoint) => string[],
): Map<string, RollupRow> {
    const rows = new Map<string, RollupRow>();
    for (const leaf of leaves) {
        for (const key of keyOf(leaf)) {
            const row = rows.get(key) ?? {
                key,
                coverpoints: 0,
                buckets: 0,
                validBuckets: 0,
                target: 0,
                hits: null,
            };
            row.coverpoints += 1;
            row.buckets += leaf.bucketCount;
            row.validBuckets += leaf.targetBuckets;
            row.target += leaf.target;
            if (leaf.results) {
                row.hits = (row.hits ?? 0) + leaf.results.hits;
            }
            rows.set(key, row);
        }
    }
    return rows;
}

function buildTierSummary(leaves: ReportPoint[]): RollupRow[] {
    const rows = buildRollup(leaves, (leaf) => [String(leaf.tier ?? 0)]);
    return Array.from(rows.values()).sort(
        (rowA, rowB) => Number(rowA.key) - Number(rowB.key),
    );
}

const UNTAGGED_KEY = "(untagged)";

function buildTagSummary(leaves: ReportPoint[]): RollupRow[] {
    if (!leaves.some((leaf) => leaf.tags.length > 0)) {
        return [];
    }
    const rows = buildRollup(leaves, (leaf) =>
        leaf.tags.length > 0 ? leaf.tags : [UNTAGGED_KEY],
    );
    return Array.from(rows.values()).sort((rowA, rowB) => {
        if (rowA.key === UNTAGGED_KEY) {
            return 1;
        }
        if (rowB.key === UNTAGGED_KEY) {
            return -1;
        }
        return rowA.key.localeCompare(rowB.key);
    });
}

export function buildReportModel(
    readouts: Readout[],
    options: ReadableReportOptions = {},
): ReportModel {
    const resolved: ResolvedReportOptions = { ...DEFAULT_OPTIONS, ...options };
    return {
        options: resolved,
        readouts: readouts.map((readout) => buildReadoutModel(readout, resolved)),
    };
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function percent(numerator: number, denominator: number): string {
    const ratio = denominator > 0 ? numerator / denominator : 1;
    return `${(ratio * 100).toFixed(2)}%`;
}

function statusClass(numerator: number, denominator: number): string {
    const ratio = denominator > 0 ? numerator / denominator : 1;
    if (ratio >= 1) {
        return "full";
    }
    if (ratio >= 0.5) {
        return "high";
    }
    if (ratio > 0) {
        return "low";
    }
    return "none";
}

function pctBadge(numerator: number, denominator: number): string {
    return (
        `<span class="pct ${statusClass(numerator, denominator)}">` +
        `${percent(numerator, denominator)}</span>`
    );
}

function* walkPoints(points: ReportPoint[]): Generator<ReportPoint> {
    for (const point of points) {
        yield point;
        yield* walkPoints(point.children);
    }
}

/**
 * Card title: mute the ancestor path so the point's own name stands out,
 * while the full path keeps context when a sticky group header is pinned.
 */
function pathHtml(point: ReportPoint): string {
    const lastDot = point.path.lastIndexOf(".");
    if (lastDot < 0) {
        return `<span class="path"><span class="leaf">${escapeHtml(point.path)}</span></span>`;
    }
    const crumb = escapeHtml(point.path.slice(0, lastDot + 1));
    const leaf = escapeHtml(point.path.slice(lastDot + 1));
    return (
        `<span class="path"><span class="crumb">${crumb}</span>` +
        `<span class="leaf">${leaf}</span></span>`
    );
}

function buildAnchorIds(readouts: ReportReadout[]): Map<ReportPoint, string> {
    const ids = new Map<ReportPoint, string>();
    let counter = 0;
    for (const readout of readouts) {
        for (const point of walkPoints(readout.roots)) {
            const slug = point.path.replace(/[^A-Za-z0-9_-]+/g, "-");
            ids.set(point, `point-${counter}-${slug}`);
            counter += 1;
        }
    }
    return ids;
}

function renderTreeItems(
    points: ReportPoint[],
    ids: Map<ReportPoint, string>,
): string {
    const items = points.map((point) => {
        const label = `<a href="#${ids.get(point)}">${escapeHtml(point.name)}</a>`;
        // Keep the sidebar lean: just the point name. All numbers (bucket
        // counts, targets, hits) live on the cards themselves.
        const children =
            point.children.length > 0
                ? // Indent guides take the same tint as the group's card.
                  `<ul class="tint-${point.depth % 4}">` +
                  renderTreeItems(point.children, ids) +
                  `</ul>`
                : "";
        const kind = point.isGroup ? "group" : "leaf";
        return `<li class="${kind}">${label}${children}</li>`;
    });
    return items.join("");
}

function renderTree(points: ReportPoint[], ids: Map<ReportPoint, string>): string {
    return `<ul>${renderTreeItems(points, ids)}</ul>`;
}

function renderCodeList(values: string[]): string {
    return values.map((value) => `<code>${escapeHtml(value)}</code>`).join(", ");
}

function renderProse(point: ReportPoint): string {
    const parts: string[] = [];
    if (point.description) {
        parts.push(`<p class="prose">${escapeHtml(point.description)}</p>`);
    }
    if (point.motivation) {
        parts.push(
            `<p class="prose motivation"><em>Motivation:</em> ` +
                `${escapeHtml(point.motivation)}</p>`,
        );
    }
    return parts.join("");
}

function summaryStatsHtml(point: ReportPoint): string {
    const stats: string[] = [`${point.bucketCount} buckets`];
    if (point.results) {
        stats.push(pctBadge(point.results.hits, point.target));
    }
    return `<span class="sum-stats">${stats.join(" · ")}</span>`;
}

// Folder/file marks (Primer Octicons, MIT) mirroring the viewer's tree
// iconography, so covergroups and coverpoints are tellable apart at a glance.
const GROUP_ICON =
    `<svg class="icon icon-group" viewBox="0 0 16 16" aria-hidden="true">` +
    `<path fill="currentColor" d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 ` +
    `15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25` +
    `.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/></svg>`;
const POINT_ICON =
    `<svg class="icon icon-point" viewBox="0 0 16 16" aria-hidden="true">` +
    `<path fill="currentColor" d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909` +
    `.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 ` +
    `13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 ` +
    `.138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5` +
    `Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z"/></svg>`;

/**
 * Coverpoint cards render nested inside their covergroup's card, so
 * membership is shown by containment and collapsing a covergroup folds
 * away its whole subtree.
 */
function renderCardTree(
    point: ReportPoint,
    ids: Map<ReportPoint, string>,
    shade: number = 0,
): string {
    const id = ids.get(point) ?? "";
    if (!point.isGroup) {
        return renderPointCard(point, id);
    }
    // Sibling covergroups alternate light/dark shades of their depth's tint,
    // so crossing from one group to the next is visible while scrolling.
    let siblingGroupIdx = 0;
    const children = point.children
        .map((child) =>
            renderCardTree(child, ids, child.isGroup ? siblingGroupIdx++ % 2 : 0),
        )
        .join("");
    return (
        `<details class="card group-card tint-${point.depth % 4} shade-${shade}" open id="${id}">` +
        `<summary>${GROUP_ICON}${pathHtml(point)}<span class="badge">covergroup</span>` +
        `${summaryStatsHtml(point)}</summary>` +
        `<div class="card-body">${renderProse(point)}${children}</div>` +
        `</details>`
    );
}

function renderPointCard(point: ReportPoint, id: string): string {
    const body: string[] = [renderProse(point)];

    if (point.tier !== null || point.tags.length > 0) {
        const chips: string[] = [];
        if (point.tier !== null) {
            chips.push(`Tier <span class="chip">${point.tier}</span>`);
        }
        if (point.tags.length > 0) {
            const tags = point.tags
                .map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`)
                .join(" ");
            chips.push(`Tags ${tags}`);
        }
        body.push(`<p class="chips">${chips.join(" · ")}</p>`);
    }

    if (point.axes.length > 0) {
        const header =
            "<tr><th>Axis</th><th>Description</th><th class='num'>Count</th><th>Values</th></tr>";
        const rows = point.axes.map((axis) => {
            const suffix =
                axis.omittedValues > 0
                    ? `, <span class="muted">+${axis.omittedValues} more</span>`
                    : "";
            return (
                `<tr><td>${escapeHtml(axis.name)}</td>` +
                `<td>${escapeHtml(axis.description)}</td>` +
                `<td class="num">${axis.valueCount}</td>` +
                `<td>${renderCodeList(axis.values)}${suffix}</td></tr>`
            );
        });
        body.push(
            `<table class="axes"><thead>${header}</thead>` +
                `<tbody>${rows.join("")}</tbody></table>`,
        );
    }

    if (point.goals.length > 0) {
        const rows = point.goals.map(
            (goal) =>
                `<tr><td>${escapeHtml(goal.name)}</td>` +
                `<td>${escapeHtml(goal.description)}</td>` +
                `<td class="num">${goal.target}</td></tr>`,
        );
        body.push(
            `<table class="goals"><thead><tr><th>Goal</th><th>Description</th>` +
                `<th class="num">Target</th></tr></thead>` +
                `<tbody>${rows.join("")}</tbody></table>`,
        );
    }

    body.push(
        `<p class="buckets-line">Buckets: ${point.bucketCount} total, ` +
            `${point.targetBuckets} valid · Target hits: ${point.target}</p>`,
    );

    if (point.results) {
        const hitWidth = Math.min(
            100,
            point.target > 0 ? (point.results.hits / point.target) * 100 : 100,
        ).toFixed(2);
        body.push(
            `<div class="results">` +
                `<span class="bar"><span class="fill ${statusClass(point.results.hits, point.target)}"` +
                ` style="width:${hitWidth}%"></span></span>` +
                `<span>${point.results.hits}/${point.target} hits ` +
                `${pctBadge(point.results.hits, point.target)} · ` +
                `${point.results.hitBuckets}/${point.targetBuckets} buckets hit ` +
                `${pctBadge(point.results.hitBuckets, point.targetBuckets)} · ` +
                `${point.results.fullBuckets} full ` +
                `${pctBadge(point.results.fullBuckets, point.targetBuckets)}</span>` +
                `</div>`,
        );
    }

    return (
        `<details class="card point-card" open id="${id}">` +
        `<summary>${POINT_ICON}${pathHtml(point)}${summaryStatsHtml(point)}</summary>` +
        `<div class="card-body">${body.join("")}</div>` +
        `</details>`
    );
}

function describeFilters(options: ResolvedReportOptions): string {
    const filters: string[] = [];
    if (options.maxTier !== null) {
        filters.push(`tier ≤ ${options.maxTier}`);
    }
    if (options.tags.length > 0) {
        filters.push(`tags: ${renderCodeList(options.tags)}`);
    }
    if (options.point) {
        filters.push(`points: <code>${escapeHtml(options.point)}</code>`);
    }
    return filters.join(" · ");
}

function renderRollupTable(
    title: string,
    rows: RollupRow[],
    withHits: boolean,
): string {
    const hitHeader = withHits
        ? `<th class="num">Hits</th><th class="num">Hit %</th>`
        : "";
    const bodyRows = rows.map((row) => {
        const hitCells = !withHits
            ? ""
            : row.hits !== null
              ? `<td class="num">${row.hits}</td>` +
                `<td class="num">${pctBadge(row.hits, row.target)}</td>`
              : `<td class="num"></td><td class="num"></td>`;
        return (
            `<tr><td>${escapeHtml(row.key)}</td>` +
            `<td class="num">${row.coverpoints}</td>` +
            `<td class="num">${row.buckets}</td>` +
            `<td class="num">${row.validBuckets}</td>` +
            `<td class="num">${row.target}</td>${hitCells}</tr>`
        );
    });
    return (
        `<table class="rollup"><thead><tr><th>${escapeHtml(title)}</th>` +
        `<th class="num">Coverpoints</th><th class="num">Buckets</th>` +
        `<th class="num">Valid buckets</th><th class="num">Target hits</th>` +
        `${hitHeader}</tr></thead><tbody>${bodyRows.join("")}</tbody></table>`
    );
}

function renderMetadata(readout: ReportReadout): string {
    const rows: string[] = [];
    if (readout.source) {
        rows.push(`<dt>Source</dt><dd>${escapeHtml(readout.source)}</dd>`);
    }
    if (readout.sourceKey) {
        rows.push(`<dt>Source key</dt><dd>${escapeHtml(readout.sourceKey)}</dd>`);
    }
    rows.push(
        `<dt>Definition SHA</dt><dd><code>${escapeHtml(readout.defSha)}</code></dd>`,
    );
    rows.push(`<dt>Record SHA</dt><dd><code>${escapeHtml(readout.recSha)}</code></dd>`);
    if (readout.bucketVersion) {
        rows.push(
            `<dt>Bucket version</dt><dd>${escapeHtml(readout.bucketVersion)}</dd>`,
        );
    }
    return `<dl class="meta">${rows.join("")}</dl>`;
}

const REPORT_CSS = `
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
  margin:0;color:#1f2328;background:#fff;line-height:1.55}
main{max-width:64rem;margin:0 auto;padding:1.5rem 2rem 4rem}
h1{font-size:1.7rem;border-bottom:1px solid #d0d7de;padding-bottom:.4rem}
h2{font-size:1.35rem;margin-top:2rem}
h3{font-size:1.1rem;margin-top:1.8rem;text-transform:uppercase;letter-spacing:.04em;
  color:#57606a;font-weight:600}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85em;
  background:#f6f8fa;border:1px solid #d0d7de;border-radius:4px;padding:0 .3em}
.muted{color:#57606a}
dl.meta{display:grid;grid-template-columns:max-content 1fr;gap:.15rem 1.25rem;
  font-size:.9rem;margin:.75rem 0}
dl.meta dt{color:#57606a}
dl.meta dd{margin:0;overflow-wrap:anywhere}
.filters{background:#fff8c5;border:1px solid #d4a72c66;border-radius:6px;
  padding:.4rem .8rem;font-size:.9rem}
table{border-collapse:collapse;margin:.6rem 0;font-size:.9rem;width:auto}
th,td{border:1px solid #d0d7de;padding:.3rem .65rem;text-align:left;vertical-align:top}
th{background:#f6f8fa}
td.num,th.num{text-align:right}
nav.tree{font-size:.92rem}
nav.tree ul{list-style:none;margin:.2rem 0;padding-left:1.1rem;border-left:1px solid #d0d7de}
nav.tree>ul{padding-left:0;border-left:none}
nav.tree li{padding:.1rem 0}
nav.tree li.group>a,nav.tree li.group>.tree-name{font-weight:600}
nav.tree a{color:#0969da;text-decoration:none}
nav.tree a:hover{text-decoration:underline}
.card{border:1px solid #d0d7de;border-radius:8px;margin:1rem 0;background:#fff}
summary{display:flex;align-items:baseline;gap:.75rem;padding:.55rem 1rem;
  background:#f6f8fa;border-radius:8px;cursor:pointer;list-style:none}
summary::-webkit-details-marker{display:none}
summary::before{content:"▸";color:#57606a;font-size:.8em;flex:none}
details[open]>summary::before{content:"▾"}
details[open].card>summary{border-bottom:1px solid #d0d7de;border-radius:8px 8px 0 0}
.path{overflow-wrap:anywhere}
.crumb{color:#57606a;font-weight:400}
.leaf{font-weight:600}
.icon{width:14px;height:14px;flex:none;align-self:center}
.icon-point{color:#8b949e}
.point-card>summary{background:#fff;font-size:.92rem}
details[open].point-card>summary{border-bottom:1px solid #e4e9ee}
.group-card>summary{font-size:1rem}
.tint-0>summary>.icon-group{color:#5f9ed9}
.tint-1>summary>.icon-group{color:#9b7fd4}
.tint-2>summary>.icon-group{color:#5cab7d}
.tint-3>summary>.icon-group{color:#c99b3f}
.sum-stats{margin-left:auto;color:#57606a;font-size:.85rem;white-space:nowrap}
.badge{background:#ddf4ff;color:#0969da;border:1px solid #0969da33;border-radius:999px;
  padding:0 .55rem;font-size:.75rem;font-weight:600}
.group-card{background:#f6f8fa}
.group-card>summary{background:#eaeef2;position:sticky;top:0;z-index:2}
.group-card>.card-body{padding:.5rem .75rem .75rem}
/* Soft per-depth tints: distinguish nesting levels without shouting.
   Sibling groups alternate shade-0 (lighter) and shade-1 (darker) so the
   band visibly changes when scrolling into the next covergroup. */
.group-card.tint-0{background:#f7fafd;border-left:3px solid #9cc7ee}
.group-card.tint-0>summary{background:#e9f2fa}
.group-card.tint-0.shade-1{background:#eef5fb;border-left-color:#74afe3}
.group-card.tint-0.shade-1>summary{background:#d9e9f7}
.group-card.tint-1{background:#faf9fd;border-left:3px solid #c0aee8}
.group-card.tint-1>summary{background:#f1edf9}
.group-card.tint-1.shade-1{background:#f4f0fa;border-left-color:#a98fdd}
.group-card.tint-1.shade-1>summary{background:#e6def4}
.group-card.tint-2{background:#f7fcf9;border-left:3px solid #93cfad}
.group-card.tint-2>summary{background:#e9f5ee}
.group-card.tint-2.shade-1{background:#effaf4;border-left-color:#6fbd91}
.group-card.tint-2.shade-1>summary{background:#d8ecdf}
.group-card.tint-3{background:#fdfbf4;border-left:3px solid #ddc389}
.group-card.tint-3>summary{background:#f8f1de}
.group-card.tint-3.shade-1{background:#faf6e9;border-left-color:#d1b166}
.group-card.tint-3.shade-1>summary{background:#f2e7c8}
nav.tree ul.tint-0{border-left-color:#9cc7ee}
nav.tree ul.tint-1{border-left-color:#c0aee8}
nav.tree ul.tint-2{border-left-color:#93cfad}
nav.tree ul.tint-3{border-left-color:#ddc389}
.card .card{margin:.75rem 0}
.card-body{padding:.35rem 1rem .75rem}
.prose{white-space:pre-wrap;max-width:52rem}
.motivation{color:#424a53}
.chips{font-size:.88rem;color:#57606a}
.chip{display:inline-block;background:#f6f8fa;border:1px solid #d0d7de;
  border-radius:999px;padding:0 .55rem;font-size:.8rem;color:#1f2328}
.buckets-line{font-size:.9rem;color:#424a53}
.results{display:flex;align-items:center;gap:.75rem;font-size:.9rem;margin:.4rem 0}
.bar{flex:0 0 10rem;height:8px;background:#eaeef2;border-radius:4px;overflow:hidden}
.bar .fill{display:block;height:100%}
.pct{font-weight:600}
.pct.none,.fill.none{color:#d1242f}
.fill.none{background:#d1242f;min-width:2px}
.pct.low{color:#bc4c00}.fill.low{background:#e16f24}
.pct.high{color:#9a6700}.fill.high{background:#d4a72c}
.pct.full{color:#1a7f37}.fill.full{background:#2da44e}
.empty{font-style:italic;color:#57606a}
/* Wide screens: the tree becomes a sticky sidebar beside the details. */
@media (min-width:1100px){
  main{max-width:88rem}
  .record-columns{display:grid;grid-template-columns:300px minmax(0,1fr);
    gap:2rem;align-items:start}
  .record-columns>aside.toc{position:sticky;top:0;max-height:100vh;
    overflow:auto;padding:.25rem .5rem .5rem 0}
}
.record-main{min-width:0}
nav.tree a.active{background:#ddf4ff;border-radius:4px;padding:0 .25rem;margin:0 -.25rem}
.toc-tools{display:flex;gap:.5rem;margin:.5rem 0}
.toc-tools button{font:inherit;font-size:.8rem;padding:.15rem .6rem;
  border:1px solid #d0d7de;border-radius:6px;background:#f6f8fa;cursor:pointer}
.toc-tools button:hover{background:#eaeef2}
.toc-filter{font:inherit;font-size:.85rem;width:100%;padding:.25rem .5rem;
  border:1px solid #d0d7de;border-radius:6px;margin:0 0 .5rem;display:block}
nav.tree li.hide{display:none}
nav.tree li.collapsed>ul{display:none}
@media print{.card{break-inside:avoid}main{padding:0}}
`;

// Progressive enhancement only: the document must stay fully readable when
// scripts are stripped or disabled, so everything here is additive
// (expand/collapse buttons, tree filter, scroll-spy highlight).
const REPORT_JS = `
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("section.record").forEach(function (record) {
    var toc = record.querySelector("aside.toc");
    var main = record.querySelector(".record-main");
    if (!toc || !main) { return; }
    var heading = toc.querySelector("h3");

    var tools = document.createElement("div");
    tools.className = "toc-tools";
    function addButton(label, onClick) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", onClick);
      tools.appendChild(button);
    }
    addButton("Expand all", function () {
      main.querySelectorAll("details").forEach(function (d) { d.open = true; });
    });
    addButton("Collapse all", function () {
      main.querySelectorAll("details.group-card").forEach(function (d) { d.open = false; });
    });

    var filter = document.createElement("input");
    filter.type = "search";
    filter.className = "toc-filter";
    filter.placeholder = "Filter tree\\u2026";
    filter.setAttribute("aria-label", "Filter coverage tree");
    filter.addEventListener("input", function () {
      var query = filter.value.trim().toLowerCase();
      var items = toc.querySelectorAll("li");
      items.forEach(function (li) {
        li.classList.toggle("hide", query !== "");
      });
      if (query === "") { applyAccordion(active); return; }
      // While filtering, the accordion yields so matches are visible.
      toc.querySelectorAll("li.group").forEach(function (li) {
        li.classList.remove("collapsed");
      });
      items.forEach(function (li) {
        var label = li.querySelector(":scope > a");
        if (!label || label.textContent.toLowerCase().indexOf(query) < 0) { return; }
        li.classList.remove("hide");
        li.querySelectorAll("li").forEach(function (x) { x.classList.remove("hide"); });
        var parent = li.parentElement;
        while (parent && parent !== toc) {
          if (parent.tagName === "LI") { parent.classList.remove("hide"); }
          parent = parent.parentElement;
        }
      });
    });
    heading.after(tools, filter);

    var links = new Map();
    var active = null;
    // Accordion: only the branch containing the viewed card stays expanded.
    function applyAccordion(link) {
      toc.querySelectorAll("li.group").forEach(function (li) {
        li.classList.add("collapsed");
      });
      if (!link) { return; }
      var item = link.closest("li");
      if (item && item.classList.contains("group")) {
        item.classList.remove("collapsed");
      }
      var parent = item ? item.parentElement : null;
      while (parent && parent !== toc) {
        if (parent.tagName === "LI") { parent.classList.remove("collapsed"); }
        parent = parent.parentElement;
      }
    }
    // Keep the active entry in view as the sidebar tracks the main scroll.
    function revealInToc(link) {
      var box = toc.getBoundingClientRect();
      var rect = link.getBoundingClientRect();
      if (rect.top < box.top + 8) {
        toc.scrollTop += rect.top - box.top - 48;
      } else if (rect.bottom > box.bottom - 8) {
        toc.scrollTop += rect.bottom - box.bottom + 48;
      }
    }
    function setActive(link) {
      if (!link) { return; }
      if (link !== active) {
        if (active) { active.classList.remove("active"); }
        active = link;
        link.classList.add("active");
      }
      if (filter.value.trim() === "") { applyAccordion(link); }
      revealInToc(link);
    }
    toc.querySelectorAll("a[href^='#']").forEach(function (a) {
      links.set(a.getAttribute("href").slice(1), a);
      a.addEventListener("click", function () { setActive(a); });
    });
    applyAccordion(null);
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { setActive(links.get(entry.target.id)); }
      });
    }, { rootMargin: "-5% 0px -80% 0px" });
    main.querySelectorAll(".card[id]").forEach(function (card) { spy.observe(card); });
  });
});
`;

export function serializeReportHtml(model: ReportModel): string {
    const ids = buildAnchorIds(model.readouts);
    const filterNote = describeFilters(model.options);
    const sections: string[] = [];

    for (const readout of model.readouts) {
        const parts: string[] = [`<h2>${escapeHtml(readout.title)}</h2>`];
        parts.push(renderMetadata(readout));

        if (filterNote) {
            parts.push(`<p class="filters"><strong>Filtered:</strong> ${filterNote}</p>`);
        }

        if (readout.roots.length === 0) {
            parts.push(
                `<p class="empty">No coverage points match the requested filters.</p>`,
            );
            sections.push(`<section class="record">${parts.join("")}</section>`);
            continue;
        }

        // On wide screens the tree becomes a sticky sidebar next to the
        // details; on narrow screens (and without CSS) it stacks above them.
        parts.push(`<div class="record-columns">`);
        parts.push(
            `<aside class="toc"><h3>Coverage tree</h3>` +
                `<nav class="tree">${renderTree(readout.roots, ids)}</nav>` +
                `</aside>`,
        );

        parts.push(`<div class="record-main">`);
        parts.push(`<h3>Summary</h3>`);
        parts.push(
            renderRollupTable("Tier", readout.tierSummary, readout.hasResults),
        );
        if (readout.tagSummary.length > 0) {
            parts.push(
                renderRollupTable("Tag", readout.tagSummary, readout.hasResults),
            );
        }

        parts.push(`<h3>Coverage details</h3>`);
        let rootGroupIdx = 0;
        for (const root of readout.roots) {
            parts.push(
                renderCardTree(root, ids, root.isGroup ? rootGroupIdx++ % 2 : 0),
            );
        }
        parts.push(`</div></div>`);

        sections.push(`<section class="record">${parts.join("")}</section>`);
    }

    return (
        `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width, initial-scale=1">` +
        `<title>Coverage report</title><style>${REPORT_CSS}</style></head>` +
        `<body><main><h1>Coverage report</h1>${sections.join("")}</main>` +
        `<script>${REPORT_JS}</script></body></html>\n`
    );
}

export function buildReadableReportHtml(
    readouts: Readout[],
    options: ReadableReportOptions = {},
): string {
    return serializeReportHtml(buildReportModel(readouts, options));
}
