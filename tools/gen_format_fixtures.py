#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
"""
Generate frozen storage-format fixtures for backwards-compatibility testing.

Writes tests/format_fixtures/v{N}/ where N is the storage format version of
the tree this script runs in (trees predating format versioning produce v1):

    coverage.bktgz  - two-record archive written by this tree's ArchiveWriter
    coverage.json   - the same two records written by this tree's JSONWriter
    expected.json   - canonical snapshot of the coverage data, produced by
                      reading both files straight back with this tree's own
                      readers (i.e. ground truth as understood by the writer)

The two records share one definition (and def/rec shas) with different bucket
hits, so multi-record offset handling and merging stay exercised.

Fixtures are generated ONCE, when a format version is first introduced, and
then FROZEN - never regenerate an existing vN directory. When FORMAT_VERSION
is bumped, run from the repo root:

    python tools/gen_format_fixtures.py

and commit the new tests/format_fixtures/v{N}/ directory. To (re)create a
fixture for an older format, run this script from a checkout of the last
commit that wrote that format:

    git worktree add /tmp/bucket-old <commit>
    cp tools/gen_format_fixtures.py /tmp/bucket-old/tools/
    cd /tmp/bucket-old && python tools/gen_format_fixtures.py \
        --output-dir /path/to/main/tests/format_fixtures

This script is deliberately self-contained and only touches API that has been
stable across format versions, so it can run unmodified in older trees.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Resolve bucket/tests from the tree this script lives in, ahead of any
# installed copy, so running from an old worktree uses that worktree's code.
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

import bucket.rw.common as rw_common  # noqa: E402
from bucket.rw import ArchiveAccessor, JSONAccessor  # noqa: E402
from tests.utils import GeneratedReadout  # noqa: E402

if not Path(rw_common.__file__).resolve().is_relative_to(REPO_ROOT):
    raise SystemExit(
        f"Imported bucket from {rw_common.__file__}, not from {REPO_ROOT} - "
        "refusing to generate fixtures from a different tree."
    )

# Trees predating storage-format versioning wrote what is now format 1.
FORMAT_VERSION = int(getattr(rw_common, "FORMAT_VERSION", 1))

# Fixed seeds: the definition is shared by both records, only hits differ.
DEF_SEED = 20260721
REC_SEEDS = (11, 22)

# Deterministic point decorations, cycled by point index. Non-ASCII text
# keeps byte offsets != character offsets, and quotes/commas exercise CSV
# quoting. Tags cover the JSON-encoded form, the legacy comma form, and empty.
TIERS = (None, 0, 1, 2)
TAGS = ("", '["fmt","smoke"]', "legacy,comma tags")


def build_readout(record_index: int) -> GeneratedReadout:
    readout = GeneratedReadout(
        def_seed=DEF_SEED,
        rec_seed=REC_SEEDS[record_index],
        min_points=2,
        max_points=3,
        min_axes=1,
        max_axes=2,
        min_axis_values=2,
        max_axis_values=3,
        min_goals=1,
        max_goals=2,
        min_target=-1,
        max_target=8,
        min_hits=0,
        max_hits=12,
        group_chance_decay=0.3,
    )

    # Decorate the definition deterministically - identical for every record.
    readout.points = [
        point._replace(
            description=f'{point.description} №{index} - "quoted, commas" ✓',
            tier=TIERS[index % len(TIERS)],
            tags=TAGS[index % len(TAGS)],
            motivation=f"Motivation №{index}" if index % 3 == 0 else "",
        )
        for index, point in enumerate(readout.points)
    ]

    readout.def_sha = f"def-sha-{DEF_SEED}"
    # Shared rec_sha so the two records can be merged (same regression).
    readout.rec_sha = f"rec-sha-{DEF_SEED}"
    readout.source = "format_fixture"
    readout.source_key = f"rec_{record_index}"
    return readout


def record_snapshot(readout) -> dict:
    """
    Canonical, reader-agnostic dump of one readout. The Python and viewer
    compat tests each rebuild this exact shape from their own readers.
    """
    get_format = getattr(readout, "get_format_version", None)
    get_bucket_version = getattr(readout, "get_bucket_version", None)
    return {
        "def_sha": readout.get_def_sha(),
        "rec_sha": readout.get_rec_sha(),
        "source": readout.get_source() or "",
        "source_key": readout.get_source_key() or "",
        "bucket_version": (get_bucket_version() or "") if get_bucket_version else "",
        "format_version": int(get_format()) if get_format else 1,
        "point": [p._asdict() for p in readout.iter_points()],
        "axis": [a._asdict() for a in readout.iter_axes()],
        "axis_value": [av._asdict() for av in readout.iter_axis_values()],
        "goal": [g._asdict() for g in readout.iter_goals()],
        "bucket_goal": [bg._asdict() for bg in readout.iter_bucket_goals()],
        "point_hit": [ph._asdict() for ph in readout.iter_point_hits()],
        "bucket_hit": [bh._asdict() for bh in readout.iter_bucket_hits()],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=REPO_ROOT / "tests" / "format_fixtures",
        help="Fixture root; files are written to <output-dir>/v<N>/",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite an existing fixture directory (fixtures are frozen; "
        "only do this before the fixture has ever been committed)",
    )
    args = parser.parse_args()

    out_dir = args.output_dir / f"v{FORMAT_VERSION}"
    if out_dir.exists() and not args.force:
        raise SystemExit(
            f"{out_dir} already exists. Fixtures are frozen once committed - "
            "use --force only if this fixture has never been committed."
        )
    out_dir.mkdir(parents=True, exist_ok=True)

    archive_path = out_dir / "coverage.bktgz"
    json_path = out_dir / "coverage.json"
    for stale in (archive_path, json_path):
        stale.unlink(missing_ok=True)

    readouts = [build_readout(index) for index in range(len(REC_SEEDS))]
    for readout in readouts:
        ArchiveAccessor(archive_path).write(readout)
        JSONAccessor(json_path).write(readout)

    # Read both files straight back with this tree's own readers: the
    # snapshot records ground truth as the writing era understood it.
    archive_records = [
        record_snapshot(r) for r in ArchiveAccessor(archive_path).reader().read_all()
    ]
    json_records = [
        record_snapshot(r) for r in JSONAccessor(json_path).reader().read_all()
    ]
    if len(archive_records) != len(readouts):
        raise SystemExit("Archive readback returned the wrong record count")

    # The two formats must agree on everything except bucket_version, which
    # old JSON files never stored.
    records = []
    for archive_record, json_record in zip(archive_records, json_records, strict=True):
        archive_record = dict(archive_record)
        json_record = dict(json_record)
        bucket_versions = {
            "archive": archive_record.pop("bucket_version"),
            "json": json_record.pop("bucket_version"),
        }
        if archive_record != json_record:
            raise SystemExit(
                "Archive and JSON readbacks disagree - fixture not written"
            )
        records.append({**archive_record, "bucket_version": bucket_versions})

    expected = {"format_version": FORMAT_VERSION, "records": records}
    with (out_dir / "expected.json").open("w", encoding="utf-8") as f:
        json.dump(expected, f, indent=1, sort_keys=True, ensure_ascii=False)
        f.write("\n")

    total_buckets = len(records[0]["bucket_hit"])
    print(
        f"Wrote format v{FORMAT_VERSION} fixtures to {out_dir} "
        f"({len(records)} records, {len(records[0]['point'])} points, "
        f"{total_buckets} buckets)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
