# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

import csv
from pathlib import Path
from typing import Iterable, NamedTuple

from .common import (
    Accessor,
    AxisTuple,
    AxisValueTuple,
    BucketGoalTuple,
    BucketHitTuple,
    GoalTuple,
    PointHitTuple,
    PointTuple,
    Reader,
    Readout,
    Writer,
)


class ArchiveDefinitionTuple(NamedTuple):
    def_sha: str
    point_offset: int
    point_end: int
    axis_offset: int
    axis_end: int
    axis_value_offset: int
    axis_value_end: int
    goal_offset: int
    goal_end: int
    bucket_goal_offset: int
    bucket_goal_end: int


class ArchiveRecordTuple(NamedTuple):
    rec_sha: str
    definition_offset: int
    point_hit_offset: int
    point_hit_end: int
    bucket_hit_offset: int
    bucket_hit_end: int


DEFINITION_PATH = "definition"
RECORD_PATH = "record"
POINT_PATH = "point"
AXIS_PATH = "axis"
AXIS_VALUE_PATH = "axis_value"
GOAL_PATH = "goal"
BUCKET_GOAL_PATH = "bucket_goal"
POINT_HIT_PATH = "point_hit"
BUCKET_HIT_PATH = "bucket_hit"

###############################################################################
# Accessors
###############################################################################


def _write(path: Path, values: Iterable[tuple]):
    """
    Write values to a CSV file and return the byte offsets so we can seek
    later.
    """
    with path.open("a", newline="") as f:
        byte_offset = f.tell()
        csv_writer = csv.writer(f, quoting=csv.QUOTE_NONNUMERIC)
        for value in values:
            csv_writer.writerow(value)
        byte_end = f.tell()
    return byte_offset, byte_end


def _read(
    path: Path, byte_offset: int, byte_end: int, line_offset: int, line_end: int
) -> Iterable[tuple]:
    """
    Read a slice of values from a CSV file from a 'seeked' section of the file.
    """
    if byte_end - byte_offset == 0:
        yield from []
        return

    with path.open("r", newline="") as f:
        f.seek(byte_offset)

        lines = f.readlines(byte_end - byte_offset - 1)[line_offset:line_end]

        for row in csv.reader(lines, quoting=csv.QUOTE_NONNUMERIC):
            yield tuple(int(x) if isinstance(x, float) else x for x in row)


