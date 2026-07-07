#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
"""
Generate two .bktgz files suitable for viewer A/B compare mode.

Both files use the full TopPets example covertree (same def_sha) with different
random sampling seeds so bucket hits diverge across all four compare categories.

Usage (from repo root, with bucket installed):

    python tools/gen_compare_fixtures.py
    python tools/gen_compare_fixtures.py --output-dir example/fixtures
"""

from __future__ import annotations

import argparse
import logging
import random
import subprocess
from pathlib import Path

from bucket import CoverageContext
from bucket.rw import ArchiveAccessor, PointReader
from example.common import MadeUpStuff
from example.example import pretend_monitor
from example.top import TopPets


def get_context_hash(repo_root: Path) -> str:
    return subprocess.check_output(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_root,
        text=True,
    ).strip()


def run_labeled_regression(
    output_path: Path,
    seed: int,
    samples: int,
    source_key: str,
    log: logging.Logger,
) -> Path:
    rand = random.Random(seed)
    pet_info = MadeUpStuff()

    with CoverageContext(pet_info=pet_info):
        cvg = TopPets()

    for _ in range(samples):
        cvg.sample(pretend_monitor(rand))

    repo_root = Path(__file__).resolve().parent.parent
    context_hash = get_context_hash(repo_root)
    point_reader = PointReader(
        context_hash, source="compare_fixture", source_key=source_key
    )
    readout = point_reader.read(cvg)

    archive_path = output_path.with_suffix(".bktgz")
    ArchiveAccessor(archive_path).write(readout)
    log.info(
        "Wrote %s (seed=%s, samples=%s, source_key=%s)",
        archive_path,
        seed,
        samples,
        source_key,
    )
    return archive_path


def summarize_pair(path_a: Path, path_b: Path, log: logging.Logger) -> None:
    readout_a = next(ArchiveAccessor(path_a).reader().read_all())
    readout_b = next(ArchiveAccessor(path_b).reader().read_all())

    if readout_a.get_def_sha() != readout_b.get_def_sha():
        raise RuntimeError(
            "Fixture pair has mismatched def_sha — compare mode requires the same covertree."
        )

    hits_a = {bh.start: bh.hits for bh in readout_a.iter_bucket_hits(0, None)}
    hits_b = {bh.start: bh.hits for bh in readout_b.iter_bucket_hits(0, None)}
    goal_target = {g.start: g.target for g in readout_a.iter_goals(0, None)}
    bucket_goal = {bg.start: bg.goal for bg in readout_a.iter_bucket_goals(0, None)}

    a_only = both = b_only = neither = 0
    for bucket_idx, goal_idx in bucket_goal.items():
        target = goal_target.get(goal_idx, 0)
        if target <= 0:
            continue
        ha = hits_a.get(bucket_idx, 0)
        hb = hits_b.get(bucket_idx, 0)
        ca = ha > 0
        cb = hb > 0
        if ca and cb:
            both += 1
        elif ca:
            a_only += 1
        elif cb:
            b_only += 1
        else:
            neither += 1

    valid = a_only + both + b_only + neither
    log.info("def_sha match: %s…", readout_a.get_def_sha()[:16])
    log.info(
        "Valid-bucket categories (any hit): A-only=%s Both=%s B-only=%s Neither=%s (total=%s)",
        a_only,
        both,
        b_only,
        neither,
        valid,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("example/fixtures"),
        help="Directory for compare_a.bktgz and compare_b.bktgz",
    )
    parser.add_argument(
        "--samples",
        type=int,
        default=400,
        help="Random samples per regression (more → more overlap/divergence)",
    )
    parser.add_argument(
        "--seed-a",
        type=int,
        default=101,
        help="RNG seed for record A",
    )
    parser.add_argument(
        "--seed-b",
        type=int,
        default=202,
        help="RNG seed for record B",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    log = logging.getLogger("compare_fixtures")

    args.output_dir.mkdir(parents=True, exist_ok=True)

    path_a = run_labeled_regression(
        args.output_dir / "compare_a",
        seed=args.seed_a,
        samples=args.samples,
        source_key=f"seed_{args.seed_a}",
        log=log,
    )
    path_b = run_labeled_regression(
        args.output_dir / "compare_b",
        seed=args.seed_b,
        samples=args.samples,
        source_key=f"seed_{args.seed_b}",
        log=log,
    )

    summarize_pair(path_a, path_b, log)
    log.info("Load both files in the viewer, then open Compare mode.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
