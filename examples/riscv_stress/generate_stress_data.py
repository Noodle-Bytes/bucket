# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

from __future__ import annotations

import logging
import random
from pathlib import Path

from bucket.rw import PointReader
from bucket.rw.common import (
    BucketHitTuple,
    PointHitTuple,
    PuppetReadout,
)

from .stress_common import RISCVDataset, build_coverage, context_hash, generate_trace
from .stress_example import export_readout, merge_format, parse_formats


def capture_definition(copies: int = 1, seed: int = 42) -> PuppetReadout:
    """Build the stress tree once so synthetic records share a definition."""
    log = logging.getLogger("stress_generate")
    log.info("Capturing coverage definition from one sampled tree...")
    riscv_data = RISCVDataset()
    rand = random.Random(seed)
    cvg = build_coverage(
        copies=copies,
        source="definition_template",
        source_key="definition",
        riscv_data=riscv_data,
    )
    for _ in range(32):
        cvg.sample(generate_trace(rand, riscv_data))
    readout = PointReader(context_hash()).read(cvg)
    log.info(
        "Definition captured: %d points, %d buckets",
        len(list(readout.iter_points())),
        len(list(readout.iter_bucket_goals())),
    )
    return readout


def copy_definition(src: PuppetReadout) -> PuppetReadout:
    dest = PuppetReadout()
    dest.def_sha = src.get_def_sha()
    dest.rec_sha = src.get_rec_sha()
    dest.bucket_version = src.get_bucket_version()
    dest.format_version = src.get_format_version()
    dest.points = list(src.iter_points())
    dest.axes = list(src.iter_axes())
    dest.axis_values = list(src.iter_axis_values())
    dest.goals = list(src.iter_goals())
    dest.bucket_goals = list(src.iter_bucket_goals())
    return dest


def calculate_point_hits(
    definition: PuppetReadout, bucket_hits: list[int]
) -> list[PointHitTuple]:
    goal_targets = [goal.target for goal in definition.goals]
    bucket_targets = [
        goal_targets[bucket_goal.goal] for bucket_goal in definition.bucket_goals
    ]
    point_hits = []
    for point in definition.points:
        hits = 0
        hit_buckets = 0
        full_buckets = 0
        for bucket_idx in range(point.bucket_start, point.bucket_end):
            bucket_hit_count = bucket_hits[bucket_idx]
            target = (
                bucket_targets[bucket_idx] if bucket_idx < len(bucket_targets) else 0
            )
            if target > 0:
                bucket_hits_clamped = min(bucket_hit_count, target)
                if bucket_hit_count > 0:
                    hit_buckets += 1
                    if bucket_hits_clamped == target:
                        full_buckets += 1
                    hits += bucket_hits_clamped
        point_hits.append(
            PointHitTuple(
                start=point.start,
                depth=point.depth,
                hits=hits,
                hit_buckets=hit_buckets,
                full_buckets=full_buckets,
            )
        )
    return point_hits


def generate_synthetic_readout(
    definition: PuppetReadout,
    test_num: int,
    rand: random.Random,
    *,
    max_hits: int = 1000,
    hit_rate: float = 0.35,
) -> PuppetReadout:
    readout = copy_definition(definition)
    num_buckets = len(definition.bucket_goals)
    bucket_hits_list = [
        rand.randint(1, max_hits) if rand.random() < hit_rate else 0
        for _ in range(num_buckets)
    ]
    readout.bucket_hits = [
        BucketHitTuple(start=i, hits=hits) for i, hits in enumerate(bucket_hits_list)
    ]
    readout.point_hits = calculate_point_hits(definition, bucket_hits_list)
    readout.source = f"synthetic_test_{test_num:03d}"
    readout.source_key = str(rand.randint(1, 1_000_000))
    return readout


def generate(
    output_dir: Path = Path("output"),
    num_tests: int = 100,
    seed: int = 42,
    formats: list[str] | None = None,
    copies: int = 1,
    skip_generation: bool = False,
    skip_merge: bool = False,
    max_hits: int = 1000,
    hit_rate: float = 0.35,
):
    """Generate synthetic readouts matching the stress tree, then merge them."""
    logging.basicConfig(level=logging.INFO)
    log = logging.getLogger("stress_generate")
    export_formats = parse_formats(formats if formats is not None else ["all"])

    stress_output_dir = output_dir / "riscv_stress"
    test_outputs_dir = stress_output_dir / "test_outputs"
    test_outputs_dir.mkdir(parents=True, exist_ok=True)

    if not skip_generation:
        definition = capture_definition(copies=copies, seed=seed)
        rand = random.Random(seed)
        log.info(
            "Generating %d synthetic readouts (hit_rate=%.2f, copies=%d)",
            num_tests,
            hit_rate,
            copies,
        )
        for test_num in range(num_tests):
            readout = generate_synthetic_readout(
                definition,
                test_num,
                rand,
                max_hits=max_hits,
                hit_rate=hit_rate,
            )
            export_readout(
                readout, test_outputs_dir, f"test_{test_num:03d}", export_formats
            )
            if (test_num + 1) % 50 == 0 or test_num + 1 == num_tests:
                log.info("Wrote %d/%d synthetic files", test_num + 1, num_tests)

    if skip_merge:
        return

    times: dict[str, float] = {}
    for fmt in export_formats:
        fmt_dir = test_outputs_dir / fmt
        if fmt == "archive":
            paths = sorted(fmt_dir.glob("test_*.bktgz"))
            merged_path = stress_output_dir / "riscv_stress_merged.bktgz"
        elif fmt == "sql":
            paths = sorted(fmt_dir.glob("test_*.db"))
            merged_path = stress_output_dir / "riscv_stress_merged.db"
        else:
            paths = sorted(fmt_dir.glob("test_*.json"))
            merged_path = stress_output_dir / "riscv_stress_merged.json"
        if num_tests:
            paths = paths[:num_tests]
        times[fmt] = merge_format(log, paths, merged_path, fmt)

    log.info("=" * 60)
    log.info("Synthetic generation complete")
    for fmt, elapsed in times.items():
        log.info("  %s merge: %.2fs", fmt, elapsed)
    if len(times) >= 2:
        ordered = sorted(
            ((fmt, elapsed) for fmt, elapsed in times.items() if elapsed > 0),
            key=lambda item: item[1],
        )
        if len(ordered) >= 2:
            fastest, slowest = ordered[0], ordered[-1]
            log.info(
                "  %s was %.2fx faster than %s",
                fastest[0],
                slowest[1] / fastest[1],
                slowest[0],
            )
    log.info("=" * 60)
