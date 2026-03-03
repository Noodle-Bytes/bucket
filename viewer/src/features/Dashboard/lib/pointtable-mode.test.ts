/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { expect, test } from "vitest";

import { POINT_FULL_FEATURE_ROW_LIMIT } from "./perf-config";
import {
    acknowledgeLargeModeWarning,
    createInitialLargeModeOverrideState,
    resolvePointTableMode,
    withForcedFullFeatures,
} from "./pointtable-mode";

test("mode resolves to auto at and below threshold", () => {
    const state = createInitialLargeModeOverrideState(false);
    expect(resolvePointTableMode(POINT_FULL_FEATURE_ROW_LIMIT, state)).toBe("auto");
    expect(resolvePointTableMode(1024, state)).toBe("auto");
});

test("mode resolves to large above threshold by default", () => {
    const state = createInitialLargeModeOverrideState(false);
    expect(resolvePointTableMode(POINT_FULL_FEATURE_ROW_LIMIT + 1, state)).toBe(
        "large",
    );
});

test("mode resolves to forced_full when user forces full features", () => {
    const state = withForcedFullFeatures(
        createInitialLargeModeOverrideState(false),
        true,
    );
    expect(resolvePointTableMode(POINT_FULL_FEATURE_ROW_LIMIT + 1, state)).toBe(
        "forced_full",
    );
});

test("warning acknowledgement state is tracked", () => {
    const initial = createInitialLargeModeOverrideState(false);
    const acknowledged = acknowledgeLargeModeWarning(initial);
    expect(initial.warningAcknowledged).toBe(false);
    expect(acknowledged.warningAcknowledged).toBe(true);
});
