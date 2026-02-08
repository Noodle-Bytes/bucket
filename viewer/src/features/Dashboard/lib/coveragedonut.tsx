/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import CoverageTree, { PointNode } from "./coveragetree";
import { TreeKey } from "./tree";
import Theme from "@/providers/Theme";
import { Theme as ThemeType } from "@/theme";
import { getCoverageColor } from "@/utils/colors";
import React, { useEffect, useState, useMemo, Component } from "react";

// Constants
const CHART_MARGIN = 16; // Increased margin in pixels around the chart
const MIN_CENTER_RADIUS = 150; // Minimum center circle radius
const MAX_CENTER_RADIUS_RATIO = 0.45; // Maximum center circle as ratio of maxRadius
const MIN_RING_SPACE_RATIO = 0.3; // Minimum space reserved for rings as ratio of maxRadius
const MIN_RING_THICKNESS = 2; // Minimum ring thickness in pixels
const CENTER_PADDING = 16; // Padding inside center circle
const ESTIMATED_CHAR_WIDTH = 7.5; // Average character width at 14px font size
const TEXT_SCALE_MIN = 0.5; // Minimum text scale factor

export type CoverageDonutProps = {
    tree: CoverageTree;
    node: PointNode;
    setSelectedTreeKeys?: (keys: TreeKey[]) => void;
};

type HierarchicalData = {
    name: string;
    value: number;
    children?: HierarchicalData[];
    coverage?: number;
    target?: number;
    hits?: number;
    nodeKey?: TreeKey;
    isCovergroup?: boolean;
};

type SunburstNode = HierarchicalData & {
    depth: number;
    startAngle: number;
    endAngle: number;
};

type ChartDimensions = {
    size: number;
    center: number;
    maxRadius: number;
    centerCircleRadius: number;
    textScaleFactor: number;
};

// Utility functions
// Note: theme parameter is the base stitches theme (themeContext.theme.theme), not the full ThemeType
// Uses the shared color calculation from utils/colors for consistency with the table view
function getCoverageColorForDonut(ratio: number, theme: ThemeType['theme']): string {
    return getCoverageColor(ratio, theme.colors, {
        defaultColor: theme.colors.desaturatedtxt.value
    });
}

function polarToCartesian(radius: number, angle: number): { x: number; y: number } {
    return {
        x: radius * Math.cos(angle - Math.PI / 2),
        y: radius * Math.sin(angle - Math.PI / 2),
    };
}

function arcPath(
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

// Data transformation functions
function buildNode(node: PointNode): HierarchicalData {
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
        // Only include children that have a 'data' property (i.e., are PointNode)
        const children = (node.children as unknown[])
            .filter((child): child is PointNode => !!child && typeof child === 'object' && 'data' in child)
            .map(child => buildNode(child));
        const childrenValue = children.reduce((sum, child) => sum + child.value, 0);
        nodeData.value = Math.max(value, childrenValue);
        nodeData.children = children;
    }

    return nodeData;
}

function buildHierarchicalData(
    tree: CoverageTree,
    node: PointNode,
    theme: ThemeType['theme']
): HierarchicalData | null {
    const isRoot = node.key == CoverageTree.ROOT;

    if (isRoot) {
        const rootNodes = tree.getRoots();
        if (rootNodes.length === 0) {
            return null;
        }

        if (rootNodes.length === 1) {
            return buildNode(rootNodes[0]);
        }

        // Multiple root nodes - create a parent node
        const children = rootNodes.map(n => buildNode(n));
        const totalValue = children.reduce((sum, child) => sum + child.value, 0);
        const totalTarget = children.reduce((sum, child) => sum + (child.target || 0), 0);
        const totalHits = children.reduce((sum, child) => sum + (child.hits || 0), 0);
        const rootCoverage = totalTarget > 0 ? totalHits / totalTarget : 0;

        return {
            name: 'Root',
            value: totalValue,
            children: children,
            nodeKey: CoverageTree.ROOT,
            isCovergroup: true,
            coverage: rootCoverage,
            target: totalTarget,
            hits: totalHits,
        };
    } else {
        return buildNode(node);
    }
}

