#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

from bucket.rw import ArchiveAccessor, JSONAccessor
from bucket.rw.common import (
    AxisTuple,
    AxisValueTuple,
    BucketGoalTuple,
    BucketHitTuple,
    GoalTuple,
    PointHitTuple,
    PointTuple,
    PuppetReadout,
)


def build_readout(axis_sizes: tuple[int, int, int], source_key: str) -> PuppetReadout:
    axis_a, axis_b, axis_c = axis_sizes
    row_count = axis_a * axis_b * axis_c

    readout = PuppetReadout()
    readout.def_sha = hashlib.sha256(f"fixture-def-{axis_sizes}".encode()).hexdigest()
    readout.rec_sha = hashlib.sha256(f"fixture-rec-{axis_sizes}".encode()).hexdigest()
    readout.source = "perf_fixture"
    readout.source_key = source_key

    axis_value_start = 0
    axis_tuples = []
    axis_values = []

    sizes = [axis_a, axis_b, axis_c]
    names = ["axis_a", "axis_b", "axis_c"]
    descriptions = ["Synthetic axis A", "Synthetic axis B", "Synthetic axis C"]

    running_axis_value_start = axis_value_start
    for axis_idx, axis_size in enumerate(sizes):
        axis_tuples.append(
            AxisTuple(
                start=axis_idx,
                value_start=running_axis_value_start,
                value_end=running_axis_value_start + axis_size,
                name=names[axis_idx],
                description=descriptions[axis_idx],
            )
        )
        for value_idx in range(axis_size):
            axis_values.append(
                AxisValueTuple(
                    start=running_axis_value_start + value_idx,
                    value=f"{names[axis_idx]}_{value_idx}",
                )
            )
        running_axis_value_start += axis_size

    goals = [
        GoalTuple(start=0, target=10, name="DEFAULT", description="Target 10 hits"),
        GoalTuple(start=1, target=-1, name="ILLEGAL", description="Illegal bucket"),
        GoalTuple(start=2, target=0, name="IGNORE", description="Ignore bucket"),
    ]

    bucket_goals = []
    bucket_hits = []

    target_total = 0
    target_buckets = 0
    hits_total = 0
    hit_buckets = 0
    full_buckets = 0

    for bucket_idx in range(row_count):
        if bucket_idx % 37 == 0:
            goal_idx = 1
            hits = 1 if bucket_idx % 2 == 0 else 0
        elif bucket_idx % 23 == 0:
            goal_idx = 2
            hits = 0
        else:
            goal_idx = 0
            hits = bucket_idx % 15

        bucket_goals.append(BucketGoalTuple(start=bucket_idx, goal=goal_idx))
        bucket_hits.append(BucketHitTuple(start=bucket_idx, hits=hits))

        target = goals[goal_idx].target
        if target > 0:
            target_total += target
            target_buckets += 1
            capped_hits = min(hits, target)
            if hits > 0:
                hit_buckets += 1
                if capped_hits == target:
                    full_buckets += 1
            hits_total += capped_hits

    point = PointTuple(
        start=0,
        depth=0,
        end=1,
        axis_start=0,
        axis_end=len(axis_tuples),
        axis_value_start=axis_value_start,
        axis_value_end=running_axis_value_start,
        goal_start=0,
        goal_end=len(goals),
        bucket_start=0,
        bucket_end=row_count,
        target=target_total,
        target_buckets=target_buckets,
        name="synthetic_point",
        description="Synthetic large coverage point for viewer performance testing",
    )

    point_hit = PointHitTuple(
        start=0,
        depth=0,
        hits=hits_total,
        hit_buckets=hit_buckets,
        full_buckets=full_buckets,
    )

    readout.points.append(point)
    readout.point_hits.append(point_hit)
    readout.axes.extend(axis_tuples)
    readout.axis_values.extend(axis_values)
    readout.goals.extend(goals)
    readout.bucket_goals.extend(bucket_goals)
    readout.bucket_hits.extend(bucket_hits)

    return readout


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate a synthetic large viewer fixture (.bktgz or .json)",
    )
    parser.add_argument(
        "--axis-a",
        type=int,
        default=100,
        help="Number of values for axis A",
    )
    parser.add_argument(
        "--axis-b",
        type=int,
        default=100,
        help="Number of values for axis B",
    )
    parser.add_argument(
        "--axis-c",
        type=int,
        default=20,
        help="Number of values for axis C",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("tools/perf/fixtures/large_200k.bktgz"),
        help="Output path (.bktgz or .json)",
    )

    args = parser.parse_args()
    axis_sizes = (args.axis_a, args.axis_b, args.axis_c)
    row_count = args.axis_a * args.axis_b * args.axis_c

    readout = build_readout(axis_sizes=axis_sizes, source_key=f"rows={row_count}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.suffix == ".json":
        JSONAccessor(args.output).write(readout)
    elif args.output.suffix == ".bktgz":
        ArchiveAccessor(args.output).write(readout)
    else:
        raise ValueError("Output extension must be .bktgz or .json")

    print(f"Wrote fixture: {args.output}")
    print(f"Rows: {row_count}")
    print(f"Axes: {axis_sizes}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
