/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

// SPDX-License-Identifier: MIT
// Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

// Utility functions for CoverageDonut (data transformation, math, SVG path, etc.)
import { PointNode } from "./coveragetree";
import { getPointNodeCoverageMetrics } from "./coveragemetrics";
import { Theme as ThemeType } from "@/theme";

export type HierarchicalData = {
    name: string;
    value: number;
    children?: HierarchicalData[];
    coverage?: number;
    target?: number;
    hits?: number;
    nodeKey?: string;
    isCovergroup?: boolean;
};

export type SunburstNode = HierarchicalData & {
    depth: number;
    startAngle: number;
    endAngle: number;
};

export function getCoverageColorForDonut(ratio: number, theme: ThemeType['theme'], getCoverageColor: Function): string {
    return getCoverageColor(ratio, theme.colors, {
        defaultColor: theme.colors.desaturatedtxt.value
    });
}

export function polarToCartesian(radius: number, angle: number): { x: number; y: number } {
    return {
        x: radius * Math.cos(angle - Math.PI / 2),
        y: radius * Math.sin(angle - Math.PI / 2),
    };
}

/** Ring geometry for sunburst arcs (depth ≥ 1). */
export function calculateRingRadii(
    depth: number,
    maxDepth: number,
    startInnerRadius: number,
    maxRadius: number,
): { innerRadius: number; outerRadius: number } | null {
    if (maxDepth === 0) {
        return null;
    }
    const ringThickness = (maxRadius - startInnerRadius) / maxDepth;
    const innerRadius = startInnerRadius + ringThickness * (depth - 1);
    const outerRadius = innerRadius + ringThickness;
    return { innerRadius, outerRadius };
}

/** Angles where \(x\) or \(y\) hits extrema on a circle (matches polarToCartesian). */
const QUADRANT_ANGLES = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

function expandBBoxPoint(
    bb: { minX: number; maxX: number; minY: number; maxY: number },
    x: number,
    y: number,
) {
    bb.minX = Math.min(bb.minX, x);
    bb.maxX = Math.max(bb.maxX, x);
    bb.minY = Math.min(bb.minY, y);
    bb.maxY = Math.max(bb.maxY, y);
}

function expandBBoxAnnularSector(
    bb: { minX: number; maxX: number; minY: number; maxY: number },
    innerRadius: number,
    outerRadius: number,
    startAngle: number,
    endAngle: number,
) {
    const lo = Math.min(startAngle, endAngle);
    const hi = Math.max(startAngle, endAngle);

    const tryAngle = (theta: number) => {
        if (theta < lo || theta > hi) {
            return;
        }
        const inner = polarToCartesian(innerRadius, theta);
        const outer = polarToCartesian(outerRadius, theta);
        expandBBoxPoint(bb, inner.x, inner.y);
        expandBBoxPoint(bb, outer.x, outer.y);
    };

    tryAngle(lo);
    tryAngle(hi);
    for (const a of QUADRANT_ANGLES) {
        tryAngle(a);
    }
}

/**
 * Bounding-box midpoint of the visible donut (center hub + arc wedges) in group-local coords.
 * Not a geometric centroid — only the axis-aligned center of the union bbox.
 * Used to translate the chart so asymmetric wedges get even padding in the square SVG.
 */
export function computeSunburstVisualMidpoint(
    flatData: SunburstNode[],
    maxDepth: number,
    startInnerRadius: number,
    maxRadius: number,
    centerCircleRadius: number,
): { midX: number; midY: number } {
    const bb = {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
    };

    expandBBoxPoint(bb, -centerCircleRadius, -centerCircleRadius);
    expandBBoxPoint(bb, centerCircleRadius, centerCircleRadius);

    for (const n of flatData) {
        if (n.depth <= 0) {
            continue;
        }
        const ring = calculateRingRadii(n.depth, maxDepth, startInnerRadius, maxRadius);
        if (!ring) {
            continue;
        }
        expandBBoxAnnularSector(bb, ring.innerRadius, ring.outerRadius, n.startAngle, n.endAngle);
    }

    if (!Number.isFinite(bb.minX)) {
        return { midX: 0, midY: 0 };
    }

    const pad = 2;
    bb.minX -= pad;
    bb.maxX += pad;
    bb.minY -= pad;
    bb.maxY += pad;

    return {
        midX: (bb.minX + bb.maxX) / 2,
        midY: (bb.minY + bb.maxY) / 2,
    };
}

export function arcPath(
    innerRadius: number,
    outerRadius: number,
    startAngle: number,
    endAngle: number
): string {
    const start = polarToCartesian(innerRadius, startAngle);
    const end = polarToCartesian(innerRadius, endAngle);
    const startOuter = polarToCartesian(outerRadius, startAngle);
    const endOuter = polarToCartesian(outerRadius, endAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    return [
        `M ${start.x} ${start.y}`,
        `L ${startOuter.x} ${startOuter.y}`,
        `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
        `L ${end.x} ${end.y}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${start.x} ${start.y}`,
        'Z',
    ].join(' ');
}

export function buildNode(node: PointNode): HierarchicalData {
    const nodeTitle = String(node.title || '');
    const isCovergroup = Array.isArray(node.children) && node.children.length > 0;
    const metrics = getPointNodeCoverageMetrics(node);
    const nodeData: HierarchicalData = {
        name: nodeTitle,
        value: 1,
        coverage: metrics.target > 0 ? metrics.hits / metrics.target : 0,
        target: metrics.target,
        hits: metrics.hits,
        nodeKey: String(node.key),
        isCovergroup: isCovergroup,
    };
    if (isCovergroup) {
        const children = (node.children as unknown[])
            .filter((child): child is PointNode => !!child && typeof child === 'object' && 'data' in child)
            .map(child => buildNode(child));
        const childrenValue = children.reduce((sum, child) => sum + child.value, 0);
        nodeData.value = Math.max(metrics.target, childrenValue, 1);
        nodeData.children = children;
    } else {
        nodeData.value = Math.max(metrics.target, 1);
    }
    return nodeData;
}

export function flattenData(
    data: HierarchicalData,
    depth: number = 0,
    startAngle: number = 0,
    totalValue: number = 0
): SunburstNode[] {
    const nodes: SunburstNode[] = [];
    const angleRange = (data.value / totalValue) * 2 * Math.PI;
    const endAngle = startAngle + angleRange;
    const node: SunburstNode = {
        ...data,
        depth,
        startAngle,
        endAngle,
    };
    nodes.push(node);
    if (data.children && data.children.length > 0) {
        let childStartAngle = startAngle;
        for (const child of data.children) {
            const childNodes = flattenData(child, depth + 1, childStartAngle, totalValue);
            nodes.push(...childNodes);
            const childAngleRange = (child.value / totalValue) * 2 * Math.PI;
            childStartAngle += childAngleRange;
        }
    }
    return nodes;
}

export function getAllNames(data: HierarchicalData): string[] {
    const names = [data.name];
    if (data.children) {
        data.children.forEach(child => {
            names.push(...getAllNames(child));
        });
    }
    return names;
}

export function findLongestName(data: HierarchicalData): string {
    const allNames = getAllNames(data);
    return allNames.reduce((longest, name) =>
        name.length > longest.length ? name : longest,
        ''
    );
}