function calculateTotalCoverage(data: HierarchicalData): { target: number; hits: number } {
    if (data.children) {
        const totals = data.children.reduce(
            (acc, child) => {
                const childTotals = calculateTotalCoverage(child);
                return {
                    target: acc.target + childTotals.target,
                    hits: acc.hits + childTotals.hits,
                };
            },
            { target: data.target || 0, hits: data.hits || 0 }
        );
        return totals;
    }
    return { target: data.target || 0, hits: data.hits || 0 };
}

function flattenData(
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

function getAllNames(data: HierarchicalData): string[] {
    const names = [data.name];
    if (data.children) {
        data.children.forEach(child => {
            names.push(...getAllNames(child));
        });
    }
    return names;
}

function findLongestName(data: HierarchicalData): string {
    const allNames = getAllNames(data);
    return allNames.reduce((longest, name) =>
        name.length > longest.length ? name : longest,
        ''
    );
}

function calculateChartDimensions(
    containerSize: { width: number; height: number },
    longestName: string,
    maxDepth: number
): ChartDimensions {
    const availableSize = Math.min(containerSize.width, containerSize.height);
    const size = availableSize - (CHART_MARGIN * 2);
    const center = size / 2;
    const maxRadius = size / 2 - CHART_MARGIN;

    // Calculate center circle radius based on longest name
    const estimatedNameWidth = longestName.length * ESTIMATED_CHAR_WIDTH;
    const padding = CENTER_PADDING * 2;
    const calculatedRadius = Math.max(
        MIN_CENTER_RADIUS,
        (estimatedNameWidth + padding) / 2
    );

    // Ensure we leave room for rings
    const maxCenterRadius = maxRadius * MAX_CENTER_RADIUS_RATIO;
    const minRingSpace = maxRadius * MIN_RING_SPACE_RATIO;
    const maxAllowedCenterRadius = maxRadius - minRingSpace;

    const centerCircleRadius = Math.min(
        calculatedRadius,
        maxCenterRadius,
        maxAllowedCenterRadius
    );

    // Calculate text scale factor if center circle was reduced
    const needsTextAdjustment = calculatedRadius > centerCircleRadius;
    const textScaleFactor = needsTextAdjustment
        ? Math.max(TEXT_SCALE_MIN, centerCircleRadius / calculatedRadius)
        : 1;

    return {
        size,
        center,
        maxRadius,
        centerCircleRadius,
        textScaleFactor,
    };
}

function calculateRingRadii(
    depth: number,
    maxDepth: number,
    startInnerRadius: number,
    maxRadius: number
): { innerRadius: number; outerRadius: number } | null {
    const totalLevels = Math.max(1, maxDepth);
    const availableRadius = maxRadius - startInnerRadius;

    // Calculate ideal radius step, but ensure we can fit all rings
    const idealRadiusStep = availableRadius / totalLevels;
    const radiusStep = Math.max(MIN_RING_THICKNESS, idealRadiusStep);

    // For the outermost ring, ensure it reaches maxRadius
    if (depth === maxDepth) {
        const outerRadius = maxRadius;
        // Calculate inner radius based on previous rings
        // For inner rings, we use: innerRadius = startInnerRadius + (depth - 1) * radiusStep
        // So for the outer ring, we want the inner radius to be where the previous ring ended
        const innerRadius = startInnerRadius + (depth - 1) * radiusStep;

        // Ensure minimum thickness, but don't exceed maxRadius
        const minInnerRadius = outerRadius - Math.max(MIN_RING_THICKNESS, idealRadiusStep);
        const finalInnerRadius = Math.max(innerRadius, minInnerRadius);

        // Validate dimensions
        if (finalInnerRadius >= outerRadius || finalInnerRadius < startInnerRadius) {
            return null;
        }

        return { innerRadius: finalInnerRadius, outerRadius };
    }

    // For inner rings, use standard calculation
    let innerRadius = startInnerRadius + (depth - 1) * radiusStep;
    let outerRadius = innerRadius + radiusStep;

    // Ensure minimum ring thickness
    if (outerRadius - innerRadius < MIN_RING_THICKNESS) {
        outerRadius = innerRadius + MIN_RING_THICKNESS;
    }

    // Clamp to maxRadius (shouldn't happen for inner rings, but safety check)
    if (outerRadius > maxRadius) {
        outerRadius = maxRadius;
        if (outerRadius - MIN_RING_THICKNESS >= startInnerRadius) {
            innerRadius = outerRadius - MIN_RING_THICKNESS;
        }
    }

    // Validate dimensions
    if (innerRadius >= outerRadius || innerRadius < startInnerRadius) {
        return null;
    }

    return { innerRadius, outerRadius };
}

// Error boundary component
class ErrorBoundary extends Component<
    { children: React.ReactNode; fallback: React.ReactNode },
    { hasError: boolean }
> {
    constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Chart error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback;
        }
        return this.props.children;
    }
}

