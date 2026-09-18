/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
    ONBOARDING_TOUR_STORAGE_KEY,
    hasCompletedOnboardingTour,
    markOnboardingTourCompleted,
    shouldAutoStartOnboardingTour,
} from "./tourStorage";

describe("onboarding tour storage", () => {
    const storage = new Map<string, string>();

    beforeEach(() => {
        storage.clear();
        vi.stubGlobal("localStorage", {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => {
                storage.set(key, value);
            },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test("defaults to not completed", () => {
        expect(hasCompletedOnboardingTour()).toBe(false);
    });

    test("round-trips the completed flag", () => {
        markOnboardingTourCompleted();
        expect(storage.get(ONBOARDING_TOUR_STORAGE_KEY)).toBe("true");
        expect(hasCompletedOnboardingTour()).toBe(true);
    });

    test("tolerates a throwing localStorage", () => {
        vi.stubGlobal("localStorage", {
            getItem: () => {
                throw new Error("denied");
            },
            setItem: () => {
                throw new Error("denied");
            },
        });
        expect(hasCompletedOnboardingTour()).toBe(false);
        expect(() => markOnboardingTourCompleted()).not.toThrow();
    });
});

describe("shouldAutoStartOnboardingTour", () => {
    const ready = {
        restoreAcknowledged: true,
        isEmpty: false,
        isLoading: false,
        open: false,
        completed: false,
    };

    test("starts after a user load once restore has been acknowledged", () => {
        expect(shouldAutoStartOnboardingTour(ready)).toBe(true);
    });

    test("does not start on the restored session snapshot", () => {
        expect(shouldAutoStartOnboardingTour({ ...ready, restoreAcknowledged: false })).toBe(false);
    });

    test("does not start while empty, loading, already open, or completed", () => {
        expect(shouldAutoStartOnboardingTour({ ...ready, isEmpty: true })).toBe(false);
        expect(shouldAutoStartOnboardingTour({ ...ready, isLoading: true })).toBe(false);
        expect(shouldAutoStartOnboardingTour({ ...ready, open: true })).toBe(false);
        expect(shouldAutoStartOnboardingTour({ ...ready, completed: true })).toBe(false);
    });
});
