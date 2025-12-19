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
    byte_end: int | None,
    line_offset: int,
    line_end: int | None,
) -> Iterable[tuple]:
    """
    Read a slice of values from a CSV file from a 'seeked' section of the file.
    For record rows (8 fields), preserves empty strings for source/source_key (indices 6, 7).
    For all other rows, converts empty strings to None.
    """
    if byte_end is not None and byte_end - byte_offset == 0:
        yield from []
        return

    with path.open("r", newline="") as f:
        f.seek(byte_offset)

        if byte_end is not None:
            lines = f.readlines(byte_end - byte_offset - 1)[line_offset:line_end]
        else:
            lines = f.readlines()[line_offset:line_end]

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


def _read_bucket_hits_fast(
    path: Path,
    byte_offset: int,
    byte_end: int | None,
) -> Iterable[int]:
    """
    Fast path for reading bucket hits - just parse integers directly.
    Bucket hit CSV has only one column (hits), so we can skip CSV parsing overhead.
    """
    with path.open("r") as f:
        f.seek(byte_offset)

        if byte_end is not None:
            data = f.read(byte_end - byte_offset - 1)
        else:
            data = f.read()

        # Parse lines directly - bucket_hit CSV is just one integer per line
        for line in data.splitlines():
            line = line.strip()
            if line:
                # Handle quoted numbers from csv.QUOTE_NONNUMERIC
                if line.startswith('"') and line.endswith('"'):
                    line = line[1:-1]
                yield int(float(line))  # float first to handle "123.0" format


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