// Center info component
function CenterInfo({
    hoveredNode,
    centerRadius,
    textScaleFactor,
    theme,
}: {
    hoveredNode: SunburstNode;
    centerRadius: number;
    textScaleFactor: number;
    theme: ThemeType['theme'];
}) {
    const centerSize = centerRadius * 2;

    return (
        <g>
            <circle
                cx={0}
                cy={0}
                r={centerRadius}
                fill={theme.colors.secondarybg.value}
                fillOpacity={0.95}
                stroke={theme.colors.secondarybg.value}
                strokeWidth={2}
            />
            <foreignObject
                x={-centerRadius}
                y={-centerRadius}
                width={centerSize}
                height={centerSize}
            >
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: `${CENTER_PADDING}px`,
                        boxSizing: 'border-box',
                        textAlign: 'center',
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            fontSize: `${12 * textScaleFactor}px`,
                            color: theme.colors.desaturatedtxt.value,
                            textTransform: 'uppercase',
                            fontWeight: 'bold',
                            marginBottom: `${10 * textScaleFactor}px`,
                            lineHeight: '1.3',
                            flexShrink: 0,
                        }}
                    >
                        {hoveredNode.isCovergroup ? 'Covergroup' : 'Coverpoint'}
                    </div>
                    <div
                        style={{
                            fontSize: `${14 * textScaleFactor}px`,
                            color: theme.colors.primarytxt.value,
                            fontWeight: 'bold',
                            marginBottom: `${12 * textScaleFactor}px`,
                            wordBreak: 'break-word',
                            overflowWrap: 'break-word',
                            maxWidth: '100%',
                            lineHeight: '1.4',
                            flexShrink: 1,
                            minHeight: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                        }}
                        title={hoveredNode.name}
                        aria-label={hoveredNode.name}
                    >
                        {hoveredNode.name}
                    </div>
                    <div style={{ flexShrink: 0 }}>
                        {hoveredNode.coverage !== undefined && (
                            <>
                                <div
                                    style={{
                                        fontSize: `${12 * textScaleFactor}px`,
                                        color: theme.colors.primarytxt.value,
                                        marginBottom: `${5 * textScaleFactor}px`,
                                        lineHeight: '1.3',
                                    }}
                                >
                                    Coverage: {(hoveredNode.coverage * 100).toFixed(1)}%
                                </div>
                                <div
                                    style={{
                                        fontSize: `${12 * textScaleFactor}px`,
                                        color: theme.colors.primarytxt.value,
                                        marginBottom: `${5 * textScaleFactor}px`,
                                        lineHeight: '1.3',
                                    }}
                                >
                                    Target: {hoveredNode.target?.toLocaleString()}
                                </div>
                                <div
                                    style={{
                                        fontSize: `${12 * textScaleFactor}px`,
                                        color: theme.colors.primarytxt.value,
                                        marginBottom: `${10 * textScaleFactor}px`,
                                        lineHeight: '1.3',
                                    }}
                                >
                                    Hits: {hoveredNode.hits?.toLocaleString()}
                                </div>
                            </>
                        )}
                        {hoveredNode.coverage === undefined && (
                            <div
                                style={{
                                    fontSize: `${11 * textScaleFactor}px`,
                                    color: theme.colors.primarytxt.value,
                                    marginBottom: `${12 * textScaleFactor}px`,
                                }}
                            >
                                Value: {hoveredNode.value}
                            </div>
                        )}
                    </div>
                    {hoveredNode.nodeKey && (
                        <div
                            style={{
                                fontSize: `${10 * textScaleFactor}px`,
                                color: theme.colors.accentbg.value,
                                marginTop: `${6 * textScaleFactor}px`,
                                cursor: 'pointer',
                                lineHeight: '1.2',
                            }}
                        >
                            Click to navigate
                        </div>
                    )}
                </div>
            </foreignObject>
        </g>
    );
}

