# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

import random
from pathlib import Path
from tempfile import TemporaryDirectory

from bucket.rw import ArchiveAccessor
from examples.riscv_stress.generate_stress_data import (
    generate,
    generate_viewer_demo,
)
from examples.riscv_stress.stress_common import (
    RISCVDataset,
    build_coverage,
    generate_trace,
    tree_stats,
)
from examples.riscv_stress.stress_example import bench_sample, run


def test_tree_builds_and_samples():
    riscv_data = RISCVDataset()
    cvg = build_coverage(riscv_data=riscv_data, source="unit_test")
    stats = tree_stats(cvg)
    assert stats["coverpoints"] > 20
    assert stats["buckets"] > 5_000

    rand = random.Random(0)
    for _ in range(50):
        cvg.sample(generate_trace(rand, riscv_data))


def test_tree_copies_scale_coverpoints():
    base = tree_stats(build_coverage(copies=1))
    doubled = tree_stats(build_coverage(copies=2))
    assert doubled["coverpoints"] == base["coverpoints"] * 2
    assert doubled["buckets"] == base["buckets"] * 2


def test_sample_bench_runs():
    result = bench_sample(iters=32, warmup=8, copies=1, seed=1)
    assert result["iters"] == 32
    assert result["coverpoints"] > 0
    assert result["buckets"] > 0
    assert result["sample_seconds"] >= 0


def test_run_export_and_merge():
    with TemporaryDirectory() as tmpdir:
        output = Path(tmpdir)
        run(
            output_dir=output,
            num_tests=3,
            seed=1,
            export_formats=["archive"],
            samples_per_test=20,
        )
        merged = output / "riscv_stress" / "riscv_stress_merged.bktgz"
        assert merged.is_file()
        assert (
            len(
                list(
                    (output / "riscv_stress" / "test_outputs" / "archive").glob(
                        "*.bktgz"
                    )
                )
            )
            == 3
        )


def test_generate_synthetic_and_merge():
    with TemporaryDirectory() as tmpdir:
        output = Path(tmpdir)
        generate(
            output_dir=output,
            num_tests=3,
            seed=1,
            formats=["archive"],
            copies=1,
        )
        merged = output / "riscv_stress" / "riscv_stress_merged.bktgz"
        assert merged.is_file()


def test_generate_viewer_demo_has_varied_coverage_states():
    with TemporaryDirectory() as tmpdir:
        output = Path(tmpdir) / "riscv_stress_viewer_demo.bktgz"
        generate_viewer_demo(output_path=output, seed=1)

        readout = next(ArchiveAccessor(output).read_all())
        points = list(readout.iter_points())
        point_hits = list(readout.iter_point_hits())
        goals = list(readout.iter_goals())
        bucket_goals = list(readout.iter_bucket_goals())
        bucket_hits = list(readout.iter_bucket_hits())

        states = set()
        for bucket_goal, bucket_hit in zip(bucket_goals, bucket_hits):
            target = goals[bucket_goal.goal].target
            if target <= 0:
                continue
            if bucket_hit.hits == 0:
                states.add("unhit")
            elif bucket_hit.hits < target:
                states.add("partial")
            else:
                states.add("hit")
        assert states == {"hit", "partial", "unhit"}

        leaf_ratios = [
            hit.hits / point.target
            for point, hit in zip(points, point_hits)
            if point.end == point.start + 1 and point.target > 0
        ]
        assert min(leaf_ratios) < 0.1
        assert max(leaf_ratios) > 0.9
        assert len({round(ratio, 1) for ratio in leaf_ratios}) >= 6
