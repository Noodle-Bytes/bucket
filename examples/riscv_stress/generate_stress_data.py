# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

from __future__ import annotations

import logging
import random
from collections import Counter
from pathlib import Path

from bucket.rw import ArchiveAccessor, PointReader
from bucket.rw.common import (
    BucketHitTuple,
    PointHitTuple,
    PointTuple,
    PuppetReadout,
)

from .stress_common import RISCVDataset, build_coverage, context_hash, generate_trace
from .stress_example import export_readout, merge_format, parse_formats

DEMO_MODULE_COVERAGE = {
    "arithmetic": 0.92,
    "compare": 0.70,
    "control_flow": 0.48,
    "exceptions": 0.18,
    "instruction_formats": 0.78,
    "logical": 0.34,
    "memory_operations": 0.60,
    "pipeline": 0.12,
    "register_file": 0.85,
    "system": 0.42,
}

# Complementary profile for the second record in the viewer example archive.
DEMO_MODULE_COVERAGE_B = {
    "arithmetic": 0.22,
    "compare": 0.38,
    "control_flow": 0.82,
    "exceptions": 0.74,
    "instruction_formats": 0.28,
    "logical": 0.88,
    "memory_operations": 0.45,
    "pipeline": 0.90,
    "register_file": 0.20,
    "system": 0.66,
}

DEMO_COVERPOINT_OFFSETS = (-0.08, 0.0, 0.08)


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


