# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Noodle-Bytes. All Rights Reserved

from typing import Iterable

from ..waiver import WaiverFile, match_waivers
from .common import (
    FORMAT_VERSION,
    AxisTuple,
    AxisValueTuple,
    BucketGoalTuple,
    BucketHitTuple,
    BucketWaiverTuple,
    GoalTuple,
    PointHitTuple,
    PointTuple,
    Readout,
    compute_point_hits,
    iter_waivers_in_range,
)


class WaivedReadout(Readout):
    """
    Utility readout which applies a waiver specification to another readout.

    Definition tables and bucket hits pass straight through; the matched
    waivers are exposed via ``iter_bucket_waivers`` (unioned with any waivers
    the wrapped readout already carries, whose reasons take precedence) and
    the point hits are recomputed so waived buckets are excluded from
    scoring. Waivers do not alter the regression identity, so the record sha
    is unchanged.
    """

    def __init__(self, readout: Readout, waiver_file: WaiverFile):
        self.readout = readout
        self.waiver_file = waiver_file

        self.bucket_waivers: dict[int, str] = {}
        for waiver in readout.iter_bucket_waivers():
            self.bucket_waivers.setdefault(waiver.start, waiver.reason)
        # Waivers newly contributed by the specification.
        self.matched: list[BucketWaiverTuple] = [
            waiver
            for waiver in match_waivers(readout, waiver_file)
            if waiver.start not in self.bucket_waivers
        ]
        for waiver in self.matched:
            self.bucket_waivers[waiver.start] = waiver.reason

        goal_targets = {goal.start: goal.target for goal in readout.iter_goals()}
        self.bucket_targets: list[int] = [
            goal_targets[bucket_goal.goal]
            for bucket_goal in readout.iter_bucket_goals()
        ]
        # Hits indexed by global bucket index, read once for the recomputation.
        self.bucket_hits: list[int] = [
            bucket_hit.hits for bucket_hit in readout.iter_bucket_hits()
        ]

    def get_def_sha(self) -> str:
        return self.readout.get_def_sha()

    def get_rec_sha(self) -> str:
        return self.readout.get_rec_sha()

    def get_source(self) -> str:
        return self.readout.get_source()

    def get_source_key(self) -> str:
        return self.readout.get_source_key()

    def get_bucket_version(self) -> str:
        return self.readout.get_bucket_version()

    def get_format_version(self) -> int:
        # Waived data is held in memory, so it is (re)serialized at whatever
        # format the writer that stores it uses.
        return FORMAT_VERSION

    def iter_points(
        self, start: int = 0, end: int | None = None, depth: int = 0
    ) -> Iterable[PointTuple]:
        yield from self.readout.iter_points(start, end, depth)

    def iter_bucket_goals(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[BucketGoalTuple]:
        yield from self.readout.iter_bucket_goals(start, end)

    def iter_axes(self, start: int = 0, end: int | None = None) -> Iterable[AxisTuple]:
        yield from self.readout.iter_axes(start, end)

    def iter_axis_values(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[AxisValueTuple]:
        yield from self.readout.iter_axis_values(start, end)

    def iter_goals(self, start: int = 0, end: int | None = None) -> Iterable[GoalTuple]:
        yield from self.readout.iter_goals(start, end)

    def iter_bucket_hits(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[BucketHitTuple]:
        yield from self.readout.iter_bucket_hits(start, end)

    def iter_bucket_waivers(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[BucketWaiverTuple]:
        yield from iter_waivers_in_range(
            (
                BucketWaiverTuple(index, reason)
                for index, reason in sorted(self.bucket_waivers.items())
            ),
            start,
            end,
        )

    def iter_point_hits(
        self, start: int = 0, end: int | None = None, depth: int = 0
    ) -> Iterable[PointHitTuple]:
        yield from compute_point_hits(
            self.iter_points(start, end, depth),
            self.bucket_hits,
            self.bucket_targets,
            self.bucket_waivers,
        )
