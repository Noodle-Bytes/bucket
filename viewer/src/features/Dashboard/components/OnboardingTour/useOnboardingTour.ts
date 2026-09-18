/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
    hasCompletedOnboardingTour,
    markOnboardingTourCompleted,
    shouldAutoStartOnboardingTour,
} from "./tourStorage";

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

    const startTour = useCallback(() => {
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
        startTour();
    }, [sessionRestoreComplete, isEmpty, isLoading, open, startTour]);

    return { open, startTour, closeTour };
}
