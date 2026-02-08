/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

// SPDX-License-Identifier: MIT
// Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

// Utility functions for CoverageDonut (data transformation, math, SVG path, etc.)
import { PointNode } from "./coveragetree";
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
    const pointTarget = Number(node.data.point.target);
    const pointHits = Number(node.data.point_hit.hits);
    const nodeTitle = String(node.title || '');
    const isCovergroup = Array.isArray(node.children) && node.children.length > 0;
    const value = Math.max(pointTarget, 1);
    const coverage = pointTarget > 0 ? pointHits / pointTarget : 0;
    const nodeData: HierarchicalData = {
        name: nodeTitle,
        value: value,
        coverage: coverage,
        target: pointTarget,
        hits: pointHits,
        nodeKey: node.key,
        isCovergroup: isCovergroup,
    };
    if (isCovergroup) {
        const children = (node.children as unknown[])
            .filter((child): child is PointNode => !!child && typeof child === 'object' && 'data' in child)
            .map(child => buildNode(child));
        const childrenValue = children.reduce((sum, child) => sum + child.value, 0);
        nodeData.value = Math.max(value, childrenValue);
        nodeData.children = children;
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
