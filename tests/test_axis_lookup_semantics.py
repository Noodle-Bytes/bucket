# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

import pytest

from bucket.axis import Axis, AxisAmbiguousValues, AxisOverlappingRanges


class TestAxisLookupSemantics:
    def test_named_value_takes_priority(self):
        axis = Axis(
            name="priority",
            values={"1": 99, "apple": 1},
            description="Named values should win first",
        )

        assert axis.get_named_value(1) == "1"

    def test_mixed_exact_and_range_with_overlap_is_rejected(self):
        with pytest.raises(AxisAmbiguousValues):
            Axis(
                name="mixed",
                values={"A_RANGE": [0, 10], "B_EXACT": 5},
                description="A scalar inside a range is ambiguous and must be rejected",
            )

    def test_overlapping_ranges_raise_error(self):
        with pytest.raises(AxisOverlappingRanges):
            Axis(
                name="overlap",
                values={"A": [0, 10], "B": [5, 15]},
                description="Overlapping ranges are not allowed",
            )

    def test_duplicate_exact_values_are_rejected(self):
        with pytest.raises(AxisAmbiguousValues):
            Axis(
                name="duplicates",
                values={"A": 7, "B": 7},
                description="Duplicate exact scalar values are ambiguous",
            )

    def test_enable_other_unchanged(self):
        axis = Axis(
            name="other",
            values=[0, 1],
            description="Other handling remains unchanged",
            enable_other=True,
        )

        assert axis.get_named_value(99) == "Other"

    def test_mixed_exact_and_range_without_overlap_is_allowed(self):
        axis = Axis(
            name="mixed_disjoint",
            values={"A_RANGE": [0, 10], "B_EXACT": 11},
            description="Disjoint exact and range values should be accepted",
        )

        assert axis.get_named_value(5) == "A_RANGE"
        assert axis.get_named_value(11) == "B_EXACT"
