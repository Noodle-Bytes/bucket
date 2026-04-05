/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

export const POINT_FULL_FEATURE_ROW_LIMIT = 50_000;
export const LARGE_TABLE_SCROLL_Y = 620;

export type PointTableMode = "auto" | "large" | "forced_full";

export type LargeModeOverrideState = {
    forced: boolean;
    warningAcknowledged: boolean;
};
