#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

"""Benchmark Covertop.sample / Bucket.hit hot paths for before/after comparisons."""

from __future__ import annotations

import argparse
from statistics import median
from time import perf_counter
from types import SimpleNamespace

from bucket import Covergroup, Coverpoint, Covertop


class ExactCP(Coverpoint):
    def setup(self, ctx):
        self.add_axis("a", list(range(64)), "A")
        self.add_axis("b", list(range(16)), "B")
        self.add_axis("c", list(range(8)), "C")

    def sample(self, trace):
        self.bucket.hit(a=trace.a, b=trace.b, c=trace.c)


class SetAxesCP(Coverpoint):
    def setup(self, ctx):
        self.add_axis("a", list(range(64)), "A")
        self.add_axis("b", list(range(16)), "B")
        self.add_axis("c", list(range(8)), "C")

    def sample(self, trace):
        with self.bucket as bucket:
            bucket.set_axes(a=trace.a, b=trace.b, c=trace.c)
            bucket.hit()


class RangeCP(Coverpoint):
    def setup(self, ctx):
        self.add_axis("a", [[idx * 10, idx * 10 + 9] for idx in range(200)], "A")
        self.add_axis("b", [0, 1, 2, 3], "B")

    def sample(self, trace):
        self.bucket.hit(a=trace.a, b=trace.b)


class SkipCP(Coverpoint):
    def setup(self, ctx):
        self.add_axis("a", list(range(8)), "A")
        self.add_axis("b", list(range(8)), "B")

    def should_sample(self, trace):
        return False

    def sample(self, trace):
        self.bucket.hit(a=0, b=0)


class OneTop(Covertop):
    NAME = "one"

    def setup(self, ctx):
        self.add_coverpoint(ExactCP(), name="cp")
        self.add_coverpoint(SetAxesCP(), name="sa")
        self.add_coverpoint(RangeCP(), name="rg")


class PointGroup(Covergroup):
    def setup(self, ctx):
        for idx in range(self.n):
            self.add_coverpoint(ExactCP(), name=f"p{idx}")


class TreeTop(Covertop):
    NAME = "tree"

    def __init__(self, n: int, **kwargs):
        self.n = n
        super().__init__(**kwargs)

    def setup(self, ctx):
        group = PointGroup()
        group.n = self.n
        self.add_covergroup(group)


class SkipTop(Covertop):
    NAME = "skip"

    def setup(self, ctx):
        for idx in range(20):
            self.add_coverpoint(SkipCP(), name=f"s{idx}")
        self.add_coverpoint(ExactCP(), name="hot")


def _median_seconds(fn, *, warmup: int = 1, rounds: int = 5) -> float:
    for _ in range(warmup):
        fn()
    samples = []
    for _ in range(rounds):
        start = perf_counter()
        fn()
        samples.append(perf_counter() - start)
    return median(samples)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hit-iters", type=int, default=200_000)
    parser.add_argument("--tree-iters", type=int, default=50_000)
    args = parser.parse_args()

    one = OneTop()
    hit_iters = args.hit_iters
    tree_iters = args.tree_iters

    def hit_kwargs():
        cp = one.cp
        for idx in range(hit_iters):
            cp.bucket.hit(a=idx & 63, b=idx & 15, c=idx & 7)

    def hit_set_axes():
        cp = one.sa
        for idx in range(hit_iters):
            with cp.bucket as bucket:
                bucket.set_axes(a=idx & 63, b=idx & 15, c=idx & 7)
                bucket.hit()

    def sample_exact():
        cp = one.cp
        trace = SimpleNamespace(a=0, b=0, c=0)
        for idx in range(hit_iters):
            trace.a, trace.b, trace.c = idx & 63, idx & 15, idx & 7
            cp._sample(trace)

    def sample_range():
        cp = one.rg
        trace = SimpleNamespace(a=0, b=0)
        for idx in range(hit_iters):
            trace.a, trace.b = (idx * 17) % 2000, idx & 3
            cp._sample(trace)

    print("label\tseconds\tper_sec\tns_or_us")
    rows = [
        ("hit_kwargs_3axis", hit_kwargs, hit_iters, "ns"),
        ("with_set_axes_hit", hit_set_axes, hit_iters, "ns"),
        ("coverpoint_sample_exact", sample_exact, hit_iters, "ns"),
        ("coverpoint_sample_range", sample_range, hit_iters, "ns"),
    ]
    for label, fn, iters, unit in rows:
        secs = _median_seconds(fn)
        rate = iters / secs if secs else float("inf")
        per = (secs / iters) * (1e9 if unit == "ns" else 1e6)
        print(f"{label}\t{secs:.6f}\t{rate:.0f}\t{per:.1f}{unit}")

    def tree_run(top: Covertop, iters: int):
        trace = SimpleNamespace(a=0, b=0, c=0)

        def run():
            for idx in range(iters):
                trace.a, trace.b, trace.c = idx & 63, idx & 15, idx & 7
                top.sample(trace)

        return run

    for n_pts in (1, 5, 20):
        top = TreeTop(n_pts)
        secs = _median_seconds(tree_run(top, tree_iters), rounds=3)
        rate = tree_iters / secs if secs else float("inf")
        us = (secs / tree_iters) * 1e6
        print(f"covertop_{n_pts}pts\t{secs:.6f}\t{rate:.0f}\t{us:.2f}us")

    skip = SkipTop()
    secs = _median_seconds(tree_run(skip, tree_iters), rounds=3)
    rate = tree_iters / secs if secs else float("inf")
    us = (secs / tree_iters) * 1e6
    print(f"covertop_20skip_1hot\t{secs:.6f}\t{rate:.0f}\t{us:.2f}us")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
