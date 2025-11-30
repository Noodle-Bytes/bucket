# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

import csv
import tarfile
import tempfile
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
    source: str  # Stored as "" in CSV, always a string
    source_key: str  # Stored as "" in CSV, always a string


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
            # Convert None values to empty strings for CSV compatibility
            csv_row = tuple("" if v is None else v for v in value)
            csv_writer.writerow(csv_row)
        byte_end = f.tell()
    return byte_offset, byte_end


def _read(
    path: Path,
    byte_offset: int,
    byte_end: int,
    line_offset: int,
    line_end: int,
) -> Iterable[tuple]:
    """
    Read a slice of values from a CSV file from a 'seeked' section of the file.
    For record rows (8 fields), preserves empty strings for source/source_key (indices 6, 7).
    For all other rows, converts empty strings to None.
    """
    if byte_end - byte_offset == 0:
        yield from []
        return

    with path.open("r", newline="") as f:
        f.seek(byte_offset)

        lines = f.readlines(byte_end - byte_offset - 1)[line_offset:line_end]

        for row in csv.reader(lines, quoting=csv.QUOTE_NONNUMERIC):
            # For record rows (8 fields), keep empty strings as empty strings for source/source_key (indices 6, 7)
            # CSV doesn't support None, so we store "" for empty values
            # For all other rows, convert empty strings to None
            is_record_row = len(row) == 8  # ArchiveRecordTuple has 8 fields
            processed_row = []
            for idx, x in enumerate(row):
                if x == "":
                    # Keep empty strings as empty strings for source/source_key in record rows
                    # Convert to None for other fields/rows
                    if is_record_row and idx in (6, 7):  # source and source_key indices
                        processed_row.append("")
                    else:
                        processed_row.append(None)
                elif isinstance(x, float) and x.is_integer():
                    processed_row.append(int(x))
                else:
                    processed_row.append(x)
            yield tuple(processed_row)


class ArchiveReadout(Readout):
    def __init__(
        self,
        path: Path,
        rec_ref: int,
        _tempdir: tempfile.TemporaryDirectory | None = None,
    ):
        self.path = path
        self._tempdir = _tempdir

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

    def get_source(self) -> str:
        return self.record.source

    def get_source_key(self) -> str:
        return self.record.source_key

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

    def write(self, readout: Readout):
        """
        Write a readout to the archive.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            work_path = Path(tmpdir)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            work_path.mkdir(parents=True, exist_ok=True)

            # Check if definition already exists
            existing_def = None
            existing_def_offset = None
            if self.path.exists():
                with tarfile.open(self.path, mode="r:gz") as tar:
                    tar.extractall(work_path, filter="data")

                # Check if a definition with the same def_sha already exists
                def_path = work_path / DEFINITION_PATH
                if def_path.exists():
                    def_rows = list(_read(def_path, 0, None, 0, None))
                    for offset, def_row in enumerate(def_rows):
                        candidate_def = ArchiveDefinitionTuple(*def_row)
                        if candidate_def.def_sha == readout.get_def_sha():
                            existing_def = candidate_def
                            existing_def_offset = offset
                            break

            # Only write definition data if it doesn't already exist
            if existing_def_offset is None:
                # Write tables and get byte offsets/ends
                point_offset, point_end = _write(
                    work_path / POINT_PATH, readout.iter_points()
                )

                # For non-point tables, skip the first column (offset) as it can be reconstructed
                # when reading back.
                axis_offset, axis_end = _write(
                    work_path / AXIS_PATH, (a[1:] for a in readout.iter_axes())
                )
                axis_value_offset, axis_value_end = _write(
                    work_path / AXIS_VALUE_PATH,
                    (av[1:] for av in readout.iter_axis_values()),
                )
                goal_offset, goal_end = _write(
                    work_path / GOAL_PATH, (bg[1:] for bg in readout.iter_goals())
                )
                bucket_goal_offset, bucket_goal_end = _write(
                    work_path / BUCKET_GOAL_PATH,
                    (bg[1:] for bg in readout.iter_bucket_goals()),
                )
            else:
                # Use existing definition offsets
                point_offset = existing_def.point_offset
                point_end = existing_def.point_end
                axis_offset = existing_def.axis_offset
                axis_end = existing_def.axis_end
                axis_value_offset = existing_def.axis_value_offset
                axis_value_end = existing_def.axis_value_end
                goal_offset = existing_def.goal_offset
                goal_end = existing_def.goal_end
                bucket_goal_offset = existing_def.bucket_goal_offset
                bucket_goal_end = existing_def.bucket_goal_end

            # Always write hit data (unique per readout)
            point_hit_offset, point_hit_end = _write(
                work_path / POINT_HIT_PATH, readout.iter_point_hits()
            )
            bucket_hit_offset, bucket_hit_end = _write(
                work_path / BUCKET_HIT_PATH,
                (bh[1:] for bh in readout.iter_bucket_hits()),
            )

            # Store offsets in definition and record tables so we can seek later
            if existing_def_offset is None:
                # Write new definition entry
                definition_offset, _ = _write(
                    work_path / DEFINITION_PATH,
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
            else:
                # Reuse existing definition offset
                definition_offset = existing_def_offset

            # source and source_key are always strings (empty string if not set)
            source = readout.get_source()
            source_key = readout.get_source_key()
            record_offset, _ = _write(
                work_path / RECORD_PATH,
                [
                    ArchiveRecordTuple(
                        readout.get_rec_sha(),
                        definition_offset,
                        point_hit_offset,
                        point_hit_end,
                        bucket_hit_offset,
                        bucket_hit_end,
                        source,
                        source_key,
                    )
                ],
            )

            with tarfile.open(self.path, mode="w:gz") as tar:
                for entry in sorted(work_path.rglob("*"), key=lambda p: p.as_posix()):
                    tar.add(entry, arcname=entry.relative_to(work_path))

        return record_offset


class ArchiveReader(Reader):
    """
    Read from an archive file
    """

    def __init__(self, path: str | Path):
        self.path = Path(path)

    def _extract(self):
        if not self.path.exists():
            raise FileNotFoundError(f"Archive path does not exist: {self.path}")

        tempdir = tempfile.TemporaryDirectory()
        path = Path(tempdir.name)
        with tarfile.open(self.path, mode="r:gz") as tar:
            tar.extractall(path, filter="data")
        return path, tempdir

    def read(self, rec_ref: int):
        """
        Read a single record from the archive.
        """
        path, tempdir = self._extract()
        return ArchiveReadout(path, rec_ref, tempdir)

    def read_all(self) -> Iterable[Readout]:
        """
        Read all records in the archive.
        """
        path, tempdir = self._extract()
        # Record ids in the record file are start byte of each line
        with (path / RECORD_PATH).open("r", newline="") as f:
            while True:
                pos = f.tell()
                if not f.readline():
                    break
                yield ArchiveReadout(path, pos, tempdir)


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