def _demo_bucket_hits(target: int, coverage: float, rand: random.Random) -> int:
    """Return a hit count whose expected target ratio is ``coverage``."""
    if target <= 0:
        return 0
    if target == 1:
        return 1 if rand.random() < coverage else 0

    # A partial bucket contributes half its target. These probabilities make
    # the expected contribution equal to the requested coverage while keeping
    # the viewer's hit, partial, and unhit states visible.
    full_probability = max(0.0, (2 * coverage) - 1)
    partial_probability = 2 * min(coverage, 1 - coverage)
    draw = rand.random()
    if draw < full_probability:
        return target
    if draw < full_probability + partial_probability:
        return max(1, target // 2)
    return 0


def _axis_value_names(
    definition: PuppetReadout,
    point: PointTuple,
) -> list[list[str]]:
    """Return axis value names for a point, in axis order (last axis fastest)."""
    axes = list(definition.iter_axes(point.axis_start, point.axis_end))
    axis_values = list(
        definition.iter_axis_values(point.axis_value_start, point.axis_value_end)
    )
    names: list[list[str]] = []
    for axis in axes:
        local = [
            str(value.value)
            for value in axis_values
            if axis.value_start <= value.start < axis.value_end
        ]
        names.append(local)
    return names


def _paint_jump_operations_pivot_demo(
    definition: PuppetReadout,
    bucket_hits: list[int],
    *,
    fill_jalr_holes: bool,
) -> None:
    """Overwrite jump_operations with a pivot-friendly coverage pattern.

    Pivot jump_type (rows) × rd (columns) shows on one screen:
    - JAL fully covered across return registers
    - JALR empty for low registers unless ``fill_jalr_holes``
    - Other only hit for x1

    That structure is hard to spot in a flat bucket list and obvious in the
    pivot table.
    """
    points = list(definition.iter_points())
    goals = list(definition.iter_goals())
    bucket_goals = list(definition.iter_bucket_goals())
    point = next(
        (
            candidate
            for candidate in points
            if candidate.end == candidate.start + 1
            and candidate.name == "jump_operations"
        ),
        None,
    )
    if point is None:
        return

    axis_names = _axis_value_names(definition, point)
    if len(axis_names) != 3:
        return
    jump_names, rd_names, _target_names = axis_names
    sizes = [len(names) for names in axis_names]

    for bucket_idx in range(point.bucket_start, point.bucket_end):
        target = goals[bucket_goals[bucket_idx].goal].target
        if target <= 0:
            bucket_hits[bucket_idx] = 0
            continue

        offset = bucket_idx - point.bucket_start
        indices: list[int] = []
        remaining = offset
        for size in reversed(sizes):
            indices.append(remaining % size)
            remaining //= size
        indices.reverse()
        jump_type = jump_names[indices[0]]
        rd = rd_names[indices[1]]

        if jump_type == "JAL":
            covered = True
        elif jump_type == "JALR":
            # Leave x0/x1/x2 empty in baseline; fill them in the improved record.
            covered = fill_jalr_holes or indices[1] >= 3
        else:
            covered = rd == "x1"

        bucket_hits[bucket_idx] = target if covered else 0


def generate_viewer_demo_readout(
    definition: PuppetReadout,
    *,
    seed: int = 42,
    module_coverage: dict[str, float] | None = None,
    source: str = "riscv_stress_viewer_demo",
    source_key: str | None = None,
) -> PuppetReadout:
    """Create presentation-friendly coverage with varied sunburst sectors."""
    coverage_by_module = module_coverage or DEMO_MODULE_COVERAGE
    readout = copy_definition(definition)
    rand = random.Random(seed)
    points = list(definition.iter_points())
    goals = list(definition.iter_goals())
    bucket_goals = list(definition.iter_bucket_goals())
    bucket_hits = [0] * len(bucket_goals)

    modules = [point for point in points if point.depth == 1]
    leaves = [
        point
        for point in points
        if point.end == point.start + 1 and point.bucket_end > point.bucket_start
    ]
    module_leaf_counts: Counter[str] = Counter()

    for point in leaves:
        module = next(
            module
            for module in modules
            if module.bucket_start <= point.bucket_start
            and point.bucket_end <= module.bucket_end
        )
        leaf_index = module_leaf_counts[module.name]
        module_leaf_counts[module.name] += 1
        base_module_name = module.name
        if base_module_name not in coverage_by_module:
            name_without_copy, separator, copy_index = base_module_name.rpartition("_")
            if separator and copy_index.isdigit():
                base_module_name = name_without_copy
        coverage = coverage_by_module.get(base_module_name, 0.5)
        coverage += DEMO_COVERPOINT_OFFSETS[leaf_index % len(DEMO_COVERPOINT_OFFSETS)]
        coverage = min(1.0, max(0.0, coverage))

        for bucket_idx in range(point.bucket_start, point.bucket_end):
            target = goals[bucket_goals[bucket_idx].goal].target
            bucket_hits[bucket_idx] = _demo_bucket_hits(target, coverage, rand)

    resolved_key = source_key if source_key is not None else str(seed)
    _paint_jump_operations_pivot_demo(
        definition,
        bucket_hits,
        fill_jalr_holes=resolved_key == "improved",
    )

    readout.bucket_hits = [
        BucketHitTuple(start=index, hits=hits) for index, hits in enumerate(bucket_hits)
    ]
    readout.point_hits = calculate_point_hits(definition, bucket_hits)
    readout.source = source
    readout.source_key = resolved_key
    return readout


def generate_viewer_demo(
    output_path: Path = Path("output/riscv_stress/riscv_stress_viewer_demo.bktgz"),
    *,
    seed: int = 42,
    copies: int = 1,
) -> Path:
    """Write a two-record RISC-V archive for the viewer (browse + Compare)."""
    logging.basicConfig(level=logging.INFO)
    log = logging.getLogger("stress_demo")
    definition = capture_definition(copies=copies, seed=seed)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()

    ArchiveAccessor(output_path).write(
        generate_viewer_demo_readout(
            definition,
            seed=seed,
            module_coverage=DEMO_MODULE_COVERAGE,
            source="riscv_compare",
            source_key="baseline",
        )
    )
    ArchiveAccessor(output_path).write(
        generate_viewer_demo_readout(
            definition,
            seed=seed + 1,
            module_coverage=DEMO_MODULE_COVERAGE_B,
            source="riscv_compare",
            source_key="improved",
        )
    )
    log.info("Viewer demo written to %s (2 records)", output_path)
    return output_path


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
