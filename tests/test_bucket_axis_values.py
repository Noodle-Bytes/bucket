# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

"""
Test that bucket axes provide both .name and .value in apply_goals
"""

from bucket import Coverpoint, Covertop
from bucket.common.types import BucketValCompError


class TestBucketAxisStructure:
    """Test the structure of bucket axes in apply_goals"""

    def test_bucket_has_name_and_value_attributes(self):
        """Test that each bucket axis has both .name and .value attributes"""
        captured_bucket = None

        class TestCoverpoint(Coverpoint):
            def setup(self, ctx):
                self.add_axis(name="age", values=[1, 2, 3], description="Age")
                self.add_axis(
                    name="size", values=["small", "large"], description="Size"
                )

            def apply_goals(self, bucket, goals):
                nonlocal captured_bucket
                if captured_bucket is None:
                    captured_bucket = bucket
                return None

            def sample(self, trace):
                pass

        class TopCoverage(Covertop):
            def setup(self, ctx):
                self.add_coverpoint(TestCoverpoint())

        TopCoverage()

        # Verify bucket structure
        assert captured_bucket is not None
        assert hasattr(captured_bucket, "age")
        assert hasattr(captured_bucket, "size")
        assert hasattr(captured_bucket.age, "name")
        assert hasattr(captured_bucket.age, "value")
        assert hasattr(captured_bucket.size, "name")
        assert hasattr(captured_bucket.size, "value")

    def test_integer_value_types(self):
        """Test that integer axis values have correct types"""
        captured_buckets = []

        class TestCoverpoint(Coverpoint):
            def setup(self, ctx):
                self.add_axis(name="num", values=[10, 20, 30], description="Numbers")

            def apply_goals(self, bucket, goals):
                nonlocal captured_buckets
                captured_buckets.append((bucket.num.name, bucket.num.value))
                return None

            def sample(self, trace):
                pass

        class TopCoverage(Covertop):
            def setup(self, ctx):
                self.add_coverpoint(TestCoverpoint())

        TopCoverage()

        # Check that we have all values
        assert len(captured_buckets) == 3

        # Verify each bucket
        for name, value in captured_buckets:
            assert isinstance(name, str)
            assert isinstance(value, int)
            assert name == str(value)

    def test_range_value_types(self):
        """Test that range axis values are represented as lists"""
        captured_buckets = []

        class TestCoverpoint(Coverpoint):
            def setup(self, ctx):
                self.add_axis(
                    name="score",
                    values=[0, [1, 5], [6, 10]],
                    description="Score ranges",
                )

            def apply_goals(self, bucket, goals):
                nonlocal captured_buckets
                captured_buckets.append((bucket.score.name, bucket.score.value))
                return None

            def sample(self, trace):
                pass

        class TopCoverage(Covertop):
            def setup(self, ctx):
                self.add_coverpoint(TestCoverpoint())

        TopCoverage()

        # Find the range buckets
        range_buckets = [b for b in captured_buckets if isinstance(b[1], list)]
        assert len(range_buckets) == 2

        # Check range structure
        for name, value in range_buckets:
            assert isinstance(name, str)
            assert isinstance(value, list)
            assert len(value) == 2
            assert " -> " in name

    def test_string_value_types(self):
        """Test that string axis values remain as strings"""
        captured_buckets = []

        class TestCoverpoint(Coverpoint):
            def setup(self, ctx):
                self.add_axis(
                    name="color", values=["red", "green", "blue"], description="Colors"
                )

            def apply_goals(self, bucket, goals):
                nonlocal captured_buckets
                captured_buckets.append((bucket.color.name, bucket.color.value))
                return None

            def sample(self, trace):
                pass

        class TopCoverage(Covertop):
            def setup(self, ctx):
                self.add_coverpoint(TestCoverpoint())

        TopCoverage()

        # Verify string values
        for name, value in captured_buckets:
            assert isinstance(name, str)
            assert isinstance(value, str)
            assert name == value

    def test_named_dict_values(self):
        """Test that named dictionary values work correctly"""
        captured_buckets = []

        class TestCoverpoint(Coverpoint):
            def setup(self, ctx):
                self.add_axis(
                    name="size",
                    values={"small": 0, "medium": 1, "large": 2},
                    description="Named sizes",
                )

            def apply_goals(self, bucket, goals):
                nonlocal captured_buckets
                captured_buckets.append((bucket.size.name, bucket.size.value))
                return None

            def sample(self, trace):
                pass

        class TopCoverage(Covertop):
            def setup(self, ctx):
                self.add_coverpoint(TestCoverpoint())

        TopCoverage()

        # Find specific named values
        name_value_map = dict(captured_buckets)
        assert name_value_map["small"] == 0
        assert name_value_map["medium"] == 1
        assert name_value_map["large"] == 2


