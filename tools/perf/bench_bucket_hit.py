#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

from __future__ import annotations

import argparse
from time import perf_counter

from bucket import Coverpoint, Covertop


class ExactCoverpoint(Coverpoint):
    def setup(self, ctx):
        self.add_axis("a", list(range(64)), "Axis A")
        self.add_axis("b", list(range(16)), "Axis B")
        self.add_axis("c", list(range(8)), "Axis C")

    def sample(self, trace):
        pass


class RangeCoverpoint(Coverpoint):
    def setup(self, ctx):
        self.add_axis("a", [[idx * 10, idx * 10 + 9] for idx in range(500)], "Axis A")
        self.add_axis("b", [0, 1, 2, 3], "Axis B")

    def sample(self, trace):
        pass


class ExactTop(Covertop):
    NAME = "exact_top"

    def setup(self, ctx):
        self.add_coverpoint(ExactCoverpoint(), name="cp")


class RangeTop(Covertop):
    NAME = "range_top"

    def setup(self, ctx):
        self.add_coverpoint(RangeCoverpoint(), name="cp")


def benchmark_exact(iterations: int) -> float:
    top = ExactTop()
    cp = top.cp

    start = perf_counter()
    for idx in range(iterations):
        cp.bucket.hit(a=idx & 63, b=idx & 15, c=idx & 7)
    return perf_counter() - start


def benchmark_ranges(iterations: int) -> float:
    top = RangeTop()
    cp = top.cp

    start = perf_counter()
    for idx in range(iterations):
        cp.bucket.hit(a=(idx * 17) % 5000, b=idx & 3)
    return perf_counter() - start


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark Bucket.hit hot path")
    parser.add_argument(
        "--iterations",
        type=int,
        default=300_000,
        help="Number of hit calls per benchmark",
    )
    args = parser.parse_args()

    exact_secs = benchmark_exact(args.iterations)
    range_secs = benchmark_ranges(args.iterations)

    print("Bucket.hit benchmark")
    print(f"iterations: {args.iterations}")
    print(f"exact-axis coverpoint: {exact_secs:.6f} s")
    print(f"range-axis coverpoint: {range_secs:.6f} s")

    if exact_secs > 0:
        print(f"range/exact ratio: {range_secs / exact_secs:.2f}x")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
