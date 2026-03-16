/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import CoverageTree, { PointNode } from "./coveragetree";
import { TreeKey } from "./tree";
import Theme from "@/providers/Theme";
import { Theme as ThemeType } from "@/theme";
import React, { useEffect, useState, useMemo } from "react";
// Import split-out modules
import {
    getCoverageColorForDonut,
    arcPath,
    buildNode,
    flattenData,
    SunburstNode,
} from "./coveragedonut-utils";
import { getCoverageColor } from "@/utils/colors";
import { CHART_MARGIN } from "./coveragedonut-constants";
import { CenterInfo } from "./coveragedonut-centerinfo";

export type CoverageDonutProps = {
    tree: CoverageTree;
    node: PointNode;
    setSelectedTreeKeys?: (keys: TreeKey[]) => void;
};

function calculateRingRadii(depth: number, maxDepth: number, startInnerRadius: number, maxRadius: number) {
    if (maxDepth === 0) return null;
    const ringThickness = (maxRadius - startInnerRadius) / maxDepth;
    const innerRadius = startInnerRadius + ringThickness * (depth - 1);
    const outerRadius = innerRadius + ringThickness;
    return { innerRadius, outerRadius };
}

function CoverageDonutInner({
    node,
    themeContext,
    setSelectedTreeKeys,
}: {
    node: PointNode;
    themeContext: {
        theme: ThemeType;
        setTheme: (theme: any) => void;
    };
    setSelectedTreeKeys?: (keys: TreeKey[]) => void;
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

    // Build hierarchical data from node
    const hierarchicalData = useMemo(
        () => buildNode(node),
        [node]
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
    // Calculate totals
    const totals = useMemo(() => {
        let hits = 0;
        let target = 0;
        function walk(node: typeof hierarchicalData) {
            if (typeof node.target === 'number' && typeof node.hits === 'number') {
                hits += node.hits;
                target += node.target;
            }
            if (node.children) node.children.forEach(walk);
        }
        walk(hierarchicalData);
        return { hits, target };
    }, [hierarchicalData]);
    const overallCoverage = totals.target > 0 ? totals.hits / totals.target : 0;
    const flatData = useMemo(() => {
        return flattenData(hierarchicalData, 0, 0, hierarchicalData.value);
    }, [hierarchicalData]);
    const maxDepth = useMemo(() => {
        return Math.max(...flatData.map(n => n.depth).filter(d => d > 0), 0);
    }, [flatData]);
    // Chart dimensions (dummy for now)
    const dimensions = useMemo(() => {
        const size = Math.min(containerSize.width, containerSize.height);
        const center = size / 2;
        const centerCircleRadius = Math.max(60, size * 0.18);
        const maxRadius = center - CHART_MARGIN;
        const textScaleFactor = 1;
        return { size, center, centerCircleRadius, maxRadius, textScaleFactor };
    }, [containerSize]);
    const handleNodeClick = (node: SunburstNode) => {
        if (node.nodeKey && setSelectedTreeKeys) {
            setSelectedTreeKeys([node.nodeKey]);
        }
    };
    if (!mounted) {
        return null;
    }
    const startInnerRadius = dimensions.centerCircleRadius + 2;

    if (isGridMode) {
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
                                theme,
                                getCoverageColor
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
                minHeight: 480,
                padding: 24,
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
                            theme,
                            getCoverageColor
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
                                    onKeyDown={e => {
                                        if ((e.key === 'Enter' || e.key === ' ') && setSelectedTreeKeys) {
                                            setSelectedTreeKeys([rootNode.key]);
                                            e.preventDefault();
                                        }
                                    }}
                                >
                                    <div style={{ width: '100%', background: 'none', boxShadow: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                        <CoverageDonutInner
                                            node={rootNode}
                                            themeContext={themeContextRaw}
                                            setSelectedTreeKeys={undefined}
                                        />
                                    </div>
                                    {/* Show root node name below each donut in grid view */}
                                    <div
                                        className="donut-grid-title"
                                        style={{
                                            color: themeContextRaw.theme.theme.colors.primarytxt.value
                                        }}
                                        title={typeof rootNode.title === 'function' ? '[unnamed]' : String(rootNode.title)}
                                    >
                                        {typeof rootNode.title === 'function' ? '[unnamed]' : String(rootNode.title)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                }
                // Default: single donut view
                return (
                    <CoverageDonutInner
                        node={node}
                        themeContext={themeContextRaw}
                        setSelectedTreeKeys={setSelectedTreeKeys}
                    />
                );
            }}
        </Theme.Consumer>
    );
}