class ArchiveReadout(Readout):
    def __init__(self, path: Path, rec_ref: int):
        self.path = path

        record_row = next(_read(self.path / RECORD_PATH, rec_ref, rec_ref + 1, 0, 1))
        self.record = ArchiveRecordTuple(*record_row)

        definition_row = next(
            _read(
                self.path / DEFINITION_PATH,
                self.record.definition_offset,
                self.record.definition_offset + 1,
                0,
                1,
            )
        )
        self.definition = ArchiveDefinitionTuple(*definition_row)

    def get_def_sha(self) -> str:
        return self.definition.def_sha

    def get_rec_sha(self) -> str:
        return self.record.rec_sha

    def iter_points(
        self, start: int = 0, end: int | None = None, depth: int = 0
    ) -> Iterable[PointTuple]:
        offset_start = start + depth
        offset_end = None if end is None else end + depth
        for p in _read(
            self.path / POINT_PATH,
            self.definition.point_offset,
            self.definition.point_end,
            offset_start,
            offset_end,
        ):
            yield PointTuple(*p)

    def iter_point_hits(
        self, start: int = 0, end: int | None = None, depth: int = 0
    ) -> Iterable[PointHitTuple]:
        offset_start = start + depth
        offset_end = None if end is None else end + depth
        for ph in _read(
            self.path / POINT_HIT_PATH,
            self.record.point_hit_offset,
            self.record.point_hit_end,
            offset_start,
            offset_end,
        ):
            yield PointHitTuple(*ph)

    def iter_bucket_goals(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[BucketGoalTuple]:
        idx = start
        for bg in _read(
            self.path / BUCKET_GOAL_PATH,
            self.definition.bucket_goal_offset,
            self.definition.bucket_goal_end,
            start,
            end,
        ):
            yield BucketGoalTuple(idx, *bg)
            idx += 1

    def iter_axes(self, start: int = 0, end: int | None = None) -> Iterable[AxisTuple]:
        idx = start
        for a in _read(
            self.path / AXIS_PATH,
            self.definition.axis_offset,
            self.definition.axis_end,
            start,
            end,
        ):
            yield AxisTuple(idx, *a)
            idx += 1

    def iter_axis_values(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[AxisValueTuple]:
        idx = start
        for av in _read(
            self.path / AXIS_VALUE_PATH,
            self.definition.axis_value_offset,
            self.definition.axis_value_end,
            start,
            end,
        ):
            yield AxisValueTuple(idx, *av)
            idx += 1

    def iter_goals(self, start: int = 0, end: int | None = None) -> Iterable[GoalTuple]:
        idx = start
        for g in _read(
            self.path / GOAL_PATH,
            self.definition.goal_offset,
            self.definition.goal_end,
            start,
            end,
        ):
            yield GoalTuple(idx, *g)
            idx += 1

    def iter_bucket_hits(
        self, start: int = 0, end: int | None = None
    ) -> Iterable[BucketHitTuple]:
        idx = start
        for bh in _read(
            self.path / BUCKET_HIT_PATH,
            self.record.bucket_hit_offset,
            self.record.bucket_hit_end,
            start,
            end,
        ):
            yield BucketHitTuple(idx, *bh)
            idx += 1


class ArchiveWriter(Writer):
    """
    Write to an archive file
    """

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.mkdir(parents=True, exist_ok=True)

    def write(self, readout: Readout):
        """
        Write a readout to the archive.
        """
        # Write tables and get byte offsets/ends
        point_offset, point_end = _write(self.path / POINT_PATH, readout.iter_points())
        self.point_hit_offset, self.point_hit_end = _write(
            self.path / POINT_HIT_PATH, readout.iter_point_hits()
        )

        # For non-point tables, skip the first column (offset) as it can be reconstructed
        # when reading back.
        axis_offset, axis_end = _write(
            self.path / AXIS_PATH, (a[1:] for a in readout.iter_axes())
        )
        axis_value_offset, axis_value_end = _write(
            self.path / AXIS_VALUE_PATH, (av[1:] for av in readout.iter_axis_values())
        )
        goal_offset, goal_end = _write(
            self.path / GOAL_PATH, (bg[1:] for bg in readout.iter_goals())
        )
        bucket_goal_offset, bucket_goal_end = _write(
            self.path / BUCKET_GOAL_PATH, (bg[1:] for bg in readout.iter_bucket_goals())
        )
        self.bucket_hit_offset, self.bucket_hit_end = _write(
            self.path / BUCKET_HIT_PATH, (bh[1:] for bh in readout.iter_bucket_hits())
        )
        # Store offsets in definition and record tables so we can seek later
        definition_offset, _ = _write(
            self.path / DEFINITION_PATH,
            [
                ArchiveDefinitionTuple(
                    readout.get_def_sha(),
                    point_offset,
                    point_end,
                    axis_offset,
                    axis_end,
                    axis_value_offset,
                    axis_value_end,
                    goal_offset,
                    goal_end,
                    bucket_goal_offset,
                    bucket_goal_end,
                )
            ],
        )

        record_offset, _ = _write(
            self.path / RECORD_PATH,
            [
                ArchiveRecordTuple(
                    readout.get_rec_sha(),
                    definition_offset,
                    self.point_hit_offset,
                    self.point_hit_end,
                    self.bucket_hit_offset,
                    self.bucket_hit_end,
                )
            ],
        )

        return record_offset


class ArchiveReader(Reader):
    """
    Read from an archive file
    """

    def __init__(self, path: str | Path):
        self.path = Path(path)

    def read(self, rec_ref: int):
        """
        Read a single record from the archive.
        """
        return ArchiveReadout(self.path, rec_ref)

    def read_all(self) -> Iterable[Readout]:
        """
        Read all records in the archive.
        """
        # Record ids in the record file are start byte of each line
        with (self.path / "record").open("r", newline="") as f:
            while True:
                pos = f.tell()
                if not f.readline():
                    break
                yield self.read(pos)


class ArchiveAccessor(Accessor):
    """
    Read/Write from/to an archive.
    """

    def __init__(self, path: str | Path):
        self.path = path

    def reader(self):
        return ArchiveReader(self.path)

    def writer(self):
        return ArchiveWriter(self.path)
