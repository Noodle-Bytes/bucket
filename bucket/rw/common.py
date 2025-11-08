# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

from datetime import datetime
from typing import Any, Iterable, NamedTuple, Protocol

from ..common.chain import Link
from ..link import CovDef, CovRun

###############################################################################
# Coverage information in tuple form, which is used to interface between
# different readers and writers.
###############################################################################


class PointTuple(NamedTuple):
    start: int
    depth: int
    end: int
    axis_start: int
    axis_end: int
    axis_value_start: int
    axis_value_end: int
    goal_start: int
    goal_end: int
    bucket_start: int
    bucket_end: int
    target: int
    target_buckets: int
    name: str
    description: str

    @classmethod
    def from_link(cls, link: Link[CovDef]):
        return cls(
            start=link.start.point,
            depth=link.depth,
            end=link.end.point,
            axis_start=link.start.axis,
            axis_end=link.end.axis,
            axis_value_start=link.start.axis_value,
            axis_value_end=link.end.axis_value,
            goal_start=link.start.goal,
            goal_end=link.end.goal,
            bucket_start=link.start.bucket,
            bucket_end=link.end.bucket,
            target=link.end.target - link.start.target,
            target_buckets=link.end.target_buckets - link.start.target_buckets,
            name=link.item._name,
            description=link.item._description,
        )


class BucketGoalTuple(NamedTuple):
    start: int
    goal: int


class AxisTuple(NamedTuple):
    start: int
    value_start: int
    value_end: int
    name: str
    description: str

    @classmethod
    def from_link(cls, link: Link[CovDef]):
        return cls(
            start=link.start.axis,
            value_start=link.start.axis_value,
            value_end=link.end.axis_value,
            name=link.item.name,
            description=link.item.description,
        )


class AxisValueTuple(NamedTuple):
    start: int
    value: str


class GoalTuple(NamedTuple):
    start: int
    target: int
    name: str
    description: str

    @classmethod
    def from_link(cls, link: Link[CovDef]):
        return cls(
            start=link.start.goal,
            target=link.item.target,
            name=link.item.name,
            description=link.item.description,
        )


class PointHitTuple(NamedTuple):
    start: int
    depth: int
    hits: int
    hit_buckets: int
    full_buckets: int

    @classmethod
    def from_link(cls, link: Link[CovRun]):
        return cls(
            start=link.start.point,
            depth=link.depth,
            hits=link.end.hits - link.start.hits,
            hit_buckets=link.end.hit_buckets - link.start.hit_buckets,
            full_buckets=link.end.full_buckets - link.start.full_buckets,
        )


class BucketHitTuple(NamedTuple):
    start: int
    hits: int


###############################################################################
# Interface definitions
# The Readout interface is intended to be easy to implement and provide
# consistent low-level access to data.
###############################################################################