def merge_archive_direct(
    output_path: Path,
    *input_paths: Path,
    source: str | None = None,
    source_key: str | None = None,
    parallel: bool = True,
    batch_size: int | None = None,
) -> int:
    """
    Directly merge multiple archive files by only aggregating bucket hits.
    Much faster than loading full Readout objects.

    Parameters:
        output_path: Path where merged archive will be created
        input_paths: Archive files to merge
        source: Optional source identifier (defaults to "Merged_TIMESTAMP")
        source_key: Optional source key (defaults to "")
        parallel: If True, aggregate hits in parallel (default: True)
        batch_size: Optional batch size for hierarchical merging (default: None = no batching)

    Returns:
        Record offset in merged archive
    """
    from collections import defaultdict
    from datetime import datetime

    if not input_paths:
        raise ValueError("At least one input archive path must be provided")

    # Auto-enable hierarchical batching for very large file counts
    # This prevents memory exhaustion with 10k+ files
    if batch_size is None and len(input_paths) > 2000:
        batch_size = 1000

    # Treat batch_size=0 as None (no batching)
    if batch_size == 0:
        batch_size = None

    # Hierarchical batching for large numbers of files
    if batch_size is not None and batch_size > 0 and len(input_paths) > batch_size:
        import logging
        import tempfile as tmp_module

        log = logging.getLogger("bucket")
        num_batches = (len(input_paths) + batch_size - 1) // batch_size
        log.info(
            f"Hierarchical batching: {len(input_paths)} files → {num_batches} batches of ~{batch_size} files each"
        )

        temp_archives = []
        temp_dir = tmp_module.TemporaryDirectory()

        try:
            # Process in batches and create intermediate merged archives
            for batch_num, i in enumerate(range(0, len(input_paths), batch_size), 1):
                batch = input_paths[i : i + batch_size]
                log.info(
                    f"  Processing batch {batch_num}/{num_batches} ({len(batch)} files)..."
                )
                batch_output = Path(temp_dir.name) / f"batch_{i}.bktgz"
                merge_archive_direct(
                    batch_output,
                    *batch,
                    source=None,  # Don't set source for intermediate merges
                    source_key=None,
                    parallel=parallel,
                    batch_size=None,  # Don't batch recursively
                )
                temp_archives.append(batch_output)
                log.info(f"  Batch {batch_num}/{num_batches} complete")

            # Recursively merge the batch results
            log.info(f"Merging {len(temp_archives)} intermediate batch files...")
            return merge_archive_direct(
                output_path,
                *temp_archives,
                source=source,
                source_key=source_key,
                parallel=parallel,
                batch_size=batch_size if len(temp_archives) > batch_size else None,
            )
        finally:
            temp_dir.cleanup()

    # Validate inputs
    for path in input_paths:
        if not path.exists():
            raise ValueError(f"Input archive does not exist: {path}")
        if not path.is_file():
            raise ValueError(f"Input path is not a file: {path}")

    # Read first archive fully for definition data
    first_reader = ArchiveReader(input_paths[0])
    first_readout = first_reader.read(0)

    # Aggregate bucket hits from all archives
    aggregated_hits = defaultdict(int)

    def aggregate_archive_hits(archive_path: Path) -> dict[int, int]:
        """Extract and aggregate bucket hits from one archive"""
        hits = {}
        with tempfile.TemporaryDirectory() as tmpdir:
            work_path = Path(tmpdir)
            with tarfile.open(archive_path, mode="r:gz") as tar:
                # Only extract the files we need
                tar.extract(RECORD_PATH, work_path, filter="data")
                tar.extract(BUCKET_HIT_PATH, work_path, filter="data")

            # Read record to get bucket_hit offsets
            record_path = work_path / RECORD_PATH
            record_row = next(_read(record_path, 0, 1, 0, 1))
            record = ArchiveRecordTuple(*record_row)

            # Read and aggregate bucket hits using fast path
            bucket_idx = 0
            for bucket_hits in _read_bucket_hits_fast(
                work_path / BUCKET_HIT_PATH,
                record.bucket_hit_offset,
                record.bucket_hit_end,
            ):
                hits[bucket_idx] = hits.get(bucket_idx, 0) + bucket_hits
                bucket_idx += 1

        return hits

    # Aggregate hits from all archives
    if parallel and len(input_paths) > 1:
        import concurrent.futures
        import os

        max_workers = min(os.cpu_count() or 1, 8)

        # Stream results as they complete to avoid memory buildup
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all tasks
            futures = {
                executor.submit(aggregate_archive_hits, path): path
                for path in input_paths
            }

            # Process results as they complete (streaming, not accumulating)
            for future in concurrent.futures.as_completed(futures):
                hits_dict = future.result()
                for bucket_idx, hits in hits_dict.items():
                    aggregated_hits[bucket_idx] += hits
                # Release memory immediately
                del hits_dict
    else:
        # Serial aggregation
        for archive_path in input_paths:
            hits_dict = aggregate_archive_hits(archive_path)
            for bucket_idx, hits in hits_dict.items():
                aggregated_hits[bucket_idx] += hits

    # Recompute point hits from aggregated bucket hits
    from .common import PuppetReadout

    merged_readout = PuppetReadout()
    merged_readout.def_sha = first_readout.get_def_sha()
    merged_readout.rec_sha = first_readout.get_rec_sha()
    merged_readout.source = (
        source or f"Merged_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    )
    merged_readout.source_key = source_key or ""

    # Copy definition data
    merged_readout.points = list(first_readout.iter_points())
    merged_readout.axes = list(first_readout.iter_axes())
    merged_readout.axis_values = list(first_readout.iter_axis_values())
    merged_readout.goals = list(first_readout.iter_goals())
    merged_readout.bucket_goals = list(first_readout.iter_bucket_goals())

    # Build bucket goal lookup
    bucket_goal_map = {}
    goal_target_map = {}

    for goal in merged_readout.goals:
        goal_target_map[goal.start] = goal.target

    for bg in merged_readout.bucket_goals:
        bucket_goal_map[bg.start] = goal_target_map.get(bg.goal, 10)

    # Recompute point hits
    point_hits = []
    for point in merged_readout.points:
        hits = 0
        hit_buckets = 0
        full_buckets = 0

        for bucket_idx in range(point.bucket_start, point.bucket_end):
            bucket_target = bucket_goal_map.get(bucket_idx, 10)
            bucket_hits = aggregated_hits.get(bucket_idx, 0)

            if bucket_target > 0:
                capped_hits = min(bucket_hits, bucket_target)
                if bucket_hits > 0:
                    hit_buckets += 1
                    if capped_hits == bucket_target:
                        full_buckets += 1
                hits += capped_hits

        point_hits.append(
            PointHitTuple(
                start=point.start,
                depth=point.depth,
                hits=hits,
                hit_buckets=hit_buckets,
                full_buckets=full_buckets,
            )
        )

    merged_readout.point_hits = point_hits

    # Set bucket hits
    merged_readout.bucket_hits = [
        BucketHitTuple(start=idx, hits=hits)
        for idx, hits in sorted(aggregated_hits.items())
    ]

    # Write merged archive
    writer = ArchiveWriter(output_path)
    return writer.write(merged_readout)
