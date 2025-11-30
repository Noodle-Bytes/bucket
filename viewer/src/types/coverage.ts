/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved
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
};

type Reader = {
    read: (recordId: number) => Promise<Readout>;
    read_all: () => AsyncGenerator<Readout>;
}