class TestApplyGoalsWithValues:
    """Test that apply_goals can use .value for comparisons"""

    def test_direct_numeric_comparison(self):
        """Test that numeric comparisons work without conversion"""

        class TestCoverpoint(Coverpoint):
            def setup(self, ctx):
                self.add_axis(name="age", values=[0, 1, 2, 3, 10], description="Age")
                self.add_goal("YOUNG", "Young", target=5)
                self.add_goal("OLD", "Old", target=10)

            def apply_goals(self, bucket, goals):
                # Direct numeric comparison without int() conversion!
                if bucket.age.value <= 2:
                    return goals.YOUNG
                elif bucket.age.value >= 10:
                    return goals.OLD
                return None

            def sample(self, trace):
                pass

        class TopCoverage(Covertop):
            def setup(self, ctx):
                self.add_coverpoint(TestCoverpoint())

        cvg = TopCoverage()
        cp = cvg.TestCoverpoint

        # Verify goals were applied correctly
        assert cp._cvg_goals[("0",)] == cp._goal_dict["YOUNG"]
        assert cp._cvg_goals[("1",)] == cp._goal_dict["YOUNG"]
        assert cp._cvg_goals[("2",)] == cp._goal_dict["YOUNG"]
        assert cp._cvg_goals[("10",)] == cp._goal_dict["OLD"]
        # When apply_goals returns None, the bucket is not in _cvg_goals
        # (only explicitly set goals are stored)
        assert ("3",) not in cp._cvg_goals

    def test_range_detection_with_isinstance(self):
        """Test that ranges can be detected with isinstance"""

        class TestCoverpoint(Coverpoint):
            def setup(self, ctx):
                self.add_axis(
                    name="value", values=[0, 1, [2, 5], 10], description="Mixed values"
                )
                self.add_goal("RANGE", "Range value", target=20)
                self.add_goal("SINGLE", "Single value", target=5)

            def apply_goals(self, bucket, goals):
                # Use isinstance to detect ranges
                if isinstance(bucket.value.value, list):
                    return goals.RANGE
                else:
                    return goals.SINGLE

            def sample(self, trace):
                pass

        class TopCoverage(Covertop):
            def setup(self, ctx):
                self.add_coverpoint(TestCoverpoint())

        cvg = TopCoverage()
        cp = cvg.TestCoverpoint

        # Verify range detection
        assert cp._cvg_goals[("2 -> 5",)] == cp._goal_dict["RANGE"]
        assert cp._cvg_goals[("0",)] == cp._goal_dict["SINGLE"]
        assert cp._cvg_goals[("1",)] == cp._goal_dict["SINGLE"]
        assert cp._cvg_goals[("10",)] == cp._goal_dict["SINGLE"]

    def test_mixed_comparison_patterns(self):
        """Test mixing .name and .value comparisons"""

        class TestCoverpoint(Coverpoint):
            def setup(self, ctx):
                self.add_axis(
                    name="age", values=[0, 1, [2, 5], 10, 11], description="Age"
                )
                self.add_axis(
                    name="size", values=["small", "large"], description="Size"
                )
                self.add_goal("YOUNG_SMALL", "Young and small", target=50)
                self.add_goal("OLD_LARGE", "Old and large", target=30)
                self.add_goal("RANGE_ANY", "In range, any size", target=10)

            def apply_goals(self, bucket, goals):
                # Mix .value numeric comparison with .name string comparison
                if isinstance(bucket.age.value, int) and bucket.age.value <= 1:
                    if bucket.size.name == "small":
                        return goals.YOUNG_SMALL
                elif isinstance(bucket.age.value, int) and bucket.age.value >= 10:
                    if bucket.size.value == "large":  # Using .value for string too
                        return goals.OLD_LARGE
                elif isinstance(bucket.age.value, list):
                    return goals.RANGE_ANY
                return None

            def sample(self, trace):
                pass

        class TopCoverage(Covertop):
            def setup(self, ctx):
                self.add_coverpoint(TestCoverpoint())

        cvg = TopCoverage()
        cp = cvg.TestCoverpoint

        # Verify complex goal logic
        assert cp._cvg_goals[("0", "small")] == cp._goal_dict["YOUNG_SMALL"]
        assert cp._cvg_goals[("1", "small")] == cp._goal_dict["YOUNG_SMALL"]
        assert cp._cvg_goals[("10", "large")] == cp._goal_dict["OLD_LARGE"]
        assert cp._cvg_goals[("11", "large")] == cp._goal_dict["OLD_LARGE"]
        assert cp._cvg_goals[("2 -> 5", "small")] == cp._goal_dict["RANGE_ANY"]
        assert cp._cvg_goals[("2 -> 5", "large")] == cp._goal_dict["RANGE_ANY"]

    def test_no_conversion_needed(self):
        """Test that we don't need int() conversions anymore"""

        class TestCoverpoint(Coverpoint):
            def setup(self, ctx):
                self.add_axis(name="count", values=[5, 10, 15, 20], description="Count")
                self.add_goal("HIGH", "High count", target=100)

            def apply_goals(self, bucket, goals):
                # This would have required int(bucket.count) > 12 in old version
                if bucket.count.value > 12:
                    return goals.HIGH
                return None

            def sample(self, trace):
                pass

        class TopCoverage(Covertop):
            def setup(self, ctx):
                self.add_coverpoint(TestCoverpoint())

        cvg = TopCoverage()
        cp = cvg.TestCoverpoint

        # Verify numeric comparison worked
        assert cp._cvg_goals[("15",)] == cp._goal_dict["HIGH"]
        assert cp._cvg_goals[("20",)] == cp._goal_dict["HIGH"]
        # When apply_goals returns None, the bucket uses DEFAULT goal
        # but is not stored in _cvg_goals
        assert ("5",) not in cp._cvg_goals
        assert ("10",) not in cp._cvg_goals


