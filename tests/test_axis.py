# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Vypercore. All Rights Reserved

import pytest

from bucket.axis import (
    Axis,
    AxisAmbiguousValues,
    AxisIncorrectNameFormat,
    AxisIncorrectValueFormat,
    AxisOtherNameAlreadyInUse,
    AxisRangeIncorrectLength,
    AxisRangeNotInt,
    AxisUnrecognisedValue,
)


class TestSanitiseValues:
    def test_dict_values(self):
        """Check that dict insertion order is preserved."""
        axis = Axis(name="test", values=[0], description="test")

        test_stimulus = {
            "Cherry": 3,
            "Banana": 2,
            "Apple": 1,
        }
        result = axis.sanitise_values(test_stimulus)
        assert list(result.keys()) == ["Cherry", "Banana", "Apple"]
        assert list(result.values()) == [3, 2, 1]

    def test_list_values(self):
        """Check that list insertion order is preserved."""
        axis = Axis(name="test", values=[0], description="test")

        test_stimulus = [
            "Cherry",
            "Banana",
            "Apple",
        ]
        result = axis.sanitise_values(test_stimulus)
        assert list(result.keys()) == ["Cherry", "Banana", "Apple"]
        assert list(result.values()) == ["Cherry", "Banana", "Apple"]

    def test_set_values(self):
        """Check that set values are represented correctly."""
        axis = Axis(name="test", values=[0], description="test")

        test_stimulus = {
            "Cherry",
            "Banana",
            "Apple",
            "Banana",
        }
        result = axis.sanitise_values(test_stimulus)
        assert set(result.keys()) == {"Apple", "Banana", "Cherry"}
        assert set(result.values()) == {"Apple", "Banana", "Cherry"}

    def test_tuple_values(self):
        """Check that tuple insertion order is preserved."""
        axis = Axis(name="test", values=[0], description="test")

        test_stimulus = (
            "Cherry",
            "Banana",
            "Apple",
        )
        result = axis.sanitise_values(test_stimulus)
        assert list(result.keys()) == ["Cherry", "Banana", "Apple"]
        assert list(result.values()) == ["Cherry", "Banana", "Apple"]

    def test_duplicate_list_values_raise(self):
        """Duplicate exact values in a sequence are ambiguous and rejected."""
        axis = Axis(name="test", values=[0], description="test")

        with pytest.raises(AxisAmbiguousValues):
            axis.sanitise_values(["Apple", "Banana", "Apple"])

    def test_duplicate_list_ranges_raise(self):
        """Duplicate ranges in a sequence are ambiguous and rejected."""
        axis = Axis(name="test", values=[0], description="test")

        with pytest.raises(AxisAmbiguousValues):
            axis.sanitise_values([[1, 3], [1, 3]])

    def test_default_other(self):
        """
        Other has been enabled, so should have an additional entry to catch unnamed values.
        """
        axis = Axis(name="test", values=[0], description="test", enable_other=True)

        test_stimulus = {
            "Cherry": 3,
            "Banana": 2,
            "Apple": 1,
        }
        result = axis.sanitise_values(test_stimulus)
        assert list(result.keys()) == ["Cherry", "Banana", "Apple", "Other"]
        assert list(result.values()) == [3, 2, 1, None]

    def test_named_other(self):
        """
        Other has been enabled with a custom name, so should have an additional entry to catch
        unnamed values.
        """
        axis = Axis(
            name="test", values=[0], description="test", enable_other="Alternate Fruit"
        )

        test_stimulus = {
            "Cherry": 3,
            "Banana": 2,
            "Apple": 1,
        }
        result = axis.sanitise_values(test_stimulus)
        assert list(result.keys()) == ["Cherry", "Banana", "Apple", "Alternate Fruit"]
        assert list(result.values()) == [3, 2, 1, None]

    def test_named_other_clash(self):
        """
        Other has been enabled with a custom name which clashes.
        Should raise an assertion error.
        """
        axis = Axis(name="test", values=[0], description="test", enable_other="Apple")

        test_stimulus = {
            "Cherry": 3,
            "Banana": 2,
            "Apple": 1,
        }
        with pytest.raises(AxisOtherNameAlreadyInUse):
            axis.sanitise_values(test_stimulus)

    def test_named_other_non_string(self):
        """
        Other has been enabled with a custom non-string name
        Should default to "Other"
        """
        axis = Axis(name="test", values=[0], description="test", enable_other=4)

        test_stimulus = {
            "Cherry": 3,
            "Banana": 2,
            "Apple": 1,
        }
        result = axis.sanitise_values(test_stimulus)
        assert list(result.keys()) == ["Cherry", "Banana", "Apple", "Other"]
        assert list(result.values()) == [3, 2, 1, None]

    def test_undersized_set_range(self):
        """
        Pass in a set range with too few values
        Should raise an assertion error.
        """
        axis = Axis(name="test", values=[0], description="test")

        test_stimulus = [1, 2, 3, 4, {5}]
        with pytest.raises(AxisRangeIncorrectLength):
            axis.sanitise_values(test_stimulus)

    def test_oversized_list_range(self):
        """
        Pass in a list range with too many values
        Should raise an assertion error.
        """
        axis = Axis(name="test", values=[0], description="test")

        test_stimulus = [1, 2, 3, 4, [5, 6, 7]]
        with pytest.raises(AxisRangeIncorrectLength):
            axis.sanitise_values(test_stimulus)

    def test_non_int_tuple_range(self):
        """
        Pass in a tuple range with non-ints
        Should raise an assertion error.
        """
        axis = Axis(name="test", values=[0], description="test")

        test_stimulus = [1, 2, 3, 4, ("Steve", "Bob")]
        with pytest.raises(AxisRangeNotInt):
            axis.sanitise_values(test_stimulus)

    def test_dict_with_undersized_range(self):
        """
        Pass in a dict with an undersized range
        Should raise an assertion error.
        """
        axis = Axis(name="test", values=[0], description="test")

        test_stimulus = {"Apple": 1, "Banana": 2, "Cherry": [3]}
        with pytest.raises(AxisRangeIncorrectLength):
            axis.sanitise_values(test_stimulus)

    def test_dict_with_oversized_range(self):
        """
        Pass in a dict with an oversized range
        Should raise an assertion error.
        """
        axis = Axis(name="test", values=[0], description="test")

        test_stimulus = {"Apple": 1, "Banana": 2, "Cherry": [50, 63, 75, 88]}
        with pytest.raises(AxisRangeIncorrectLength):
            axis.sanitise_values(test_stimulus)

    def test_dict_with_non_int_range(self):
        """
        Pass in a tuple range with non-ints, as part of dict
        Should raise an assertion error.
        """
        axis = Axis(name="test", values=[0], description="test")

        test_stimulus = {"Apple": 1, "Banana": 2, "Cherry": ("Steve", "Bob")}
        with pytest.raises(AxisRangeNotInt):
            axis.sanitise_values(test_stimulus)

    def test_set_range_values(self):
        """Check that a set range is correctly processed"""
        axis = Axis(name="test", values=[0], description="test")

        test_stimulus = ["Cherry", "Banana", "Apple", {9, 3}]
        result = axis.sanitise_values(test_stimulus)
        assert list(result.keys()) == ["Cherry", "Banana", "Apple", "3 -> 9"]
        assert list(result.values()) == ["Cherry", "Banana", "Apple", [3, 9]]

    def test_list_range_values(self):
        """Check that a list range is correctly processed"""
        axis = Axis(name="test", values=[0], description="test")

        test_stimulus = ["Cherry", "Banana", "Apple", [19, 5]]
        result = axis.sanitise_values(test_stimulus)
        assert list(result.keys()) == ["Cherry", "Banana", "Apple", "5 -> 19"]
        assert list(result.values()) == ["Cherry", "Banana", "Apple", [5, 19]]

    def test_tuple_range_values(self):
        """Check that a tuple range is correctly processed"""
        axis = Axis(name="test", values=[0], description="test")

        test_stimulus = ["Cherry", "Banana", "Apple", (6, 1)]
        result = axis.sanitise_values(test_stimulus)
        assert list(result.keys()) == ["Cherry", "Banana", "Apple", "1 -> 6"]
        assert list(result.values()) == ["Cherry", "Banana", "Apple", [1, 6]]

    def test_dict_with_non_string_keys(self):
        """Check that a dict with non-string keys is not allowed"""
        axis = Axis(name="test", values=[0], description="test")

        test_stimulus = {
            3: 3,
            2: 2,
            1: 1,
        }

        with pytest.raises(AxisIncorrectNameFormat):
            axis.sanitise_values(test_stimulus)

    def test_incorrect_values_type(self):
        """Check that incorrect type for values is not allowed"""
        axis = Axis(name="test", values=[0], description="test")

        test_stimulus = 1

        with pytest.raises(AxisIncorrectValueFormat):
            axis.sanitise_values(test_stimulus)


