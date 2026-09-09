/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

type PointTuple = {
    start: number;
    depth: number;
    end: number;
    axis_start: number;
    axis_end: number;
    axis_value_start: number;
    axis_value_end: number;
    goal_start: number;
    goal_end: number;
    bucket_start: number;
    bucket_end: number;
    target: number;
    target_buckets: number;
    name: string;
    description: string;
    tier?: number | null;
    tags?: string;
    motivation?: string;
};

type BucketGoalTuple = {
    start: number;
    goal: number;
};

type AxisTuple = {
    start: number;
    value_start: number;
    value_end: number;
    name: string;
    description: string;
};

type AxisValueTuple = {
    start: number;
    value: string;
};

type GoalTuple = {
    start: number;
    target: number;
    name: string;
    description: string;
};

type PointHitTuple = {
    start: number;
    depth: number;
    hits: number;
    hit_buckets: number;
    full_buckets: number;
    /**
     * Storage format 3+: buckets in the point excluded from scoring by a
     * waiver, and the sum of their hit targets. Older files omit both (0).
     */
    waived_buckets?: number;
    waived_target?: number;
};

/** A waived bucket: `start` is the global bucket index. */
type BucketWaiverTuple = {
    start: number;
    reason: string;
};

type BucketHitTuple = {
    start: number;
    hits: number;
};

type Readout = {
    get_def_sha: () => string;
    get_rec_sha: () => string;
    get_source: () => string | null;
    get_source_key: () => string | null;
    get_bucket_version: () => string;
    /** Storage format the record was written with; null when not stated. */
    get_format_version?: () => number | null;
    iter_points: (
        start?: number,
        end?: number | null,
        depth?: number,
    ) => Generator<PointTuple>;
    iter_bucket_goals: (
        start: number,
        end: number | null,
    ) => Generator<BucketGoalTuple>;
    iter_axes: (start: number, end: number | null) => Generator<AxisTuple>;
    iter_axis_values: (
        start: number,
        end: number | null,
    ) => Generator<AxisValueTuple>;
    iter_goals: (start: number, end: number | null) => Generator<GoalTuple>;
    iter_point_hits: (
        start?: number,
        end?: number | null,
        depth?: number,
    ) => Generator<PointHitTuple>;
    iter_bucket_hits: (
        start: number,
        end: number | null,
    ) => Generator<BucketHitTuple>;
    /**
     * Waived buckets whose global index lies in [start, end). Unlike
     * bucket_hit the table is sparse (one row per waived bucket), so the
     * range filters by bucket index rather than by row position.
     */
    iter_bucket_waivers: (
        start: number,
        end: number | null,
    ) => Generator<BucketWaiverTuple>;
};

// Ambient (non-module) file: Reader is consumed by readers.ts via the global scope.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type Reader = {
    read: (recordId: number) => Promise<Readout>;
    read_all: () => AsyncGenerator<Readout>;
}
