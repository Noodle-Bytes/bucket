/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import { Button, Tour } from "antd";
import type { TourProps } from "antd";
import { useEffect, useRef, useState } from "react";

import { TOUR_ANCHOR } from "./tourAnchors";
import { tourSceneAt } from "./tourScenes";

const SCENE_SETTLE_MS = 350;
const SCENE_SETTLE_OVERLAY_MS = 450;

function tourTarget(anchor: string): HTMLElement {
    if (anchor === TOUR_ANCHOR.waiversPanel) {
        return (
            document.querySelector(".bucket-waivers-drawer .ant-drawer-content")
            ?? document.querySelector(`[data-tour="${anchor}"]`)
        ) as HTMLElement;
    }
    return document.querySelector(`[data-tour="${anchor}"]`) as HTMLElement;
}

function firstTourTarget(...anchors: string[]): HTMLElement {
    for (const anchor of anchors) {
        const node = tourTarget(anchor);
        if (node) {
            return node;
        }
    }
    return null as unknown as HTMLElement;
}

const TOUR_STEPS: TourProps["steps"] = [
    {
        title: "Records",
        description:
            "Your runs show up in this sidebar. Click through the tree, or search by name. 'tag:' and 'tier:' work as filters too.",
        target: () => tourTarget(TOUR_ANCHOR.tree),
        placement: "right",
    },
    {
        title: "Views",
        description: "Switch the summary between a table and a donut.",
        target: () => tourTarget(TOUR_ANCHOR.views),
        placement: "bottom",
    },
    {
        title: "Coverpoint",
        description:
            "This is one coverpoint. Each row is a bucket, with how many hits it got versus the goal.",
        target: () => tourTarget(TOUR_ANCHOR.content),
        placement: "left",
    },
    {
        title: "Pivot",
        description:
            "Drag axes onto rows or columns to cut the data a different way. The hat will suggest a layout if you don't want to start from scratch.",
        target: () => tourTarget(TOUR_ANCHOR.content),
        placement: "left",
    },
    {
        title: "Waivers",
        description:
            "Waivers temporarily exclude buckets at signoff. Disable or edit a rule here.",
        target: () => firstTourTarget(TOUR_ANCHOR.waiversPanel, TOUR_ANCHOR.waivers),
        placement: "left",
    },
    {
        title: "Compare",
        description:
            "Pick two records to see how they differ.",
        target: () => firstTourTarget(TOUR_ANCHOR.compareToolbar, TOUR_ANCHOR.compare),
        placement: "bottom",
    },
];

export type OnboardingTourProps = {
    open: boolean;
    onClose: () => void;
    onScene?: (step: number) => void;
    rootClassName?: string;
};

export default function OnboardingTour({
    open,
    onClose,
    onScene,
    rootClassName,
}: OnboardingTourProps) {
    const [current, setCurrent] = useState(0);
    const onSceneRef = useRef(onScene);
    const settleTimerRef = useRef<number | null>(null);
    onSceneRef.current = onScene;

    useEffect(() => {
        return () => {
            if (settleTimerRef.current != null) {
                window.clearTimeout(settleTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!open) {
            if (settleTimerRef.current != null) {
                window.clearTimeout(settleTimerRef.current);
                settleTimerRef.current = null;
            }
            setCurrent(0);
            delete document.documentElement.dataset.bucketTour;
            return;
        }
        document.documentElement.dataset.bucketTour = "1";
        onSceneRef.current?.(0);
        return () => {
            delete document.documentElement.dataset.bucketTour;
        };
    }, [open]);

    const goToStep = (next: number) => {
        onSceneRef.current?.(next);
        if (settleTimerRef.current != null) {
            window.clearTimeout(settleTimerRef.current);
        }
        const scene = tourSceneAt(next);
        const delay =
            scene === "waivers" || scene === "compare"
                ? SCENE_SETTLE_OVERLAY_MS
                : SCENE_SETTLE_MS;
        settleTimerRef.current = window.setTimeout(() => {
            settleTimerRef.current = null;
            setCurrent(next);
        }, delay);
    };

    const actionsRender: TourProps["actionsRender"] = (originNode, { current: step, total }) => (
        <>
            {step < total - 1 && (
                <Button size="small" type="text" onClick={onClose}>
                    Skip
                </Button>
            )}
            {originNode}
        </>
    );

    return (
        <Tour
            open={open}
            current={current}
            onChange={goToStep}
            onClose={onClose}
            onFinish={onClose}
            steps={TOUR_STEPS}
            disabledInteraction
            gap={{ offset: 8, radius: 8 }}
            mask={{ color: "rgba(0, 0, 0, 0.55)" }}
            scrollIntoViewOptions={{ block: "nearest", inline: "nearest" }}
            actionsRender={actionsRender}
            rootClassName={rootClassName}
            zIndex={1100}
        />
    );
}