class TestGetNamedValue:
    def test_exact_value_inside_range_rejected(self):
        """An exact scalar inside a range is ambiguous and must be rejected."""
        with pytest.raises(AxisAmbiguousValues):
            Axis(name="test", values={"range": [1, 3], "exact": 2}, description="test")

    def test_unrecognised_value(self):
        """Check unrecognised value raises an exception"""
        axis = Axis(name="test", values=[1, 2, 4, 5], description="test")

        test_stimuli = [0, 3, "3", 99, "Steve"]

        for test_stimulus in test_stimuli:
            with pytest.raises(AxisUnrecognisedValue):
                axis.get_named_value(test_stimulus)

    def test_unrecognised_value_with_range(self):
        """Check unrecognised value with ranges raises an exception"""
        axis = Axis(name="test", values=[[1, 3], [5, 7]], description="test")

        test_stimuli = [0, "2", 4, "4", 99, "Steve"]

        for test_stimulus in test_stimuli:
            with pytest.raises(AxisUnrecognisedValue):
                axis.get_named_value(test_stimulus)

    def test_string_value_with_name(self):
        """Check that a string name of the value is returned"""
        axis = Axis(name="test", values=[1, 2, 3, [4, 7]], description="test")

        test_stimuli = {1: "1", "1": "1", 4: "4 -> 7", 5: "4 -> 7", "4 -> 7": "4 -> 7"}
        for test_stimulus, expected_result in test_stimuli.items():
            assert axis.get_named_value(test_stimulus) == expected_result

    def test_string_value_with_name_with_other(self):
        """Check that a string name of the value is returned"""
        axis = Axis(
            name="test", values=[1, 2, 3, [4, 7]], description="test", enable_other=True
        )

        test_stimuli = {
            1: "1",
            "1": "1",
            4: "4 -> 7",
            8: "Other",
            "7": "Other",
            "7 -> 8": "Other",
            "Steve": "Other",
        }
        for test_stimulus, expected_result in test_stimuli.items():
            assert axis.get_named_value(test_stimulus) == expected_result

    def test_string_value_with_name_with_named_other(self):
        """Check that a string name of the value is returned"""
        axis = Axis(
            name="test",
            values=[1, 2, 3, [4, 7]],
            description="test",
            enable_other="Weird",
        )

        test_stimuli = {
            1: "1",
            "1": "1",
            4: "4 -> 7",
            8: "Weird",
            "7": "Weird",
            "7 -> 8": "Weird",
            "Steve": "Weird",
        }
        for test_stimulus, expected_result in test_stimuli.items():
            assert axis.get_named_value(test_stimulus) == expected_result

    def test_named_dict(self):
        """Check that a string name of the value is returned"""
        axis = Axis(
            name="test", values={"ten": 10, "less_than_ten": [0, 9]}, description="test"
        )

        test_stimuli = {
            10: "ten",
            "ten": "ten",
            4: "less_than_ten",
            0: "less_than_ten",
            9: "less_than_ten",
            "less_than_ten": "less_than_ten",
        }
        for test_stimulus, expected_result in test_stimuli.items():
            assert axis.get_named_value(test_stimulus) == expected_result

    def test_named_dict_with_other(self):
        """Check that a string name of the value is returned"""
        axis = Axis(
            name="test",
            values={"ten": 10, "less_than_ten": [0, 9]},
            description="test",
            enable_other=True,
        )

        test_stimuli = {
            10: "ten",
            "ten": "ten",
            4: "less_than_ten",
            "10": "Other",
            11: "Other",
            "Steve": "Other",
        }
        for test_stimulus, expected_result in test_stimuli.items():
            assert axis.get_named_value(test_stimulus) == expected_result

    def test_named_dict_with_named_other(self):
        """Check that a string name of the value is returned"""
        axis = Axis(
            name="test",
            values={"ten": 10, "less_than_ten": [0, 9]},
            description="test",
            enable_other="Weird",
        )

        test_stimuli = {
            10: "ten",
            "ten": "ten",
            4: "less_than_ten",
            "10": "Weird",
            11: "Weird",
            "Steve": "Weird",
        }
        for test_stimulus, expected_result in test_stimuli.items():
            assert axis.get_named_value(test_stimulus) == expected_result

    def test_cached_values(self):
        """Check that when the same value is checked, the result is cached correctly"""
        axis = Axis(
            name="test", values=[1, 2, 3, [4, 5]], description="test", enable_other=True
        )

        test_stimuli = [1, 4, 5, 6]
        for count, test_stimulus in enumerate(test_stimuli, start=1):
            result_1 = axis.get_named_value(test_stimulus)
            result_2 = axis.get_named_value(test_stimulus)

            assert result_1 == result_2

            # Verify that a cache hit occurred
            cache_info = axis.get_named_value.cache_info()
            # The first call doesn't count as a hit,
            # but the second call should be a hit.
            assert cache_info.hits == count
