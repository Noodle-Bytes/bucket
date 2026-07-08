/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

// Builders for minimal JSON coverage payloads, shared by the reader and
// file-loader tests.

export type JsonPayload = {
    tables: Record<string, string[]>;
    definitions: Record<string, unknown>[];
    records: Record<string, unknown>[];
};

export function createCommonTables(pointColumns: string[]): Record<string, string[]> {
    return {
        point: pointColumns,
        axis: ["start", "value_start", "value_end", "name", "description"],
        axis_value: ["start", "value"],
        goal: ["start", "target", "name", "description"],
        bucket_goal: ["start", "goal"],
        point_hit: ["start", "depth", "hits", "hit_buckets", "full_buckets"],
        bucket_hit: ["start", "hits"],
    };
}

export const BASE_POINT_COLUMNS = [
    "start", "depth", "end", "axis_start", "axis_end",
    "axis_value_start", "axis_value_end", "goal_start",
    "goal_end", "bucket_start", "bucket_end", "target",
    "target_buckets", "name", "description",
];

export function createBaseDefinition(pointRow: unknown[]): Record<string, unknown> {
    return {
        sha: "def-a",
        point: [pointRow],
        axis: [[0, 0, 1, "axis", "axis description"]],
        axis_value: [[0, "A"]],
        goal: [[0, 1, "goal", "goal description"]],
        bucket_goal: [[0, 0]],
    };
}

export function createBaseRecord(overrides?: Record<string, unknown>): Record<string, unknown> {
    return {
        def: 0,
        sha: "rec-a",
        point_hit: [[0, 0, 1, 1, 1]],
        bucket_hit: [[0, 1]],
        ...overrides,
    };
}
