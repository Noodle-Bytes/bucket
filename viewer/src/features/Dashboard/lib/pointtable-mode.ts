/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import {
    LargeModeOverrideState,
    PointTableMode,
    POINT_FULL_FEATURE_ROW_LIMIT,
} from "./perf-config";

export function createInitialLargeModeOverrideState(
    warningAcknowledged = false,
): LargeModeOverrideState {
    return {
        forced: false,
        warningAcknowledged,
    };
}

export function resolvePointTableMode(
    rowCount: number,
    override: LargeModeOverrideState,
    limit: number = POINT_FULL_FEATURE_ROW_LIMIT,
): PointTableMode {
    if (rowCount <= limit) {
        return "auto";
    }
    return override.forced ? "forced_full" : "large";
}

export function withForcedFullFeatures(
    state: LargeModeOverrideState,
    forced: boolean,
): LargeModeOverrideState {
    return {
        ...state,
        forced,
    };
}

export function acknowledgeLargeModeWarning(
    state: LargeModeOverrideState,
): LargeModeOverrideState {
    return {
        ...state,
        warningAcknowledged: true,
    };
}
