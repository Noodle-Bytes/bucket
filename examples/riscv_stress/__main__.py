# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

"""RISC-V stress example: sample large covertrees and merge large datasets."""

from __future__ import annotations

import argparse
from pathlib import Path

from .generate_stress_data import generate
from .stress_example import bench_sample, run


def _add_common_io_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("output"),
        help="Directory for generated files (default: ./output)",
    )
    parser.add_argument(
        "--formats",
        nargs="+",
        default=None,
        help="Export formats: archive sql json all both (default depends on command)",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--copies",
        type=int,
        default=1,
        help="Replicate the module set this many times to enlarge the covertree",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    sample_p = sub.add_parser(
        "sample",
        help="Benchmark Covertop.sample on the full stress tree (no I/O)",
    )
    sample_p.add_argument("--iters", type=int, default=50_000)
    sample_p.add_argument("--warmup", type=int, default=1_000)
    sample_p.add_argument("--copies", type=int, default=1)
    sample_p.add_argument("--seed", type=int, default=42)

    run_p = sub.add_parser(
        "run",
        help="Sample, export, and merge real coverage runs",
    )
    _add_common_io_args(run_p)
    run_p.add_argument("--num-tests", type=int, default=10)
    run_p.add_argument(
        "--samples-per-test",
        type=int,
        default=None,
        help="Traces per test (default: random 100-500)",
    )

    gen_p = sub.add_parser(
        "generate",
        help="Synthesize many compatible readouts and time merging them",
    )
    _add_common_io_args(gen_p)
    gen_p.add_argument("--num-tests", type=int, default=100)
    gen_p.add_argument("--skip-generation", action="store_true")
    gen_p.add_argument("--skip-merge", action="store_true")
    gen_p.add_argument("--max-hits", type=int, default=1000)
    gen_p.add_argument(
        "--hit-rate",
        type=float,
        default=0.35,
        help="Fraction of buckets given a non-zero hit count (default: 0.35)",
    )

    args = parser.parse_args()
    if args.command == "sample":
        bench_sample(
            iters=args.iters,
            warmup=args.warmup,
            copies=args.copies,
            seed=args.seed,
        )
        return 0
    if args.command == "run":
        run(
            output_dir=args.output_dir,
            num_tests=args.num_tests,
            seed=args.seed,
            export_formats=args.formats,
            samples_per_test=args.samples_per_test,
            copies=args.copies,
        )
        return 0
    generate(
        output_dir=args.output_dir,
        num_tests=args.num_tests,
        seed=args.seed,
        formats=args.formats,
        copies=args.copies,
        skip_generation=args.skip_generation,
        skip_merge=args.skip_merge,
        max_hits=args.max_hits,
        hit_rate=args.hit_rate,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