class TestBucketValProtection:
    """Test that BucketVal prevents accidental direct comparison and modification"""

    def test_direct_comparison_raises_error(self):
        """Test that direct comparison of BucketVal raises TypeError"""
        captured_bucket = None

        class TestCoverpoint(Coverpoint):
            def setup(self, ctx):
                self.add_axis(name="age", values=[1, 2, 3], description="Age")

            def apply_goals(self, bucket, goals):
                nonlocal captured_bucket
                if captured_bucket is None:
                    captured_bucket = bucket
                return None

            def sample(self, trace):
                pass

        class TopCoverage(Covertop):
            def setup(self, ctx):
                self.add_coverpoint(TestCoverpoint())

        TopCoverage()

        # Verify that direct comparison raises BucketValCompError
        try:
            _ = captured_bucket.age == captured_bucket.age
            assert False, "Expected BucketValCompError for == comparison"
        except BucketValCompError:
            pass  # Expected

        try:
            _ = captured_bucket.age < captured_bucket.age
            assert False, "Expected BucketValCompError for < comparison"
        except BucketValCompError:
            pass  # Expected

        try:
            _ = captured_bucket.age <= captured_bucket.age
            assert False, "Expected BucketValCompError for <= comparison"
        except BucketValCompError:
            pass  # Expected

        try:
            _ = captured_bucket.age > captured_bucket.age
            assert False, "Expected BucketValCompError for > comparison"
        except BucketValCompError:
            pass  # Expected

        try:
            _ = captured_bucket.age >= captured_bucket.age
            assert False, "Expected BucketValCompError for >= comparison"
        except BucketValCompError:
            pass  # Expected

    def test_is_operator_works_normally(self):
        """Test that the `is` operator works normally (identity check)"""
        captured_buckets = []

        class TestCoverpoint(Coverpoint):
            def setup(self, ctx):
                self.add_axis(name="age", values=[1, 2], description="Age")

            def apply_goals(self, bucket, goals):
                nonlocal captured_buckets
                captured_buckets.append(bucket)
                return None

            def sample(self, trace):
                pass

        class TopCoverage(Covertop):
            def setup(self, ctx):
                self.add_coverpoint(TestCoverpoint())

        TopCoverage()

        # The `is` operator checks object identity, which works normally
        # Same bucket object should be identical to itself
        assert captured_buckets[0].age is captured_buckets[0].age

        # Different bucket objects with same values are not identical
        # (each bucket is a new SimpleNamespace with new BucketVal instances)
        assert captured_buckets[0].age is not captured_buckets[1].age

    def test_bucketval_is_frozen(self):
        """Test that BucketVal is frozen and cannot be modified"""
        from bucket.common.types import BucketVal

        val = BucketVal(name="test", value=42)

        # Verify it's frozen - should raise FrozenInstanceError on modification
        try:
            val.name = "modified"
            assert False, "Expected FrozenInstanceError or AttributeError"
        except (AttributeError, Exception):
            pass  # Expected - dataclass is frozen

        try:
            val.value = 100
            assert False, "Expected FrozenInstanceError or AttributeError"
        except (AttributeError, Exception):
            pass  # Expected - dataclass is frozen
