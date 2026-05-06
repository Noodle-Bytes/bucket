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
    calculateRingRadii,
    computeSunburstVisualMidpoint,
} from "./coveragedonut-utils";
import { getCoverageColor } from "@/utils/colors";
import { BUCKET_DONUT_LAYOUT_EVENT, CHART_MARGIN } from "./coveragedonut-constants";
import { COVERAGE_INFO_SURFACE_RADIUS } from "./coverageInfoChrome";
import { CenterInfo } from "./coveragedonut-centerinfo";

export type CoverageDonutProps = {
    tree: CoverageTree;
    node: PointNode;
    setSelectedTreeKeys?: (keys: TreeKey[]) => void;
};

function CoverageDonutInner({
    node,
    themeContext,
    setSelectedTreeKeys,
}: {
    node: PointNode;
    themeContext: {
        theme: ThemeType;
        setTheme: (theme: ThemeType | null) => void;
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
    }, []);

    useEffect(() => {
        if (!mounted) {
            return;
        }

        let cancelled = false;
        let rafOuter = 0;
        let rafInner = 0;

        const measure = () => {
            cancelAnimationFrame(rafOuter);
            cancelAnimationFrame(rafInner);
            rafOuter = requestAnimationFrame(() => {
                rafInner = requestAnimationFrame(() => {
                    if (cancelled) {
                        return;
                    }
                    const el = containerRef.current;
                    if (!el) {
                        setContainerSize({
                            width: window.innerWidth * 0.8,
                            height: window.innerHeight * 0.8,
                        });
                        return;
                    }
                    const rect = el.getBoundingClientRect();
                    const layoutInset = 0;
                    const viewportBottomPadding = 24;
                    const availableViewportWidth = Math.max(220, rect.width - layoutInset);
                    const viewportHeightCap = Math.max(
                        180,
                        window.innerHeight - rect.top - viewportBottomPadding - layoutInset,
                    );
                    const parentHeightCap =
                        rect.height > 2 ? Math.max(180, rect.height - layoutInset) : viewportHeightCap;
                    const heightBudget = Math.max(220, Math.min(viewportHeightCap, parentHeightCap));

                    setContainerSize({
                        width: availableViewportWidth,
                        height: heightBudget,
                    });
                });
            });
        };

        measure();
        const timeout1 = setTimeout(measure, 0);
        const timeout2 = setTimeout(measure, 120);

        const resizeObserver =
            typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
        const el = containerRef.current;
        if (resizeObserver && el) {
            resizeObserver.observe(el);
            if (el.parentElement) {
                resizeObserver.observe(el.parentElement);
            }
        }

        const onLayoutBump = () => measure();

        window.addEventListener("resize", measure);
        window.addEventListener(BUCKET_DONUT_LAYOUT_EVENT, onLayoutBump);
        return () => {
            cancelled = true;
            cancelAnimationFrame(rafOuter);
            cancelAnimationFrame(rafInner);
            window.removeEventListener("resize", measure);
            window.removeEventListener(BUCKET_DONUT_LAYOUT_EVENT, onLayoutBump);
            clearTimeout(timeout1);
            clearTimeout(timeout2);
            resizeObserver?.disconnect();
        };
    }, [mounted]);

    // Build hierarchical data from node
    const hierarchicalData = useMemo(
        () => buildNode(node),
        [node]
    );
    const flatData = useMemo(() => {
        return flattenData(hierarchicalData, 0, 0, hierarchicalData.value);
    }, [hierarchicalData]);
    const maxDepth = useMemo(() => {
        return Math.max(...flatData.map(n => n.depth).filter(d => d > 0), 0);
    }, [flatData]);
    const dimensions = useMemo(() => {
        const size = Math.max(180, Math.min(containerSize.width, containerSize.height));
        const center = size / 2;
        const centerCircleRadius = Math.max(60, size * 0.18);
        const maxRadius = center - CHART_MARGIN;
        const textScaleFactor = 1;
        return { size, center, centerCircleRadius, maxRadius, textScaleFactor };
    }, [containerSize]);

    const contentMid = useMemo(() => {
        const startInner = dimensions.centerCircleRadius + 2;
        return computeSunburstVisualMidpoint(
            flatData,
            maxDepth,
            startInner,
            dimensions.maxRadius,
            dimensions.centerCircleRadius,
        );
    }, [
        flatData,
        maxDepth,
        dimensions.centerCircleRadius,
        dimensions.maxRadius,
    ]);

    const chartGroupTransform = `translate(${dimensions.center - contentMid.midX},${dimensions.center - contentMid.midY})`;
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
                    borderRadius: COVERAGE_INFO_SURFACE_RADIUS,
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
                    <g transform={chartGroupTransform}>
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
                flex: "1 1 auto",
                width: "100%",
                minHeight: 0,
                height: "100%",
                padding: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                boxSizing: "border-box",
            }}
        >
            <svg
                width={dimensions.size}
                height={dimensions.size}
                viewBox={`0 0 ${dimensions.size} ${dimensions.size}`}
                style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}
            >
                <g transform={chartGroupTransform}>
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
                if (isRoot) {
                    const roots = tree.getRoots();

                    if (roots.length === 0) {
                        return (
                            <div
                                style={{
                                    padding: '24px 0',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    color: themeContextRaw.theme.theme.colors.desaturatedtxt.value,
                                }}
                            >
                                No coverage data available
                            </div>
                        );
                    }

                    if (roots.length === 1) {
                        return (
                            <CoverageDonutInner
                                node={roots[0]}
                                themeContext={themeContextRaw}
                                setSelectedTreeKeys={setSelectedTreeKeys}
                            />
                        );
                    }

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
                                padding: '12px 0',
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
                // Non-root node: single donut view
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
