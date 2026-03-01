/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

// SPDX-License-Identifier: MIT
// Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

import React from "react";
import { CENTER_PADDING } from "./coveragedonut-constants";
import { SunburstNode } from "./coveragedonut-utils";
import { Theme as ThemeType } from "@/theme";

export function CenterInfo({
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
    if (!hoveredNode) return null;
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