class Readout(Protocol):
    """
    Readouts allow us to access coverage from a record consistently, without
    having to worry about the storage backend.
    """

    def get_def_sha(self) -> str: ...
    def get_rec_sha(self) -> str: ...
    def get_test_name(self) -> str | None: ...
    def get_seed(self) -> str | None: ...
    def iter_points(
        self, start: int = 0, end: int | None = None, depth: int = 0
    ) -> Iterable[PointTuple]: ...
    def iter_bucket_goals(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[BucketGoalTuple]: ...
    def iter_axes(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[AxisTuple]: ...
    def iter_axis_values(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[AxisValueTuple]: ...
    def iter_goals(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[GoalTuple]: ...
    def iter_point_hits(
        self, start: int = 0, end: int | None = None, depth: int = 0
    ) -> Iterable[PointHitTuple]: ...
    def iter_bucket_hits(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[BucketHitTuple]: ...


class Reader(Protocol):
    """
    Readers read from a backend to produce readouts.
    """

    def read(self, rec_ref) -> Readout: ...

    def read_all(self) -> Iterable[Readout]: ...


class Writer(Protocol):
    """
    Writers write to a backend from a readout.
    """

    def write(self, readout: Readout) -> Any: ...


class Accessor(Protocol):
    """
    Accessors read or write from/to a backend.
    """

    def reader(self) -> Reader: ...

    def writer(self) -> Writer: ...

    def read(self, rec_ref):
        return self.reader().read(rec_ref)

    def read_all(self) -> Iterable[Readout]:
        yield from self.reader().read_all()

    def write(self, readout: Readout):
        return self.writer().write(readout)


###############################################################################
# Accessors
# Accessors provide a human friendly interface to Readouts, similarly to an ORM
# (object-relational mapper).
###############################################################################


class CoverageAccess:
    """
    Provides a human friendly interface to a readout.
    """

    def __init__(self, readout: "Readout"):
        self._readout = readout

    def points(self) -> Iterable["PointAccess"]:
        for point, point_hit in zip(self.raw_points(), self.raw_point_hits()):
            yield PointAccess(self, point, point_hit)

    def raw_points(
        self, start: int = 0, end: int | None = None, depth: int = 0
    ) -> Iterable[PointTuple]:
        yield from self._readout.iter_points(start, end, depth)

    def raw_point_hits(
        self, start: int = 0, end: int | None = None, depth: int = 0
    ) -> Iterable[PointHitTuple]:
        yield from self._readout.iter_point_hits(start, end, depth)

    def raw_axes(self, start: int = 0, end: int | None = None) -> Iterable[AxisTuple]:
        yield from self._readout.iter_axes(start, end)

    def raw_goals(self, start: int = 0, end: int | None = None) -> Iterable[GoalTuple]:
        yield from self._readout.iter_goals(start, end)

    def raw_axis_values(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[AxisValueTuple]:
        yield from self._readout.iter_axis_values(start, end)

    def raw_bucket_goals(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[BucketGoalTuple]:
        yield from self._readout.iter_bucket_goals(start, end)

    def raw_bucket_hits(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[BucketHitTuple]:
        yield from self._readout.iter_bucket_hits(start, end)


class PointAccess:
    def __init__(
        self, coverage: CoverageAccess, point: PointTuple, point_hit: PointHitTuple
    ):
        self._coverage = coverage
        self._point = point
        self._point_hit = point_hit

    @property
    def name(self) -> str:
        return self._point.name

    @property
    def description(self) -> str:
        return self._point.description

    @property
    def is_group(self) -> bool:
        return self._point.end != self._point.start + 1

    @property
    def hits(self) -> int:
        return self._point_hit.hits

    @property
    def target(self) -> int:
        return self._point.target

    @property
    def hit_ratio(self) -> float:
        if self.target > 0:
            return self.hits / self.target
        return 1

    @property
    def hit_percent(self) -> str:
        return f"{self.hit_ratio*100:.2f}%"

    @property
    def buckets_hit(self) -> int:
        return self._point_hit.hit_buckets

    @property
    def buckets_targeted(self) -> int:
        return self._point.target_buckets

    @property
    def buckets_full(self) -> int:
        return self._point_hit.full_buckets

    @property
    def bucket_hit_ratio(self) -> float:
        if self.buckets_targeted == 0:
            return 1
        return self.buckets_hit / self.buckets_targeted

    @property
    def bucket_full_ratio(self) -> float:
        if self.buckets_targeted == 0:
            return 1
        return self.buckets_full / self.buckets_targeted

    @property
    def buckets_hit_percent(self) -> str:
        return f"{self.bucket_hit_ratio*100:.2f}%"

    @property
    def buckets_full_percent(self) -> str:
        return f"{self.bucket_full_ratio*100:.2f}%"

    def axes(self) -> Iterable["AxisAccess"]:
        for axis in self._coverage.raw_axes(
            self._point.axis_start, self._point.axis_end
        ):
            yield AxisAccess(self, axis)

    def goals(self) -> Iterable["GoalAccess"]:
        for goal in self._coverage.raw_goals(
            self._point.goal_start, self._point.goal_end
        ):
            yield GoalAccess(self, goal)

    def buckets(self) -> Iterable["BucketAccess"]:
        goals = list(self.goals())
        axis_values = list(
            self._coverage.raw_axis_values(
                self._point.axis_value_start, self._point.axis_value_end
            )
        )
        axes = list(self.axes())
        axes.reverse()

        for bucket_goal, bucket_hit in zip(
            self._coverage.raw_bucket_goals(
                self._point.bucket_start, self._point.bucket_end
            ),
            self._coverage.raw_bucket_hits(
                self._point.bucket_start, self._point.bucket_end
            ),
        ):
            # Find the offset of the bucket within the coverpoint
            offset = bucket_goal.start - self._point.bucket_start
            bucket_axis_values = {}

            # We're now getting the axis values from the bucket index.
            #
            # The axis values are in a flat list ordered by axis:
            #
            #   axis_value | axis  value_in_axis
            #   0          | 0     0
            #   1          | 0     1
            #   2          | 0     2
            #   3          | 1     0
            #   4          | 1     1
            #
            # The buckets are in a flat list ordered by axis combination, such that the last
            # axis changes most frequently.
            #
            #   bucket | axis_0 axis_1
            #   0      | 0      0
            #   1      | 0      1
            #   2      | 1      0
            #   3      | 1      1
            #   4      | 2      0
            #   5      | 2      1
            #
            # To find the axis value for each axis from the bucket, we go through the axes
            # from last to first, finding the axis position and size within the axis values,
            # and the bucket index offset within each axis. # The '%' and '//=' operators here
            # are used to align the offset within the values for an axis.
            for axis in axes:
                axis_offset = axis.value_start - self._point.axis_value_start
                axis_size = axis.value_end - axis.value_start

                value = axis_values[axis_offset + (offset % (axis_size))].value

                bucket_axis_values[axis.name] = value
                offset //= axis_size

            yield BucketAccess(
                self,
                goals[bucket_goal.goal - self._point.goal_start],
                bucket_axis_values,
                bucket_hit,
            )


class AxisAccess:
    def __init__(self, point: PointAccess, axis: AxisTuple):
        self._point = point
        self._axis = axis

    def point(self) -> PointAccess:
        return self._point

    @property
    def name(self) -> str:
        return self._axis.name

    @property
    def description(self) -> str:
        return self._axis.description

    @property
    def start(self) -> int:
        return self._axis.start

    @property
    def value_start(self) -> int:
        return self._axis.value_start

    @property
    def value_end(self) -> int:
        return self._axis.value_end


class GoalAccess:
    def __init__(self, point: PointAccess, goal: GoalTuple):
        self._point = point
        self._goal = goal

    def point(self) -> PointAccess:
        return self._point

    @property
    def start(self) -> int:
        return self._goal.start

    @property
    def name(self) -> str:
        return self._goal.name

    @property
    def description(self) -> str:
        return self._goal.description

    @property
    def target(self) -> int:
        return self._goal.target


class BucketAccess:
    def __init__(
        self,
        point: PointAccess,
        goal: GoalAccess,
        axis_values: dict[str, str],
        bucket_hit: BucketHitTuple,
    ):
        self._point = point
        self._goal = goal
        self._axis_values = axis_values
        self._bucket_hit = bucket_hit

    def point(self) -> PointAccess:
        return self._point

    def goal(self) -> GoalAccess:
        return self._goal

    def axis_value(self, name: str) -> str:
        return self._axis_values[name]

    @property
    def start(self) -> int:
        return self._bucket_hit.start

    @property
    def target(self) -> int:
        return self._goal.target

    @property
    def hits(self) -> int:
        return self._bucket_hit.hits

    @property
    def hit_ratio(self) -> float:
        if self.target > 0:
            return min(self.target, self.hits) / self.target
        # Illegal or ignore
        return 0

    @property
    def hit_percent(self) -> str:
        if self.target > 0:
            return f"{self.hit_ratio*100:.2f}%"
        if self.target == 0:
            return "-"
        if self.target < 0:
            return "!" if self.hits else "-"

    @property
    def is_legal(self):
        return self.target >= 0


###############################################################################
# Utility readouts
###############################################################################


class PuppetReadout(Readout):
    """
    Utility readout which stores coverage information directly rather than
    acting as an interface to other storage.
    """

    def __init__(self):
        self.points: list[PointTuple] = []
        self.bucket_goals: list[BucketGoalTuple] = []
        self.axes: list[AxisTuple] = []
        self.axis_values: list[AxisValueTuple] = []
        self.goals: list[GoalTuple] = []
        self.point_hits: list[PointHitTuple] = []
        self.bucket_hits: list[BucketHitTuple] = []
        self.def_sha = None
        self.rec_sha = None
        self.test_name: str | None = None
        self.seed: str | None = None

    def get_def_sha(self) -> str:
        if self.def_sha is None:
            raise RuntimeError("def_sha not set")
        return self.def_sha

    def get_rec_sha(self) -> str:
        if self.rec_sha is None:
            raise RuntimeError("rec_sha not set")
        return self.rec_sha

    def get_test_name(self) -> str | None:
        return self.test_name

    def get_seed(self) -> str | None:
        return self.seed

    def iter_points(
        self, start: int = 0, end: int | None = None, depth: int = 0
    ) -> Iterable[PointTuple]:
        offset_start = start + depth
        offset_end = None if end is None else end + depth
        yield from self.points[offset_start:offset_end]

    def iter_bucket_goals(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[BucketGoalTuple]:
        yield from self.bucket_goals[start:end]

    def iter_axes(self, start: int = 0, end: int | None = None) -> Iterable[AxisTuple]:
        yield from self.axes[start:end]

    def iter_axis_values(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[AxisValueTuple]:
        yield from self.axis_values[start:end]

    def iter_goals(self, start: int = 0, end: int | None = None) -> Iterable[GoalTuple]:
        yield from self.goals[start:end]

    def iter_point_hits(
        self, start: int = 0, end: int | None = None, depth: int = 0
    ) -> Iterable[PointHitTuple]:
        offset_start = start + depth
        offset_end = None if end is None else end + depth
        yield from self.point_hits[offset_start:offset_end]

    def iter_bucket_hits(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[BucketHitTuple]:
        yield from self.bucket_hits[start:end]


class MergeReadout(Readout):
    """
    Utility readout which merges data from other readouts. It takes one master
    readout, which all others must match.
    """

    def __init__(self, master: Readout, *others: Readout):
        super().__init__()
        self.master = master
        self.test_name = f"Merged_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self.seed = None

        self.bucket_hits: list[int] = []
        for bucket_hit in master.iter_bucket_hits():
            self.bucket_hits.append(bucket_hit.hits)

        goal_targets: list[int] = []
        for goal in master.iter_goals():
            goal_targets.append(goal.target)

        self.bucket_targets: list[int] = []
        for bucket_goal in master.iter_bucket_goals():
            self.bucket_targets.append(goal_targets[bucket_goal.goal])

        if others:
            self.merge(*others)

    def get_def_sha(self) -> str:
        return self.master.get_def_sha()

    def get_rec_sha(self) -> str:
        return self.master.get_rec_sha()

    def get_test_name(self) -> str | None:
        return self.test_name

    def get_seed(self) -> str | None:
        return self.seed

    def iter_points(
        self, start: int = 0, end: int | None = None, depth: int = 0
    ) -> Iterable[PointTuple]:
        yield from self.master.iter_points(start, end, depth)

    def iter_bucket_goals(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[BucketGoalTuple]:
        yield from self.master.iter_bucket_goals(start, end)

    def iter_axes(self, start: int = 0, end: int | None = None) -> Iterable[AxisTuple]:
        yield from self.master.iter_axes(start, end)

    def iter_axis_values(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[AxisValueTuple]:
        yield from self.master.iter_axis_values(start, end)

    def iter_goals(self, start: int = 0, end: int | None = None) -> Iterable[GoalTuple]:
        yield from self.master.iter_goals(start, end)

    def iter_bucket_hits(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[BucketHitTuple]:
        for offset, hits in enumerate(self.bucket_hits[start:end]):
            yield BucketHitTuple(start + offset, hits)

    def iter_point_hits(
        self, start: int = 0, end: int | None = None, depth: int = 0
    ) -> Iterable[PointHitTuple]:
        for point in self.iter_points(start, end, depth):
            hits = 0
            hit_buckets = 0
            full_buckets = 0
            for bucket_hit in self.iter_bucket_hits(
                point.bucket_start, point.bucket_end
            ):
                target = self.bucket_targets[bucket_hit.start]
                if target > 0:
                    bucket_hits = min(bucket_hit.hits, target)
                    if bucket_hit.hits > 0:
                        hit_buckets += 1
                        if bucket_hits == target:
                            full_buckets += 1
                        hits += bucket_hits

            yield PointHitTuple(
                start=point.start,
                depth=point.depth,
                hits=hits,
                hit_buckets=hit_buckets,
                full_buckets=full_buckets,
            )

    def merge(self, *readouts: Readout):
        """
        Merge additional readouts post init
        """
        master_def_sha = self.get_def_sha()
        master_rec_sha = self.get_rec_sha()

        for readout in readouts:
            if readout.get_def_sha() != master_def_sha:
                raise RuntimeError(
                    "Tried to merge coverage with two different definition hashes!"
                )

            if readout.get_rec_sha() != master_rec_sha:
                raise RuntimeError(
                    "Tried to merge coverage with two different record hashes!"
                )

            for bucket_hit in readout.iter_bucket_hits():
                self.bucket_hits[bucket_hit.start] += bucket_hit.hits
