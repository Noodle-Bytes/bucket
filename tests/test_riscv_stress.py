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

        readouts = list(ArchiveAccessor(output).read_all())
        assert len(readouts) == 2
        assert readouts[0].get_def_sha() == readouts[1].get_def_sha()
        assert readouts[0].get_source_key() == "baseline"
        assert readouts[1].get_source_key() == "improved"

        readout = readouts[0]
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

        # jump_operations is painted for the pivot demo: baseline has JALR holes
        # on low return registers; improved fills them.
        baseline, improved = readouts
        points = list(baseline.iter_points())
        jump = next(p for p in points if p.name == "jump_operations")
        axes = list(baseline.iter_axes(jump.axis_start, jump.axis_end))
        axis_values = list(
            baseline.iter_axis_values(jump.axis_value_start, jump.axis_value_end)
        )
        jump_names = [
            str(v.value)
            for v in axis_values
            if axes[0].value_start <= v.start < axes[0].value_end
        ]
        rd_names = [
            str(v.value)
            for v in axis_values
            if axes[1].value_start <= v.start < axes[1].value_end
        ]
        target_size = sum(
            1 for v in axis_values if axes[2].value_start <= v.start < axes[2].value_end
        )
        sizes = [len(jump_names), len(rd_names), target_size]

        def cell_hit(readout, jump_idx: int, rd_idx: int) -> bool:
            hits = list(readout.iter_bucket_hits())
            # Any target range for this jump_type×rd counts as covered for the pivot.
            for target_idx in range(target_size):
                offset = jump_idx * sizes[1] * sizes[2] + rd_idx * sizes[2] + target_idx
                if hits[jump.bucket_start + offset].hits > 0:
                    return True
            return False

        jal = jump_names.index("JAL")
        jalr = jump_names.index("JALR")
        assert cell_hit(baseline, jal, 0)
        assert not cell_hit(baseline, jalr, 0)
        assert not cell_hit(baseline, jalr, 1)
        assert cell_hit(baseline, jalr, 3)
        assert cell_hit(improved, jalr, 0)
        assert cell_hit(improved, jalr, 1)
