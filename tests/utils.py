# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

from functools import reduce
from operator import mul
from random import Random

from bucket.rw.common import (
    AxisTuple,
    AxisValueTuple,
    BucketGoalTuple,
    BucketHitTuple,
    GoalTuple,
    PointHitTuple,
    PointTuple,
    PuppetReadout,
    Readout,
)


class GeneratedReadout(PuppetReadout):
    """
    A readout for a generated tree of coverpoints containing arbitrary data.
    """

    def __init__(
        self,
        def_seed=1,
        rec_seed=1,
        min_goals=1,
        max_goals=5,
        min_axes=1,
        max_axes=5,
        min_axis_values=2,
        max_axis_values=5,
        min_target=-1,
        max_target=10,
        min_hits=0,
        max_hits=10,
        min_points=0,
        max_points=5,
        group_initial_chance=1,
        group_chance_decay=0.5,
        illegal_hits=True,
        ignore_hits=True,
        root_is_point=False,
    ):
        super().__init__()

        self._min_goals = min_goals
        self._max_goals = max_goals
        self._min_axes = min_axes
        self._max_axes = max_axes
        self._min_axis_values = min_axis_values
        self._max_axis_values = max_axis_values
        self._min_target = min_target
        self._max_target = max_target
        self._min_points = min_points
        self._max_points = max_points
        self._group_initial_chance = group_initial_chance
        self._group_chance_decay = group_chance_decay

        self._min_hits = min_hits
        self._max_hits = max_hits
        self._illegal_hits = illegal_hits
        self._ignore_hits = ignore_hits

        # Noted the record sha is the same as the definition sha because the
        # record is created in the same env.
        self.rec_sha = self.def_sha = str(
            (
                def_seed,
                min_goals,
                max_goals,
                min_axes,
                max_axes,
                min_axis_values,
                max_axis_values,
                min_target,
                max_target,
                min_points,
                max_points,
                group_initial_chance,
                group_chance_decay,
            )
        )

        self.def_random = Random(def_seed)
        self.rec_random = Random(rec_seed)

        if root_is_point:
            self._generate_point(0, 0, 0, 0, 0, 0)
        else:
            self._generate_group(0, 0, 0, 0, 0, 0)

        self.points.sort(key=lambda p: (p.start, p.depth))
        self.point_hits.sort(key=lambda p: (p.start, p.depth))

    def _generate_point(
        self,
        start: int,
        depth: int,
        axis_start: int,
        axis_value_start: int,
        goal_start: int,
        bucket_start: int,
    ) -> tuple[PointTuple, PointHitTuple]:
        target = 0
        target_buckets = 0
        hits = 0
        hit_buckets = 0
        full_buckets = 0

        goal_end = goal_start + self.def_random.randint(
            self._min_goals, self._max_goals
        )
        for goal_offset in range(goal_start, goal_end):
            self.goals.append(
                GoalTuple(
                    goal_offset,
                    self.def_random.randint(self._min_target, self._max_target),
                    str(goal_offset),
                    str(goal_offset),
                )
            )

        axis_sizes = []
        axis_end = axis_start + self.def_random.randint(self._min_axes, self._max_axes)
        per_axis_value_start = axis_value_start
        for axis_offset in range(axis_start, axis_end):
            axis_value_end = per_axis_value_start + self.def_random.randint(
                self._min_axis_values, self._max_axis_values
            )

            for axis_value_offset in range(per_axis_value_start, axis_value_end):
                self.axis_values.append(
                    AxisValueTuple(axis_value_offset, str(axis_value_offset))
                )

            self.axes.append(
                AxisTuple(
                    axis_offset,
                    per_axis_value_start,
                    axis_value_end,
                    str(axis_offset),
                    str(axis_offset),
                )
            )
            axis_sizes.append(axis_value_end - per_axis_value_start)
            per_axis_value_start = axis_value_end

        bucket_end = bucket_start + reduce(mul, axis_sizes, 1)
        for bucket_offset in range(bucket_start, bucket_end):
            goal_idx = self.def_random.randint(goal_start, goal_end - 1)

            bucket_target = self.goals[goal_idx].target
            bucket_hits = self.rec_random.randint(self._min_hits, self._max_hits)

            if bucket_target > 0:
                target += bucket_target
                target_buckets += 1

                if bucket_hits > 0:
                    hits += min(bucket_target, bucket_hits)
                    hit_buckets += 1
                    if bucket_hits >= bucket_target:
                        full_buckets += 1
            elif bucket_target == 0 and not self._ignore_hits:
                bucket_hits = 0
            elif bucket_target < 0 and not self._illegal_hits:
                bucket_hits = 0

            self.bucket_goals.append(BucketGoalTuple(bucket_offset, goal_idx))
            self.bucket_hits.append(BucketHitTuple(bucket_offset, bucket_hits))

        point = PointTuple(
            start=start,
            depth=depth,
            end=start + 1,
            axis_start=axis_start,
            axis_end=axis_end,
            axis_value_start=axis_value_start,
            axis_value_end=axis_value_end,
            goal_start=goal_start,
            goal_end=goal_end,
            bucket_start=bucket_start,
            bucket_end=bucket_end,
            target=target,
            target_buckets=target_buckets,
            name=f"S{start}D{depth}E{start+1}",
            description="Point",
        )

        point_hit = PointHitTuple(
            start=start,
            depth=depth,
            hits=hits,
            hit_buckets=hit_buckets,
            full_buckets=full_buckets,
        )

        self.points.append(point)
        self.point_hits.append(point_hit)

        return point, point_hit

    def _generate_group(
        self,
        start: int,
        depth: int,
        axis_start: int,
        axis_value_start: int,
        goal_start: int,
        bucket_start: int,
    ) -> PointTuple:
        child_start = start
        child_depth = depth + 1
        child_axis_start = axis_start
        child_axis_value_start = axis_value_start
        child_goal_start = goal_start
        child_bucket_start = bucket_start

        target = 0
        target_buckets = 0
        hits = 0
        hit_buckets = 0
        full_buckets = 0

        for _ in range(self.def_random.randint(self._min_points, self._max_points)):
            if self.def_random.random() < self._group_initial_chance * (
                self._group_chance_decay**depth
            ):
                child_point, child_point_hit = self._generate_group(
                    start=child_start,
                    depth=child_depth,
                    axis_start=child_axis_start,
                    axis_value_start=child_axis_value_start,
                    goal_start=child_goal_start,
                    bucket_start=child_bucket_start,
                )
            else:
                child_point, child_point_hit = self._generate_point(
                    start=child_start,
                    depth=child_depth,
                    axis_start=child_axis_start,
                    axis_value_start=child_axis_value_start,
                    goal_start=child_goal_start,
                    bucket_start=child_bucket_start,
                )
            child_start = child_point.end
            child_axis_start = child_point.axis_end
            child_axis_value_start = child_point.axis_value_end
            child_goal_start = child_point.goal_end
            child_bucket_start = child_point.bucket_end

            target += child_point.target
            target_buckets += child_point.target_buckets
            hits += child_point_hit.hits
            hit_buckets += child_point_hit.hit_buckets
            full_buckets += child_point_hit.full_buckets

        group = PointTuple(
            start=start,
            depth=depth,
            end=child_start + 1,
            axis_start=axis_start,
            axis_end=child_axis_start,
            axis_value_start=axis_value_start,
            axis_value_end=child_axis_value_start,
            goal_start=goal_start,
            goal_end=child_goal_start,
            bucket_start=bucket_start,
            bucket_end=child_bucket_start,
            target=target,
            target_buckets=target_buckets,
            name=f"S{start}D{depth}E{child_start+1}",
            description="Group",
        )

        group_hit = PointHitTuple(
            start=start,
            depth=depth,
            hits=hits,
            hit_buckets=hit_buckets,
            full_buckets=full_buckets,
        )

        self.points.append(group)
        self.point_hits.append(group_hit)
        return group, group_hit


def readouts_are_equal(readout_a: Readout, readout_b: Readout) -> bool:
    """
    Returns True if the two readouts match, False otherwise.
    """

    if readout_a.get_def_sha() != readout_b.get_def_sha():
        return False

    if readout_a.get_rec_sha() != readout_b.get_rec_sha():
        return False

    for fn in (
        "iter_points",
        "iter_axes",
        "iter_axis_values",
        "iter_goals",
        "iter_bucket_goals",
        "iter_bucket_hits",
        "iter_point_hits",
    ):
        try:
            for field_a, field_b in zip(
                getattr(readout_a, fn)(), getattr(readout_b, fn)(), strict=True
            ):
                if field_a != field_b:
                    return False
        except ValueError:
            return False

    return True
