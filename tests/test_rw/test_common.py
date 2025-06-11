# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

import pytest

from bucket.rw.common import CoverageAccess, MergeReadout, PuppetReadout

from ..utils import GeneratedReadout


class TestCommon:
    def test_full_readout(self):
        """
        Tests correct results for a uniform generated readout where every
        bucket is fully hit
        """
        readout = GeneratedReadout(
            min_goals=(goals := 3),
            max_goals=goals,
            min_axes=(axes := 3),
            max_axes=axes,
            min_axis_values=(axis_values := 3),
            max_axis_values=axis_values,
            min_target=(target := 3),
            max_target=target,
            min_hits=(hits := 3),
            max_hits=hits,
            min_points=(points := 5),
            max_points=points,
            group_initial_chance=0,
        )

        cov = CoverageAccess(readout)

        axis_start = 0
        goal_start = 0
        bucket_start = 0

        for point in cov.points():
            if not point.is_group:
                for axis in point.axes():
                    assert axis.value_end - axis.value_start == axis_values
                    assert axis.point() is point
                    assert axis.start == axis_start
                    axis_start += 1
                assert len(list(point.axes())) == axes

                for goal in point.goals():
                    assert goal.target == target
                    assert goal.point() is point
                    assert goal.start == goal_start
                    goal_start += 1
                assert len(list(point.goals())) == goals

                for bucket in point.buckets():
                    assert bucket.target == target
                    assert bucket.hits == hits
                    assert bucket.hit_ratio == 1
                    assert bucket.hit_percent == "100.00%"
                    assert bucket.point() is point
                    assert bucket.start == bucket_start
                    bucket_start += 1

                assert point.buckets_hit == axis_values**axes
                assert point.buckets_targeted == axis_values**axes
                assert point.buckets_full == axis_values**axes
            else:
                assert point.buckets_hit == points * (axis_values**axes)
                assert point.buckets_targeted == points * (axis_values**axes)
                assert point.buckets_full == points * (axis_values**axes)

            assert point.bucket_full_ratio == 1
            assert point.bucket_hit_ratio == 1
            assert point.hit_ratio == 1
            assert point.buckets_full_percent == "100.00%"
            assert point.buckets_hit_percent == "100.00%"

    def test_half_readout(self):
        """
        Tests correct results for a uniform generated readout where every
        bucket is exactly half hit
        """
        readout = GeneratedReadout(
            min_goals=(goals := 3),
            max_goals=goals,
            min_axes=(axes := 3),
            max_axes=axes,
            min_axis_values=(axis_values := 3),
            max_axis_values=axis_values,
            min_target=(target := 4),
            max_target=target,
            min_hits=(hits := 2),
            max_hits=hits,
            min_points=(points := 5),
            max_points=points,
            group_initial_chance=0,
        )

        cov = CoverageAccess(readout)

        axis_start = 0
        goal_start = 0
        bucket_start = 0

        for point in cov.points():
            if not point.is_group:
                for axis in point.axes():
                    assert axis.value_end - axis.value_start == axis_values
                    assert axis.start == axis_start
                    axis_start += 1
                assert len(list(point.axes())) == axes

                for goal in point.goals():
                    assert goal.target == target
                    assert goal.start == goal_start
                    goal_start += 1
                assert len(list(point.goals())) == goals

                for bucket in point.buckets():
                    assert bucket.target == target
                    assert bucket.hits == hits
                    assert bucket.hit_ratio == 0.5
                    assert bucket.hit_percent == "50.00%"
                    assert bucket.start == bucket_start
                    bucket_start += 1

                assert point.buckets_hit == axis_values**axes
                assert point.buckets_targeted == axis_values**axes
                assert point.buckets_full == 0
            else:
                assert point.buckets_hit == points * (axis_values**axes)
                assert point.buckets_targeted == points * (axis_values**axes)
                assert point.buckets_full == 0

            assert point.bucket_full_ratio == 0
            assert point.bucket_hit_ratio == 1
            assert point.hit_ratio == 0.5
            assert point.buckets_full_percent == "0.00%"
            assert point.buckets_hit_percent == "100.00%"

    def test_mixed_readout(self):
        """
        Tests that results fall within expected bounds for randomly generated
        readout.
        """
        readout = GeneratedReadout(
            min_goals=(min_goals := 1),
            max_goals=(max_goals := 3),
            min_axes=(min_axes := 1),
            max_axes=(max_axes := 3),
            min_axis_values=(min_axis_values := 2),
            max_axis_values=(max_axis_values := 5),
            min_target=(min_target := -1),
            max_target=(max_target := 10),
            min_hits=(min_hits := 0),
            max_hits=(max_hits := 10),
            min_points=1,
            max_points=10,
        )

        cov = CoverageAccess(readout)

        axis_start = 0
        goal_start = 0
        bucket_start = 0

        for point in cov.points():
            if not point.is_group:
                for axis in point.axes():
                    assert (
                        min_axis_values
                        <= (axis.value_end - axis.value_start)
                        <= max_axis_values
                    )
                    assert axis.start == axis_start
                    axis_start += 1
                assert min_axes <= len(list(point.axes())) <= max_axes

                for goal in point.goals():
                    assert min_target <= (goal.target) <= max_target
                    assert goal.start == goal_start
                    goal_start += 1
                assert min_goals <= len(list(point.goals())) <= max_goals

                bucket_count = 0
                for bucket in point.buckets():
                    assert min_target <= bucket.target <= max_target
                    assert min_hits <= bucket.hits <= max_hits
                    assert 0 <= bucket.hit_ratio <= 1
                    bucket_count += 1
                    assert bucket.start == bucket_start
                    bucket_start += 1

                assert (
                    (min_axis_values**min_axes)
                    <= bucket_count
                    <= (max_axis_values**max_axes)
                )
                assert (
                    min_hits * bucket_count
                    <= point.buckets_hit
                    <= max_hits * bucket_count
                )
                assert (
                    min_target * bucket_count
                    <= point.buckets_targeted
                    <= max_target * bucket_count
                )

            assert 0 <= point.bucket_hit_ratio <= 1
            assert 0 <= point.bucket_full_ratio <= 1
            assert 0 <= point.hit_ratio <= 1

    def test_non_legal_point(self):
        """
        Tests specific point edge cases
        """
        readout = GeneratedReadout(min_target=-1, max_target=0, root_is_point=True)
        cov = CoverageAccess(readout)
        points = list(cov.points())
        assert len(points) == 1
        for point in points:
            assert point.target == 0
            assert point.hits == 0
            assert point.hit_ratio == 1
            assert point.bucket_hit_ratio == 1
            assert point.bucket_full_ratio == 1
            assert point.hit_percent == "100.00%"
            assert point.buckets_hit_percent == "100.00%"
            assert point.buckets_full_percent == "100.00%"

    def test_unset_sha(self):
        """
        Tests getting sha from uninitialized puppet readout
        """
        readout = PuppetReadout()
        with pytest.raises(RuntimeError):
            readout.get_def_sha()
        with pytest.raises(RuntimeError):
            readout.get_rec_sha()

    def test_illegal_merge(self):
        """
        Tests merging incompatable coverage
        """
        readout_a = GeneratedReadout(def_seed=1, rec_seed=1)
        readout_b = GeneratedReadout(def_seed=1, rec_seed=2)
        readout_c = GeneratedReadout(def_seed=2, rec_seed=1)

        # Match
        MergeReadout(readout_a, readout_b)

        # Def mismatch
        with pytest.raises(RuntimeError):
            MergeReadout(readout_a, readout_c)

        # Rec mismatch
        readout_b.rec_sha += "_"
        with pytest.raises(RuntimeError):
            MergeReadout(readout_a, readout_b)
