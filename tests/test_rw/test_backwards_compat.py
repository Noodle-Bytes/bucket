# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

"""
Backwards-compatibility tests for the on-disk storage formats.

tests/format_fixtures/ holds one frozen fixture directory per storage format
version (see the README there). These tests check that the current readers
can open and fully process every format version we still claim to support,
by comparing a complete readback against the snapshot taken when the fixture
was written.

If a test here fails after a format change, either fix the regression or
consciously drop support: raise MIN_FORMAT_VERSION (and the viewer's
MIN_SUPPORTED_FORMAT_VERSION), then delete the dropped fixture directory.
When FORMAT_VERSION is bumped, generate the new fixture with:

    python tools/gen_format_fixtures.py
"""

import json
import warnings
from pathlib import Path

import pytest

from bucket.rw import ArchiveAccessor, JSONAccessor
from bucket.rw.common import FORMAT_VERSION, MIN_FORMAT_VERSION, Readout

FIXTURE_ROOT = Path(__file__).resolve().parent.parent / "format_fixtures"
FIXTURE_FILES = ("coverage.bktgz", "coverage.json", "expected.json")
SUPPORTED_VERSIONS = list(range(MIN_FORMAT_VERSION, FORMAT_VERSION + 1))


def fixture_dir(version: int) -> Path:
    return FIXTURE_ROOT / f"v{version}"


def canonical_record(readout: Readout) -> dict:
    """
    Full dump of a readout in the shape written by
    tools/gen_format_fixtures.py (record_snapshot), minus bucket_version
    which is checked per-format.
    """
    return {
        "def_sha": readout.get_def_sha(),
        "rec_sha": readout.get_rec_sha(),
        "source": readout.get_source() or "",
        "source_key": readout.get_source_key() or "",
        "format_version": readout.get_format_version(),
        "point": [p._asdict() for p in readout.iter_points()],
        "axis": [a._asdict() for a in readout.iter_axes()],
        "axis_value": [av._asdict() for av in readout.iter_axis_values()],
        "goal": [g._asdict() for g in readout.iter_goals()],
        "bucket_goal": [bg._asdict() for bg in readout.iter_bucket_goals()],
        "point_hit": [ph._asdict() for ph in readout.iter_point_hits()],
        "bucket_hit": [bh._asdict() for bh in readout.iter_bucket_hits()],
    }


def expected_records(version: int) -> list[dict]:
    with (fixture_dir(version) / "expected.json").open(encoding="utf-8") as f:
        expected = json.load(f)
    records = []
    for record in expected["records"]:
        record = dict(record)
        record.pop("bucket_version")
        records.append(record)
    return records


def expected_bucket_versions(version: int, file_format: str) -> list[str]:
    with (fixture_dir(version) / "expected.json").open(encoding="utf-8") as f:
        expected = json.load(f)
    return [record["bucket_version"][file_format] for record in expected["records"]]


def regression_help(version: int) -> str:
    """
    Step-by-step remediation shown when a supported format no longer reads
    back correctly.
    """
    return (
        f"\n"
        f"Storage format v{version} is within the supported range "
        f"[{MIN_FORMAT_VERSION}, {FORMAT_VERSION}] but the current readers no "
        f"longer process it correctly.\n"
        f"The fixture files were written by the code that produced format "
        f"v{version} and are frozen; the mismatch above shows today's readback "
        f"vs tests/format_fixtures/v{version}/expected.json.\n"
        f"\n"
        f"Pick ONE of:\n"
        f"\n"
        f"1. Fix the compatibility regression (usually the intended outcome).\n"
        f"   The Python readers live in bucket/rw/archive.py, "
        f"bucket/rw/json.py and bucket/rw/common.py.\n"
        f"   Re-run just these tests while iterating:\n"
        f"       pytest tests/test_rw/test_backwards_compat.py -k v{version}\n"
        f"   The viewer reads the same fixtures - check it too:\n"
        f"       cd viewer && npx vitest run "
        f"src/services/storageFormatCompat.test.ts\n"
        f"\n"
        f"2. Deliberately drop support for format v{version} "
        f"(only if maintaining compatibility is not worth it):\n"
        f"       - bucket/rw/common.py: set MIN_FORMAT_VERSION = {version + 1}\n"
        f"       - viewer/src/utils/versionCompat.ts: set "
        f"MIN_SUPPORTED_FORMAT_VERSION = {version + 1}\n"
        f"       - git rm -r tests/format_fixtures/v{version}\n"
        f"   and call out the dropped support in the PR description.\n"
        f"\n"
        f"See tests/format_fixtures/README.md for the full workflow.\n"
    )


