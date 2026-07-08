# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

"""
Tests for Bucket.hit(): goal handling (illegal/ignore), axis validation and
kwarg-based axis setting.
"""

import logging

import pytest

from bucket import Coverpoint, Covertop


class GoalCoverpoint(Coverpoint):
    """Two-axis coverpoint with illegal and ignore goals."""

    NAME = "cp"
    DESCRIPTION = "Goal coverpoint"

    def setup(self, ctx):
        self.add_axis("a", values=[0, 1], description="Axis A")
        self.add_axis("b", values=[0, 1], description="Axis B")
        self.add_goal("NAUGHTY", "Illegal combination", illegal=True)
        self.add_goal("BORING", "Ignored combination", ignore=True)

    def apply_goals(self, bucket, goals):
        if bucket.a.value == 1 and bucket.b.value == 1:
            return goals.NAUGHTY
        if bucket.a.value == 0 and bucket.b.value == 1:
            return goals.BORING

    def sample(self, trace):
        self.bucket.clear()
        self.bucket.hit(a=trace["a"], b=trace["b"])


class GoalTop(Covertop):
    def setup(self, ctx):
        self.add_coverpoint(GoalCoverpoint())


class TestBucketHit:
    def test_hit_with_kwargs_increments_bucket(self):
        cvg = GoalTop()
        cvg.sample({"a": 0, "b": 0})
        cvg.sample({"a": 0, "b": 0})
        assert cvg.cp._cvg_hits[("0", "0")] == 2

    def test_set_axes_then_hit_increments_bucket(self):
        cvg = GoalTop()
        cp = cvg.cp
        with cp.bucket as bucket:
            bucket.set_axes(a=1)
            bucket.set_axes(b=0)
            bucket.hit()
        assert cp._cvg_hits[("1", "0")] == 1

    def test_ignore_goal_is_not_counted(self):
        cvg = GoalTop()
        cvg.sample({"a": 0, "b": 1})
        assert ("0", "1") not in cvg.cp._cvg_hits

    def test_illegal_goal_logs_error_by_default(self, caplog):
        cvg = GoalTop()
        with caplog.at_level(logging.ERROR):
            cvg.sample({"a": 1, "b": 1})
        assert "Illegal bucket" in caplog.text
        # Illegal buckets are still counted (target != 0)
        assert cvg.cp._cvg_hits[("1", "1")] == 1

    def test_illegal_goal_raises_when_configured(self):
        cvg = GoalTop(except_on_illegal=True)
        with pytest.raises(RuntimeError, match="Illegal bucket"):
            cvg.sample({"a": 1, "b": 1})

    def test_hit_with_missing_axis_raises(self):
        cvg = GoalTop()
        bucket = cvg.cp.bucket
        bucket.clear()
        bucket.set_axes(a=0)
        with pytest.raises(AssertionError, match="Incorrect number of axes"):
            bucket.hit()
        bucket.clear()

    def test_hit_with_wrong_axis_name_raises(self):
        cvg = GoalTop()
        bucket = cvg.cp.bucket
        bucket.clear()
        # Right number of axes, but 'c' is not an axis and 'b' is unset
        bucket.set_axes(a=0, c=0)
        with pytest.raises(Exception, match="Axis b has not been set"):
            bucket.hit()
        bucket.clear()

    def test_unrecognised_axis_value_raises(self):
        from bucket.axis import AxisUnrecognisedValue

        cvg = GoalTop()
        with pytest.raises(AxisUnrecognisedValue):
            cvg.sample({"a": 7, "b": 0})
