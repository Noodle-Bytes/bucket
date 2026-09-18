/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { confirmThemed } from "@/utils/themedStaticModal";

import {
    hasCompletedOnboardingTour,
    markOnboardingTourCompleted,
    shouldAutoStartOnboardingTour,
} from "./tourStorage";

/** Survives Strict Mode remount so we only ask once per page load. */
let tourOfferInFlight = false;

export function useOnboardingTour({
    isEmpty,
    isLoading,
    sessionRestoreComplete,
    onPrepare,
    onRestore,
}: {
    isEmpty: boolean;
    isLoading: boolean;
    sessionRestoreComplete: boolean;
    onPrepare?: () => void;
    onRestore?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const restoreReadyRef = useRef(false);
    const startTimerRef = useRef<number | null>(null);
    const offerModalRef = useRef<{ destroy: () => void } | null>(null);

    const startTour = useCallback(() => {
        offerModalRef.current?.destroy();
        offerModalRef.current = null;
        onPrepare?.();
        if (startTimerRef.current != null) {
            window.clearTimeout(startTimerRef.current);
        }
        startTimerRef.current = window.setTimeout(() => {
            startTimerRef.current = null;
            setOpen(true);
        }, 280);
    }, [onPrepare]);

    const closeTour = useCallback(() => {
        setOpen(false);
        onRestore?.();
        markOnboardingTourCompleted();
    }, [onRestore]);

    useEffect(() => {
        return () => {
            if (startTimerRef.current != null) {
                window.clearTimeout(startTimerRef.current);
            }
            offerModalRef.current?.destroy();
            offerModalRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!sessionRestoreComplete) {
            return;
        }
        if (!restoreReadyRef.current) {
            restoreReadyRef.current = true;
            return;
        }
        if (
            !shouldAutoStartOnboardingTour({
                restoreAcknowledged: true,
                isEmpty,
                isLoading,
                open,
                completed: hasCompletedOnboardingTour(),
            })
        ) {
            return;
        }
        if (tourOfferInFlight) {
            return;
        }
        tourOfferInFlight = true;
        offerModalRef.current = confirmThemed({
            title: "Take a quick tour?",
            content: "A short walkthrough of the viewer. You can skip it at any time.",
            okText: "Start tour",
            cancelText: "Not now",
            centered: true,
            maskClosable: false,
            onOk: () => {
                offerModalRef.current = null;
                startTour();
            },
            onCancel: () => {
                offerModalRef.current = null;
                markOnboardingTourCompleted();
            },
        });
    }, [sessionRestoreComplete, isEmpty, isLoading, open, startTour]);

    return { open, startTour, closeTour };
}
