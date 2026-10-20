# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

import pytest

from bucket.compare import CompareError, coverage_overlap, overlap_percentage
from bucket.rw.common import (
    BucketGoalTuple,
    BucketHitTuple,
    BucketWaiverTuple,
    GoalTuple,
    PuppetReadout,
)


def readout(hits, targets, *, sha="def", waivers=()):
    record = PuppetReadout()
    record.def_sha = sha
    record.rec_sha = sha
    record.goals = [
        GoalTuple(start=index, target=target, name=str(index), description="")
        for index, target in enumerate(targets)
    ]
    record.bucket_goals = [
        BucketGoalTuple(start=index, goal=index) for index in range(len(targets))
    ]
    record.bucket_hits = [
        BucketHitTuple(start=index, hits=hit) for index, hit in enumerate(hits)
    ]
    record.bucket_waivers = [
        BucketWaiverTuple(start=index, reason="waived") for index in waivers
    ]
    return record


class TestCoverageOverlap:
    def test_buckets_are_the_share_of_a_that_b_also_hit(self):
        # targets: hit, ignore, illegal, hit, hit
        a = readout([1, 5, 9, 0, 3], [1, 0, -1, 2, 4])
        b = readout([0, 5, 9, 1, 1], [1, 0, -1, 2, 4])
        # A hit buckets 0 and 4; B also hit 4.
        assert coverage_overlap(a, b, "buckets") == (1, 2)
        assert overlap_percentage(1, 2) == 50.0

    def test_full_requires_the_goal(self):
        a = readout([2, 1, 5], [2, 3, 4])
        b = readout([2, 3, 1], [2, 3, 4])
        # A is full on 0 and 2; B is full on 0 only.
        assert coverage_overlap(a, b, "full") == (1, 2)

    def test_hits_are_capped_at_the_goal_and_at_a(self):
        a = readout([1, 10], [4, 4])
        b = readout([3, 2], [4, 4])
        # bucket 0: min(1, 3) of 1; bucket 1: min(4, 2) of 4
        assert coverage_overlap(a, b, "hits") == (3, 5)

    def test_waived_buckets_are_excluded(self):
        a = readout([5, 5], [5, 5], waivers=(0,))
        b = readout([0, 5], [5, 5])
        assert coverage_overlap(a, b, "buckets") == (1, 1)
        assert coverage_overlap(a, b, "hits") == (5, 5)

    def test_empty_a_is_zero(self):
        a = readout([0, 0], [2, 2])
        b = readout([2, 2], [2, 2])
        assert coverage_overlap(a, b) == (0, 0)
        assert overlap_percentage(0, 0) == 0.0

    def test_different_definitions_are_rejected(self):
        with pytest.raises(CompareError, match="different covertree"):
            coverage_overlap(readout([1], [1], sha="a"), readout([1], [1], sha="b"))
