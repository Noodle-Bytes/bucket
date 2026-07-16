# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

import csv
import json
import tarfile
import tempfile
import warnings
from pathlib import Path

import pytest

from bucket.rw import ArchiveAccessor, JSONAccessor
from bucket.rw.archive import (
    RECORD_PATH,
    ArchiveDefinitionTuple,
    ArchiveReadout,
    ArchiveRecordTuple,
)
from bucket.rw.common import (
    ARCHIVE_FORMAT_VERSION,
    FORMAT_VERSION,
    JSON_FORMAT_VERSION,
    LEGACY_FORMAT_VERSION,
    AxisTuple,
    AxisValueTuple,
    BucketGoalTuple,
    BucketHitTuple,
    GoalTuple,
    PointHitTuple,
    PointTuple,
)

from ..utils import GeneratedReadout


def _write_archive(tmpdir: Path) -> Path:
    path = tmpdir / "storage.bktgz"
    ArchiveAccessor(path).write(GeneratedReadout(def_seed=1, rec_seed=1))
    return path


def _extract_archive(archive_path: Path, dest: Path) -> Path:
    with tarfile.open(archive_path, mode="r:gz") as tar:
        tar.extractall(dest, filter="data")
    return dest


def _rewrite_record_rows(extracted: Path, mutate) -> None:
    """Apply `mutate` to every row of the extracted record table."""
    record_path = extracted / RECORD_PATH
    rows = list(
        csv.reader(record_path.read_text().splitlines(), quoting=csv.QUOTE_NONNUMERIC)
    )
    with record_path.open("w", newline="") as f:
        csv.writer(f, quoting=csv.QUOTE_NONNUMERIC).writerows(
            mutate(row) for row in rows
        )


class TestFormatVersion:
    def test_layout_change_requires_format_bump(self):
        """
        Snapshot of the serialized row layouts. If this test fails, the
        on-disk storage format has changed: bump FORMAT_VERSION in
        bucket/rw/common.py (and SUPPORTED_FORMAT_VERSION in
        viewer/src/utils/versionCompat.ts), document the change in the
        format history, then update this snapshot.
        """
        assert FORMAT_VERSION == 2
        # The archive and JSON formats are versioned independently but by
        # policy always bump in lockstep.
        assert ARCHIVE_FORMAT_VERSION == FORMAT_VERSION
        assert JSON_FORMAT_VERSION == FORMAT_VERSION
        assert ArchiveDefinitionTuple._fields == (
            "def_sha",
            "point_offset",
            "point_end",
            "axis_offset",
            "axis_end",
            "axis_value_offset",
            "axis_value_end",
            "goal_offset",
            "goal_end",
            "bucket_goal_offset",
            "bucket_goal_end",
        )
        assert ArchiveRecordTuple._fields == (
            "rec_sha",
            "definition_offset",
            "point_hit_offset",
            "point_hit_end",
            "bucket_hit_offset",
            "bucket_hit_end",
            "source",
            "source_key",
            "bucket_version",
            "format_version",
        )
        assert PointTuple._fields == (
            "start",
            "depth",
            "end",
            "axis_start",
            "axis_end",
            "axis_value_start",
            "axis_value_end",
            "goal_start",
            "goal_end",
            "bucket_start",
            "bucket_end",
            "target",
            "target_buckets",
            "name",
            "description",
            "tier",
            "tags",
            "motivation",
        )
        assert AxisTuple._fields == (
            "start",
            "value_start",
            "value_end",
            "name",
            "description",
        )
        assert AxisValueTuple._fields == ("start", "value")
        assert GoalTuple._fields == ("start", "target", "name", "description")
        assert BucketGoalTuple._fields == ("start", "goal")
        assert PointHitTuple._fields == (
            "start",
            "depth",
            "hits",
            "hit_buckets",
            "full_buckets",
        )
        assert BucketHitTuple._fields == ("start", "hits")

    def test_writer_stamps_current_format(self):
        """A written archive records the current format and reads silently."""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = _write_archive(Path(tmpdir))
            with warnings.catch_warnings():
                warnings.simplefilter("error")
                readout = ArchiveAccessor(path).read(0)
            assert readout.get_format_version() == FORMAT_VERSION

    def test_bucket_version_mismatch_does_not_warn(self):
        """
        A different bucket release writing the same format must not warn:
        the package version is provenance only.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            extracted = _extract_archive(_write_archive(tmp), tmp / "unpacked")

            def set_ancient_bucket(row):
                row[8] = "0.0.1"
                return row

            _rewrite_record_rows(extracted, set_ancient_bucket)

            with warnings.catch_warnings():
                warnings.simplefilter("error")
                readout = ArchiveReadout(extracted, 0)
            assert readout.get_bucket_version() == "0.0.1"
            assert readout.get_format_version() == FORMAT_VERSION

    def test_legacy_record_without_format_column_is_silent(self):
        """Rows written before format versioning read as the legacy format."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            extracted = _extract_archive(_write_archive(tmp), tmp / "unpacked")

            _rewrite_record_rows(extracted, lambda row: row[:9])

            with warnings.catch_warnings():
                warnings.simplefilter("error")
                readout = ArchiveReadout(extracted, 0)
            assert readout.get_format_version() == LEGACY_FORMAT_VERSION

    def test_newer_format_warns(self):
        """A file from a future format warns that the reader is behind."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            extracted = _extract_archive(_write_archive(tmp), tmp / "unpacked")

            def bump_format(row):
                row[9] = FORMAT_VERSION + 1
                return row

            _rewrite_record_rows(extracted, bump_format)

            with pytest.warns(UserWarning, match="storage format"):
                readout = ArchiveReadout(extracted, 0)
            assert readout.get_format_version() == FORMAT_VERSION + 1


def _write_json(tmpdir: Path) -> Path:
    path = tmpdir / "storage.json"
    readout = GeneratedReadout(def_seed=1, rec_seed=1)
    readout.bucket_version = "9.9.9"
    JSONAccessor(path).write(readout)
    return path


def _rewrite_json_records(path: Path, mutate) -> None:
    data = json.loads(path.read_text())
    data["records"] = [mutate(record) for record in data["records"]]
    path.write_text(json.dumps(data))


class TestJSONFormatVersion:
    def test_writer_stamps_current_format(self):
        """A written JSON file records the current format and reads silently."""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = _write_json(Path(tmpdir))
            with warnings.catch_warnings():
                warnings.simplefilter("error")
                readout = JSONAccessor(path).read(0)
            assert readout.get_format_version() == JSON_FORMAT_VERSION
            assert readout.get_bucket_version() == "9.9.9"

    def test_legacy_record_without_version_keys_is_silent(self):
        """Records written before format versioning read as the legacy format."""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = _write_json(Path(tmpdir))

            def strip_versions(record):
                record.pop("bucket_version")
                record.pop("format_version")
                return record

            _rewrite_json_records(path, strip_versions)

            with warnings.catch_warnings():
                warnings.simplefilter("error")
                readout = JSONAccessor(path).read(0)
            assert readout.get_format_version() == LEGACY_FORMAT_VERSION
            assert readout.get_bucket_version() == ""

    def test_newer_format_warns(self):
        """A JSON file from a future format warns that the reader is behind."""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = _write_json(Path(tmpdir))

            def bump_format(record):
                record["format_version"] = JSON_FORMAT_VERSION + 1
                return record

            _rewrite_json_records(path, bump_format)

            with pytest.warns(UserWarning, match="storage format"):
                readout = JSONAccessor(path).read(0)
            assert readout.get_format_version() == JSON_FORMAT_VERSION + 1
