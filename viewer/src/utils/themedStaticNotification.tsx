/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import type React from "react";
import { notification } from "antd";
import type { ArgsProps } from "antd/es/notification/interface";
import { getThemePreference } from "@/utils/themePreference";

let configured = false;

function readableNode(
    node: React.ReactNode,
    color: string,
    fontSize: number,
    fontWeight: number = 500,
): React.ReactNode {
    if (typeof node === "string" || typeof node === "number") {
        return (
            <span style={{ color, fontSize, fontWeight, lineHeight: 1.45 }}>
                {node}
            </span>
        );
    }
    return node;
}

function buildCloseCountdownIcon(
    durationSeconds: number | null | undefined,
    ringColor: string,
    iconColor: string,
): React.ReactNode {
    const radius = 8;
    const size = 20;
    const circumference = 2 * Math.PI * radius;

    return (
        <span style={{ display: "inline-flex", width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={ringColor}
                    strokeWidth="1.5"
                    opacity="0.35"
                />
                <circle
                    className="bucket-notification-close-ring"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={ringColor}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeDasharray={`${circumference}`}
                    strokeDashoffset={0}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    style={
                        durationSeconds && durationSeconds > 0
                            ? {
                                  animation: `bucketNotificationRing ${durationSeconds}s linear forwards`,
                              }
                            : undefined
                    }
                />
                <line
                    className="bucket-notification-close-x"
                    x1="7.2"
                    y1="7.2"
                    x2="12.8"
                    y2="12.8"
                    stroke={iconColor}
                    strokeWidth="1.9"
                    strokeLinecap="round"
                />
                <line
                    className="bucket-notification-close-x"
                    x1="12.8"
                    y1="7.2"
                    x2="7.2"
                    y2="12.8"
                    stroke={iconColor}
                    strokeWidth="1.9"
                    strokeLinecap="round"
                />
                <line
                    className="bucket-notification-close-pause"
                    x1="8.4"
                    y1="7.2"
                    x2="8.4"
                    y2="12.8"
                    stroke={iconColor}
                    strokeWidth="1.9"
                    strokeLinecap="round"
                />
                <line
                    className="bucket-notification-close-pause"
                    x1="11.6"
                    y1="7.2"
                    x2="11.6"
                    y2="12.8"
                    stroke={iconColor}
                    strokeWidth="1.9"
                    strokeLinecap="round"
                />
            </svg>
        </span>
    );
}

function withThemedNotification(args: ArgsProps): ArgsProps {
    if (!configured) {
        // Disable stacked-card underlays that can appear as a mismatched white block.
        notification.config({
            placement: "bottom",
            maxCount: 1,
            pauseOnHover: true,
        });
        configured = true;
    }

    const pref = getThemePreference();
    const themeName = pref.name;
    const isDark = themeName === "dark" || themeName.startsWith("auto (dark)");
    const isLight = themeName === "light" || themeName.startsWith("auto (light)");
    const bg = isLight ? "#e8f1ff" : isDark ? "#1f4f95" : "#395f9f";
    const border = isLight ? "#b9d0ff" : isDark ? "#2f6dc2" : "#4e75b7";
    const txt = isLight ? "#122f5f" : "#f2f7ff";
    const muted = isLight ? "#264a84" : "rgba(242, 247, 255, 0.9)";
    const duration = args.duration === undefined ? 4.5 : args.duration;
    const width = "calc(100vw - 32px)";

    return {
        ...args,
        placement: args.placement ?? "bottom",
        duration,
        pauseOnHover: args.pauseOnHover ?? true,
        message: readableNode(args.message, txt, 14, 600),
        description:
            args.description === undefined
                ? undefined
                : readableNode(args.description, muted, 13, 500),
        className: ["bucket-themed-notification", pref.theme.className, args.className]
            .filter(Boolean)
            .join(" "),
        closeIcon: args.closeIcon ?? buildCloseCountdownIcon(duration, txt, txt),
        showProgress: false,
        closable: true,
        style: {
            backgroundColor: bg,
            border: `1px solid ${border}`,
            borderRadius: 12,
            color: txt,
            width,
            maxWidth: width,
            overflow: "hidden",
            backgroundClip: "padding-box",
            boxShadow: "0 8px 22px rgba(0, 0, 0, 0.28)",
            ...args.style,
        },
    };
}

export function notifySuccess(args: ArgsProps) {
    notification.success(withThemedNotification(args));
}

export function notifyError(args: ArgsProps) {
    notification.error(withThemedNotification(args));
}

export function notifyWarning(args: ArgsProps) {
    notification.warning(withThemedNotification(args));
}

export function notifyInfo(args: ArgsProps) {
    notification.info(withThemedNotification(args));
}