// Main component
function CoverageDonutInner({
    tree,
    node,
    themeContext,
    setSelectedTreeKeys,
}: CoverageDonutProps & {
    themeContext: {
        theme: ThemeType;
        setTheme: (theme: any) => void;
    };
}) {
    const theme = themeContext.theme.theme;
    const [mounted, setMounted] = useState(false);
    const isGridMode = !setSelectedTreeKeys;
    const [isGridHovered, setIsGridHovered] = useState(false);
    const [hoveredNode, setHoveredNode] = useState<SunburstNode | null>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState(() => {
        if (typeof window !== 'undefined') {
            return {
                width: window.innerWidth * 0.8,
                height: window.innerHeight * 0.8,
            };
        }
        return { width: 800, height: 600 };
    });

    useEffect(() => {
        setMounted(true);
        const updateSize = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const padding = 40;
                setContainerSize({
                    width: Math.max(260, rect.width - padding),
                    height: Math.max(260, rect.height - padding),
                });
            } else {
                setContainerSize({
                    width: window.innerWidth * 0.8,
                    height: window.innerHeight * 0.8,
                });
            }
        };
        updateSize();
        const timeout1 = setTimeout(updateSize, 0);
        const timeout2 = setTimeout(updateSize, 100);
        window.addEventListener('resize', updateSize);
        return () => {
            window.removeEventListener('resize', updateSize);
            clearTimeout(timeout1);
            clearTimeout(timeout2);
        };
    }, []);

    const hierarchicalData = useMemo(
        () => buildHierarchicalData(tree, node, theme),
        [tree, node.key, theme]
    );
    if (!hierarchicalData) {
        return (
            <div
                style={{
                    padding: '24px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    color: theme.colors.desaturatedtxt.value,
                }}
            >
                No coverage data available
            </div>
        );
    }
    const totals = useMemo(
        () => calculateTotalCoverage(hierarchicalData),
        [hierarchicalData]
    );
    const overallCoverage = totals.target > 0 ? totals.hits / totals.target : 0;
    const flatData = useMemo(() => {
        return flattenData(hierarchicalData, 0, 0, hierarchicalData.value);
    }, [hierarchicalData]);
    const longestName = useMemo(
        () => findLongestName(hierarchicalData),
        [hierarchicalData]
    );
    const maxDepth = useMemo(() => {
        return Math.max(...flatData.map(n => n.depth).filter(d => d > 0), 0);
    }, [flatData]);
    const dimensions = useMemo(
        () => calculateChartDimensions(containerSize, longestName, maxDepth),
        [containerSize, longestName, maxDepth]
    );
    const handleNodeClick = (node: SunburstNode) => {
        if (node.nodeKey && setSelectedTreeKeys) {
            setSelectedTreeKeys([node.nodeKey]);
        }
    };
    if (!mounted) {
        return null;
    }
    const startInnerRadius = dimensions.centerCircleRadius + 2;

    // Only apply minHeight/height in single-donut mode
    // In grid mode, highlight the whole donut on hover/focus
    if (isGridMode) {
        // Grid mode: render a non-interactive donut with whole-donut highlight
        return (
            <div
                ref={containerRef}
                style={{
                    width: '100%',
                    height: '100%',
                    minHeight: 180,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    cursor: 'pointer',
                    outline: isGridHovered ? `2px solid ${theme.colors.accentbg.value}` : 'none',
                    borderRadius: 12,
                    transition: 'outline 0.15s',
                }}
                tabIndex={0}
                onMouseEnter={() => setIsGridHovered(true)}
                onMouseLeave={() => setIsGridHovered(false)}
                onFocus={() => setIsGridHovered(true)}
                onBlur={() => setIsGridHovered(false)}
            >
                <svg
                    width={dimensions.size}
                    height={dimensions.size}
                    viewBox={`0 0 ${dimensions.size} ${dimensions.size}`}
                    style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}
                >
                    <g transform={`translate(${dimensions.center},${dimensions.center})`}>
                        {/* Render all donut segments as a single group, no per-segment hover */}
                        {flatData.filter(n => n.depth > 0).map((n, idx) => {
                            const ring = calculateRingRadii(
                                n.depth,
                                maxDepth,
                                startInnerRadius,
                                dimensions.maxRadius
                            );
                            if (!ring) return null;
                            const color = getCoverageColorForDonut(
                                n.coverage ?? 0,
                                theme
                            );
                            return (
                                <path
                                    key={n.nodeKey || idx}
                                    d={arcPath(
                                        ring.innerRadius,
                                        ring.outerRadius,
                                        n.startAngle,
                                        n.endAngle
                                    )}
                                    fill={color}
                                    fillOpacity={isGridHovered ? 0.95 : 0.8}
                                    stroke={theme.colors.secondarybg.value}
                                    strokeWidth={1.5}
                                    style={{
                                        transition: 'fill-opacity 0.15s',
                                    }}
                                />
                            );
                        })}
                    </g>
                </svg>
                {/* Only show the root node's name below the donut */}
                <div
                    style={{
                        marginTop: 10,
                        textAlign: 'center',
                        color: theme.colors.primarytxt.value,
                        fontSize: 14,
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: dimensions.size,
                    }}
                    title={hierarchicalData.name}
                >
                    {hierarchicalData.name}
                </div>
            </div>
        );
    }

    // Single-donut mode: render interactive donut
    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '100%',
                minHeight: 480, // Increased minHeight
                padding: 24, // Add padding to prevent clipping
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                boxSizing: 'border-box',
            }}
        >
            <svg
                width={dimensions.size}
                height={dimensions.size}
                viewBox={`0 0 ${dimensions.size} ${dimensions.size}`}
                style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}
            >
                <g transform={`translate(${dimensions.center},${dimensions.center})`}>
                    {/* Render donut segments */}
                    {flatData.filter(n => n.depth > 0).map((n, idx) => {
                        const ring = calculateRingRadii(
                            n.depth,
                            maxDepth,
                            startInnerRadius,
                            dimensions.maxRadius
                        );
                        if (!ring) return null;
                        const color = getCoverageColorForDonut(
                            n.coverage ?? 0,
                            theme
                        );
                        const isHovered = hoveredNode && hoveredNode.nodeKey === n.nodeKey;
                        return (
                            <path
                                key={n.nodeKey || idx}
                                d={arcPath(
                                    ring.innerRadius,
                                    ring.outerRadius,
                                    n.startAngle,
                                    n.endAngle
                                )}
                                fill={color}
                                fillOpacity={isHovered ? 0.95 : 0.8}
                                stroke={theme.colors.secondarybg.value}
                                strokeWidth={1.5}
                                style={{
                                    cursor: n.nodeKey ? 'pointer' : 'default',
                                    transition: 'fill-opacity 0.15s',
                                }}
                                onMouseEnter={() => setHoveredNode(n)}
                                onMouseLeave={() => setHoveredNode(null)}
                                onClick={() => handleNodeClick(n)}
                                tabIndex={n.nodeKey ? 0 : -1}
                                aria-label={n.name}
                            />
                        );
                    })}
                    {/* Center info */}
                    {hoveredNode ? (
                        <CenterInfo
                            hoveredNode={hoveredNode}
                            centerRadius={dimensions.centerCircleRadius}
                            textScaleFactor={dimensions.textScaleFactor}
                            theme={theme}
                        />
                    ) : (
                        <CenterInfo
                            hoveredNode={flatData[0]}
                            centerRadius={dimensions.centerCircleRadius}
                            textScaleFactor={dimensions.textScaleFactor}
                            theme={theme}
                        />
                    )}
                </g>
            </svg>
            {/* Stats below donut */}
            <div
                style={{
                    marginTop: 18,
                    textAlign: 'center',
                    color: theme.colors.desaturatedtxt.value,
                    fontSize: 15,
                    fontWeight: 400,
                }}
            >
                <div>
                    <b>Overall Coverage:</b> {(overallCoverage * 100).toFixed(1)}%
                </div>
                <div>Target: {totals.target.toLocaleString()}</div>
                <div>Hits: {totals.hits.toLocaleString()}</div>
            </div>
        </div>
    );
}