class TestFixtureInventory:
    def test_fixture_exists_for_every_supported_version(self):
        missing = [
            f"v{version}/{name}"
            for version in SUPPORTED_VERSIONS
            for name in FIXTURE_FILES
            if not (fixture_dir(version) / name).is_file()
        ]
        assert not missing, (
            f"\n"
            f"Missing storage-format fixtures: {missing}.\n"
            f"Every format from MIN_FORMAT_VERSION ({MIN_FORMAT_VERSION}) to "
            f"FORMAT_VERSION ({FORMAT_VERSION}) needs a frozen fixture "
            f"directory under tests/format_fixtures/.\n"
            f"\n"
            f"If you just bumped FORMAT_VERSION, generate and commit the new "
            f"fixture (from the repo root):\n"
            f"    python tools/gen_format_fixtures.py\n"
            f"    git add tests/format_fixtures/v{FORMAT_VERSION}\n"
            f"\n"
            f"If a fixture for an OLDER format is missing, recreate it from "
            f"the last commit that wrote that format:\n"
            f"    git worktree add /tmp/bucket-old <commit>\n"
            f"    cp tools/gen_format_fixtures.py /tmp/bucket-old/tools/\n"
            f"    cd /tmp/bucket-old && python tools/gen_format_fixtures.py "
            f"--output-dir <this-repo>/tests/format_fixtures\n"
            f"    git worktree remove /tmp/bucket-old\n"
            f"(format history and last-writer commits: see the FORMAT_VERSION "
            f"comment in bucket/rw/common.py and "
            f"tests/format_fixtures/README.md)\n"
        )

    def test_no_fixtures_outside_supported_range(self):
        stale = [
            entry.name
            for entry in sorted(FIXTURE_ROOT.iterdir())
            if entry.is_dir()
            and entry.name.startswith("v")
            and entry.name[1:].isdigit()
            and int(entry.name[1:]) not in SUPPORTED_VERSIONS
        ]
        assert not stale, (
            f"\n"
            f"Fixture directories outside the supported format range "
            f"[{MIN_FORMAT_VERSION}, {FORMAT_VERSION}]: {stale}.\n"
            f"\n"
            f"If support for these formats was dropped on purpose, remove "
            f"their fixtures and keep the viewer in sync:\n"
            + "".join(f"    git rm -r tests/format_fixtures/{name}\n" for name in stale)
            + f"    (viewer/src/utils/versionCompat.ts: "
            f"MIN_SUPPORTED_FORMAT_VERSION must equal MIN_FORMAT_VERSION = "
            f"{MIN_FORMAT_VERSION})\n"
            f"\n"
            f"Otherwise restore MIN_FORMAT_VERSION in bucket/rw/common.py so "
            f"the range covers them again.\n"
        )


@pytest.mark.parametrize("version", SUPPORTED_VERSIONS, ids=lambda v: f"v{v}")
class TestSupportedFormats:
    def _read_all(self, accessor, version: int) -> list[Readout]:
        # A supported format must read back without any compatibility
        # warnings; escalate warnings so one fails the test.
        with warnings.catch_warnings():
            warnings.simplefilter("error")
            try:
                return list(accessor.reader().read_all())
            except Warning as warning:
                pytest.fail(
                    f"Reading a supported-format fixture raised a "
                    f"compatibility warning: {warning}\n{regression_help(version)}"
                )

    def test_archive_reads_fully(self, version):
        readouts = self._read_all(
            ArchiveAccessor(fixture_dir(version) / "coverage.bktgz"), version
        )
        assert [canonical_record(r) for r in readouts] == expected_records(
            version
        ), regression_help(version)
        assert [
            r.get_bucket_version() or "" for r in readouts
        ] == expected_bucket_versions(version, "archive"), regression_help(version)

    def test_json_reads_fully(self, version):
        readouts = self._read_all(
            JSONAccessor(fixture_dir(version) / "coverage.json"), version
        )
        assert [canonical_record(r) for r in readouts] == expected_records(
            version
        ), regression_help(version)
        assert [
            r.get_bucket_version() or "" for r in readouts
        ] == expected_bucket_versions(version, "json"), regression_help(version)

    def test_archive_records_merge(self, version):
        # The fixture's records share def/rec shas, so the archive must also
        # still be mergeable - merged bucket hits are the per-bucket sums.
        merged = ArchiveAccessor.merge_files([fixture_dir(version) / "coverage.bktgz"])
        records = expected_records(version)
        summed = [
            sum(rec["bucket_hit"][idx]["hits"] for rec in records)
            for idx in range(len(records[0]["bucket_hit"]))
        ]
        assert [bh.hits for bh in merged.iter_bucket_hits()] == summed, regression_help(
            version
        )
