# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

"""
How much of one coverage record is also covered by another.

Illegal (negative target), ignore (zero target) and waived buckets are left
out, matching the viewer. Hits are capped at each bucket's goal, which is how
the summary table's Total Hits column is scored.
"""

from typing import Literal

from .rw.common import Readout

Metric = Literal["buckets", "hits", "full"]

METRICS: tuple[Metric, ...] = ("buckets", "hits", "full")


class CompareError(ValueError):
    pass


def _dense_hits(readout: Readout) -> list[int]:
    hits: list[int] = []
    for bucket in readout.iter_bucket_hits():
        if bucket.start >= len(hits):
            hits.extend([0] * (bucket.start + 1 - len(hits)))
        hits[bucket.start] = bucket.hits
    return hits


def _dense_targets(readout: Readout) -> list[int]:
    goals = list(readout.iter_goals())
    targets: list[int] = []
    for bucket in readout.iter_bucket_goals():
        if bucket.start >= len(targets):
            targets.extend([0] * (bucket.start + 1 - len(targets)))
        target = goals[bucket.goal].target if 0 <= bucket.goal < len(goals) else 0
        targets[bucket.start] = target
    return targets


def _waived(readout: Readout) -> set[int]:
    return {waiver.start for waiver in readout.iter_bucket_waivers()}


def coverage_overlap(
    a: Readout, b: Readout, metric: Metric = "buckets"
) -> tuple[int, int]:
    """
    Return ``(covered_by_b, covered_in_a)`` for ``metric``.

    ``buckets`` counts buckets with at least one hit. ``full`` counts buckets
    that met their goal. ``hits`` sums goal-capped hits, and B only counts
    toward A's total up to the hits A already has on that bucket.
    """
    if metric not in METRICS:
        raise CompareError(
            f"Unknown metric {metric!r}; choose from {', '.join(METRICS)}"
        )

    if a.get_def_sha() != b.get_def_sha():
        raise CompareError(
            "Cannot compare records with different covertree definitions "
            f"({a.get_def_sha()} vs {b.get_def_sha()})"
        )

    hits_a = _dense_hits(a)
    hits_b = _dense_hits(b)
    targets = _dense_targets(a)
    waived = _waived(a) | _waived(b)
    size = max(len(hits_a), len(hits_b), len(targets))

    numerator = 0
    denominator = 0
    for index in range(size):
        target = targets[index] if index < len(targets) else 0
        if target <= 0 or index in waived:
            continue
        hit_a = hits_a[index] if index < len(hits_a) else 0
        hit_b = hits_b[index] if index < len(hits_b) else 0
        if metric == "buckets":
            if hit_a > 0:
                denominator += 1
                if hit_b > 0:
                    numerator += 1
        elif metric == "full":
            if hit_a >= target:
                denominator += 1
                if hit_b >= target:
                    numerator += 1
        else:
            capped_a = min(hit_a, target)
            capped_b = min(hit_b, target)
            denominator += capped_a
            numerator += min(capped_a, capped_b)

    return numerator, denominator


def overlap_percentage(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return 100.0 * numerator / denominator