export function CoverageDonut({
    tree,
    node,
    setSelectedTreeKeys,
}: CoverageDonutProps) {
    return (
        <Theme.Consumer>
            {(themeContextRaw) => {
                const isRoot = node.key === CoverageTree.ROOT;
                const roots = tree.getRoots();
                if (isRoot && roots.length > 1) {
                    // Grid layout for multiple root donuts
                    return (
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                                gap: '32px',
                                width: '100%',
                                alignItems: 'start',
                                justifyItems: 'center',
                                padding: '24px 0',
                                background: 'none',
                            }}
                        >
                            {roots.map((rootNode) => (
                                <div
                                    key={rootNode.key}
                                    style={{ cursor: 'pointer', width: '100%', maxWidth: 320, background: 'none', boxShadow: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                                    onClick={() => setSelectedTreeKeys && setSelectedTreeKeys([rootNode.key])}
                                    tabIndex={0}
                                    role="button"
                                    aria-label={`Show donut for ${typeof rootNode.title === 'function' ? '[unnamed]' : rootNode.title}`}
                                >
                                    <div style={{ width: '100%', background: 'none', boxShadow: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                        <CoverageDonutInner
                                            tree={tree}
                                            node={rootNode}
                                            themeContext={themeContextRaw}
                                            setSelectedTreeKeys={undefined}
                                        />
                                    </div>
                                    <div
                                        style={{
                                            marginTop: '12px',
                                            fontSize: '15px',
                                            color: themeContextRaw.theme.theme.colors.primarytxt.value,
                                            textAlign: 'center',
                                            fontWeight: 500,
                                            wordBreak: 'break-word',
                                            maxWidth: '90%',
                                            lineHeight: 1.3,
                                        }}
                                    >
                                        {typeof rootNode.title === 'function' ? '[unnamed]' : rootNode.title}
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                }
                // Default: single donut view
                return (
                    <CoverageDonutInner
                        tree={tree}
                        node={node}
                        themeContext={themeContextRaw}
                        setSelectedTreeKeys={setSelectedTreeKeys}
                    />
                );
            }}
        </Theme.Consumer>
    );
}
