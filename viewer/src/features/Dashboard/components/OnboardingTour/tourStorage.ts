/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

export const ONBOARDING_TOUR_STORAGE_KEY = "bucket.dashboard.onboardingTourCompleted";

export function hasCompletedOnboardingTour(): boolean {
    if (typeof localStorage === "undefined") {
        return false;
    }
    try {
        return localStorage.getItem(ONBOARDING_TOUR_STORAGE_KEY) === "true";
    } catch {
        return false;
    }
}

export function markOnboardingTourCompleted(): void {
    if (typeof localStorage === "undefined") {
        return;
    }
    try {
        localStorage.setItem(ONBOARDING_TOUR_STORAGE_KEY, "true");
    } catch {
        // Storage is best effort; skipping the tour still closes it.
    }
}

export function shouldAutoStartOnboardingTour({
    restoreAcknowledged,
    isEmpty,
    isLoading,
    open,
    completed,
}: {
    restoreAcknowledged: boolean;
    isEmpty: boolean;
    isLoading: boolean;
    open: boolean;
    completed: boolean;
}): boolean {
    return restoreAcknowledged && !isEmpty && !isLoading && !open && !completed;
}
