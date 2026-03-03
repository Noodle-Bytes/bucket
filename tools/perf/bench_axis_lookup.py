#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

from __future__ import annotations

import argparse
from time import perf_counter

from bucket.axis import Axis


def benchmark_exact(iterations: int) -> float:
    axis = Axis("exact", list(range(256)), "Exact-value axis")
    start = perf_counter()
    for idx in range(iterations):
        axis.get_named_value(idx & 255)
    return perf_counter() - start


def benchmark_ranges(iterations: int) -> float:
    axis = Axis(
        "ranges",
        [[idx * 10, idx * 10 + 9] for idx in range(500)],
        "Range-heavy axis",
    )
    start = perf_counter()
    for idx in range(iterations):
        axis.get_named_value((idx * 17) % 5000)
    return perf_counter() - start


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark Axis.get_named_value")
    parser.add_argument(
        "--iterations",
        type=int,
        default=1_000_000,
        help="Number of lookup calls per benchmark",
    )
    args = parser.parse_args()

    exact_secs = benchmark_exact(args.iterations)
    range_secs = benchmark_ranges(args.iterations)

    print("Axis lookup benchmark")
    print(f"iterations: {args.iterations}")
    print(f"exact values: {exact_secs:.6f} s")
    print(f"range values: {range_secs:.6f} s")

    if exact_secs > 0:
        print(f"range/exact ratio: {range_secs / exact_secs:.2f}x")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
