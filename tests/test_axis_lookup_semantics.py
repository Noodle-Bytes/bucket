# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

from bucket.axis import Axis


class TestAxisLookupSemantics:
    def test_named_value_takes_priority(self):
        axis = Axis(
            name="priority",
            values={"1": 99, "apple": 1},
            description="Named values should win first",
        )

        assert axis.get_named_value(1) == "1"

    def test_mixed_exact_and_range_keeps_ordered_matching(self):
        axis = Axis(
            name="mixed",
            values={"A_RANGE": [0, 10], "B_EXACT": 5},
            description="Range should match before later exact values",
        )

        assert axis.get_named_value(5) == "A_RANGE"

    def test_overlapping_ranges_keep_first_match(self):
        axis = Axis(
            name="overlap",
            values={"A": [0, 10], "B": [5, 15]},
            description="First key by sorted name should win for overlaps",
        )

        assert axis.get_named_value(7) == "A"

    def test_duplicate_exact_values_keep_first_match(self):
        axis = Axis(
            name="duplicates",
            values={"A": 7, "B": 7},
            description="Duplicate values should resolve to first key",
        )

        assert axis.get_named_value(7) == "A"

    def test_enable_other_unchanged(self):
        axis = Axis(
            name="other",
            values=[0, 1],
            description="Other handling remains unchanged",
            enable_other=True,
        )

        assert axis.get_named_value(99) == "Other"
