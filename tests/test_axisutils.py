# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

import pytest

from bucket.axisutils import (
    AxisUtils,
    AxisUtilsMsbIncompatibleOptions,
    AxisUtilsMsbIncorrectWidth,
    AxisUtilsOneHotIncompatibleOptions,
    AxisUtilsOneHotIncorrectWidth,
    AxisUtilsRangesMinHigherThanMax,
    AxisUtilsRangesTooManyRanges,
)


class TestOneHot:
    def test_default(self):
        test_stimuli = {
            1: {"0b1": 1},
            3: {"0b001": 1, "0b010": 2, "0b100": 4},
            4: {"0b0001": 1, "0b0010": 2, "0b0100": 4, "0b1000": 8},
            8: {
                "0b0000_0001": 1,
                "0b0000_0010": 2,
                "0b0000_0100": 4,
                "0b0000_1000": 8,
                "0b0001_0000": 16,
                "0b0010_0000": 32,
                "0b0100_0000": 64,
                "0b1000_0000": 128,
            },
            10: {
                "0x001": 1,
                "0x002": 2,
                "0x004": 4,
                "0x008": 8,
                "0x010": 16,
                "0x020": 32,
                "0x040": 64,
                "0x080": 128,
                "0x100": 256,
                "0x200": 512,
            },
        }

        for test_stimulus, expected_result in test_stimuli.items():
            assert AxisUtils.one_hot(test_stimulus) == expected_result

    def test_no_padding(self):
        test_stimuli = {
            1: {"0b1": 1},
            3: {"0b1": 1, "0b10": 2, "0b100": 4},
            4: {"0b1": 1, "0b10": 2, "0b100": 4, "0b1000": 8},
            8: {
                "0b1": 1,
                "0b10": 2,
                "0b100": 4,
                "0b1000": 8,
                "0b1_0000": 16,
                "0b10_0000": 32,
                "0b100_0000": 64,
                "0b1000_0000": 128,
            },
            10: {
                "0x1": 1,
                "0x2": 2,
                "0x4": 4,
                "0x8": 8,
                "0x10": 16,
                "0x20": 32,
                "0x40": 64,
                "0x80": 128,
                "0x100": 256,
                "0x200": 512,
            },
        }

        for test_stimulus, expected_result in test_stimuli.items():
            assert AxisUtils.one_hot(test_stimulus, pad_zero=False) == expected_result

    def test_include_zero(self):
        test_stimuli = {
            1: {"0b0": 0, "0b1": 1},
            3: {"0b000": 0, "0b001": 1, "0b010": 2, "0b100": 4},
            4: {"0b0000": 0, "0b0001": 1, "0b0010": 2, "0b0100": 4, "0b1000": 8},
            8: {
                "0b0000_0000": 0,
                "0b0000_0001": 1,
                "0b0000_0010": 2,
                "0b0000_0100": 4,
                "0b0000_1000": 8,
                "0b0001_0000": 16,
                "0b0010_0000": 32,
                "0b0100_0000": 64,
                "0b1000_0000": 128,
            },
            10: {
                "0x000": 0,
                "0x001": 1,
                "0x002": 2,
                "0x004": 4,
                "0x008": 8,
                "0x010": 16,
                "0x020": 32,
                "0x040": 64,
                "0x080": 128,
                "0x100": 256,
                "0x200": 512,
            },
        }

        for test_stimulus, expected_result in test_stimuli.items():
            assert (
                AxisUtils.one_hot(test_stimulus, include_zero=True) == expected_result
            )

    def test_display_hex(self):
        test_stimuli = {
            1: {"0x1": 1},
            3: {"0x1": 1, "0x2": 2, "0x4": 4},
            5: {"0x01": 1, "0x02": 2, "0x04": 4, "0x08": 8, "0x10": 16},
            8: {
                "0x01": 1,
                "0x02": 2,
                "0x04": 4,
                "0x08": 8,
                "0x10": 16,
                "0x20": 32,
                "0x40": 64,
                "0x80": 128,
            },
            10: {
                "0x001": 1,
                "0x002": 2,
                "0x004": 4,
                "0x008": 8,
                "0x010": 16,
                "0x020": 32,
                "0x040": 64,
                "0x080": 128,
                "0x100": 256,
                "0x200": 512,
            },
        }

        for test_stimulus, expected_result in test_stimuli.items():
            assert AxisUtils.one_hot(test_stimulus, display_hex=True) == expected_result

    def test_display_bin(self):
        test_stimuli = {
            1: {"0b1": 1},
            3: {"0b001": 1, "0b010": 2, "0b100": 4},
            4: {"0b0001": 1, "0b0010": 2, "0b0100": 4, "0b1000": 8},
            8: {
                "0b0000_0001": 1,
                "0b0000_0010": 2,
                "0b0000_0100": 4,
                "0b0000_1000": 8,
                "0b0001_0000": 16,
                "0b0010_0000": 32,
                "0b0100_0000": 64,
                "0b1000_0000": 128,
            },
            10: {
                "0b00_0000_0001": 1,
                "0b00_0000_0010": 2,
                "0b00_0000_0100": 4,
                "0b00_0000_1000": 8,
                "0b00_0001_0000": 16,
                "0b00_0010_0000": 32,
                "0b00_0100_0000": 64,
                "0b00_1000_0000": 128,
                "0b01_0000_0000": 256,
                "0b10_0000_0000": 512,
            },
        }

        for test_stimulus, expected_result in test_stimuli.items():
            assert AxisUtils.one_hot(test_stimulus, display_bin=True) == expected_result

    def test_test_bad_options(self):
        with pytest.raises(AxisUtilsOneHotIncorrectWidth):
            AxisUtils.one_hot(0)
        with pytest.raises(AxisUtilsOneHotIncorrectWidth):
            AxisUtils.one_hot(-3)

        with pytest.raises(AxisUtilsOneHotIncompatibleOptions):
            AxisUtils.one_hot(2, display_bin=True, display_hex=True)


class TestMsb:
    def test_default(self):
        test_stimuli = {
            3: {"0b000": [0, 0], "0b001": [1, 1], "0b010": [2, 3], "0b100": [4, 7]},
            4: {
                "0b0000": [0, 0],
                "0b0001": [1, 1],
                "0b0010": [2, 3],
                "0b0100": [4, 7],
                "0b1000": [8, 15],
            },
            8: {
                "0b0000_0000": [0, 0],
                "0b0000_0001": [1, 1],
                "0b0000_0010": [2, 3],
                "0b0000_0100": [4, 7],
                "0b0000_1000": [8, 15],
                "0b0001_0000": [16, 31],
                "0b0010_0000": [32, 63],
                "0b0100_0000": [64, 127],
                "0b1000_0000": [128, 255],
            },
            10: {
                "0x000": [0, 0],
                "0x001": [1, 1],
                "0x002": [2, 3],
                "0x004": [4, 7],
                "0x008": [8, 15],
                "0x010": [16, 31],
                "0x020": [32, 63],
                "0x040": [64, 127],
                "0x080": [128, 255],
                "0x100": [256, 511],
                "0x200": [512, 1023],
            },
        }

        for test_stimulus, expected_result in test_stimuli.items():
            assert AxisUtils.msb(test_stimulus) == expected_result

    def test_no_padding(self):
        test_stimuli = {
            3: {"0b0": [0, 0], "0b1": [1, 1], "0b10": [2, 3], "0b100": [4, 7]},
            4: {
                "0b0": [0, 0],
                "0b1": [1, 1],
                "0b10": [2, 3],
                "0b100": [4, 7],
                "0b1000": [8, 15],
            },
            8: {
                "0b0": [0, 0],
                "0b1": [1, 1],
                "0b10": [2, 3],
                "0b100": [4, 7],
                "0b1000": [8, 15],
                "0b1_0000": [16, 31],
                "0b10_0000": [32, 63],
                "0b100_0000": [64, 127],
                "0b1000_0000": [128, 255],
            },
            10: {
                "0x0": [0, 0],
                "0x1": [1, 1],
                "0x2": [2, 3],
                "0x4": [4, 7],
                "0x8": [8, 15],
                "0x10": [16, 31],
                "0x20": [32, 63],
                "0x40": [64, 127],
                "0x80": [128, 255],
                "0x100": [256, 511],
                "0x200": [512, 1023],
            },
        }

        for test_stimulus, expected_result in test_stimuli.items():
            assert AxisUtils.msb(test_stimulus, pad_zero=False) == expected_result

    def test_include_max(self):
        test_stimuli = {
            3: {
                "0b000": [0, 0],
                "0b001": [1, 1],
                "0b010": [2, 3],
                "0b100": [4, 6],
                "0b111": [7, 7],
            },
            4: {
                "0b0000": [0, 0],
                "0b0001": [1, 1],
                "0b0010": [2, 3],
                "0b0100": [4, 7],
                "0b1000": [8, 14],
                "0b1111": [15, 15],
            },
            8: {
                "0b0000_0000": [0, 0],
                "0b0000_0001": [1, 1],
                "0b0000_0010": [2, 3],
                "0b0000_0100": [4, 7],
                "0b0000_1000": [8, 15],
                "0b0001_0000": [16, 31],
                "0b0010_0000": [32, 63],
                "0b0100_0000": [64, 127],
                "0b1000_0000": [128, 254],
                "0b1111_1111": [255, 255],
            },
            10: {
                "0x000": [0, 0],
                "0x001": [1, 1],
                "0x002": [2, 3],
                "0x004": [4, 7],
                "0x008": [8, 15],
                "0x010": [16, 31],
                "0x020": [32, 63],
                "0x040": [64, 127],
                "0x080": [128, 255],
                "0x100": [256, 511],
                "0x200": [512, 1022],
                "0x3ff": [1023, 1023],
            },
        }

        for test_stimulus, expected_result in test_stimuli.items():
            assert AxisUtils.msb(test_stimulus, include_max=True) == expected_result

    def test_display_hex(self):
        test_stimuli = {
            3: {"0x0": [0, 0], "0x1": [1, 1], "0x2": [2, 3], "0x4": [4, 7]},
            5: {
                "0x00": [0, 0],
                "0x01": [1, 1],
                "0x02": [2, 3],
                "0x04": [4, 7],
                "0x08": [8, 15],
                "0x10": [16, 31],
            },
            8: {
                "0x00": [0, 0],
                "0x01": [1, 1],
                "0x02": [2, 3],
                "0x04": [4, 7],
                "0x08": [8, 15],
                "0x10": [16, 31],
                "0x20": [32, 63],
                "0x40": [64, 127],
                "0x80": [128, 255],
            },
            10: {
                "0x000": [0, 0],
                "0x001": [1, 1],
                "0x002": [2, 3],
                "0x004": [4, 7],
                "0x008": [8, 15],
                "0x010": [16, 31],
                "0x020": [32, 63],
                "0x040": [64, 127],
                "0x080": [128, 255],
                "0x100": [256, 511],
                "0x200": [512, 1023],
            },
        }

        for test_stimulus, expected_result in test_stimuli.items():
            assert AxisUtils.msb(test_stimulus, display_hex=True) == expected_result

    def test_display_bin(self):
        test_stimuli = {
            3: {"0b000": [0, 0], "0b001": [1, 1], "0b010": [2, 3], "0b100": [4, 7]},
            4: {
                "0b0000": [0, 0],
                "0b0001": [1, 1],
                "0b0010": [2, 3],
                "0b0100": [4, 7],
                "0b1000": [8, 15],
            },
            8: {
                "0b0000_0000": [0, 0],
                "0b0000_0001": [1, 1],
                "0b0000_0010": [2, 3],
                "0b0000_0100": [4, 7],
                "0b0000_1000": [8, 15],
                "0b0001_0000": [16, 31],
                "0b0010_0000": [32, 63],
                "0b0100_0000": [64, 127],
                "0b1000_0000": [128, 255],
            },
            10: {
                "0b00_0000_0000": [0, 0],
                "0b00_0000_0001": [1, 1],
                "0b00_0000_0010": [2, 3],
                "0b00_0000_0100": [4, 7],
                "0b00_0000_1000": [8, 15],
                "0b00_0001_0000": [16, 31],
                "0b00_0010_0000": [32, 63],
                "0b00_0100_0000": [64, 127],
                "0b00_1000_0000": [128, 255],
                "0b01_0000_0000": [256, 511],
                "0b10_0000_0000": [512, 1023],
            },
        }

        for test_stimulus, expected_result in test_stimuli.items():
            assert AxisUtils.msb(test_stimulus, display_bin=True) == expected_result

    def test_bad_options(self):
        with pytest.raises(AxisUtilsMsbIncorrectWidth):
            AxisUtils.msb(1)
        with pytest.raises(AxisUtilsMsbIncorrectWidth):
            AxisUtils.msb(-3)

        with pytest.raises(AxisUtilsMsbIncompatibleOptions):
            AxisUtils.msb(2, display_bin=True, display_hex=True)


class TestEnabled:
    def test_enabled(self):
        assert AxisUtils.enabled() == {"Enabled": 1, "Disabled": 0}


class TestDisabled:
    def test_disabled(self):
        assert AxisUtils.disabled() == {"Disabled": 1, "Enabled": 0}


class TestReadWrite:
    def test_disabled(self):
        assert AxisUtils.read_write() == {"WRITE": 1, "READ": 0}


class TestPolarity:
    def test_polarity(self):
        assert AxisUtils.polarity() == {"Negative": 1, "Positive": 0}


class TestRanges:
    def test_default(self):
        test_stimuli = {
            (10, 1): {"0 -> 10": [0, 10]},
            (99, 4): {
                "0 -> 24": [0, 24],
                "25 -> 49": [25, 49],
                "50 -> 74": [50, 74],
                "75 -> 99": [75, 99],
            },
            (50, 4): {
                "0 -> 12": [0, 12],
                "13 -> 25": [13, 25],
                "26 -> 38": [26, 38],
                "39 -> 50": [39, 50],
            },
        }

        for test_stimulus, expected_result in test_stimuli.items():
            assert (
                AxisUtils.ranges(max_val=test_stimulus[0], num_ranges=test_stimulus[1])
                == expected_result
            )

    def test_separate_min(self):
        test_stimuli = {
            (10, 1): {"0": 0, "1 -> 10": [1, 10]},
            (99, 4): {
                "0": 0,
                "1 -> 25": [1, 25],
                "26 -> 50": [26, 50],
                "51 -> 75": [51, 75],
                "76 -> 99": [76, 99],
            },
            (50, 4): {
                "0": 0,
                "1 -> 13": [1, 13],
                "14 -> 26": [14, 26],
                "27 -> 38": [27, 38],
                "39 -> 50": [39, 50],
            },
        }

        for test_stimulus, expected_result in test_stimuli.items():
            assert (
                AxisUtils.ranges(
                    max_val=test_stimulus[0],
                    num_ranges=test_stimulus[1],
                    separate_min=True,
                )
                == expected_result
            )

    def test_separate_max(self):
        test_stimuli = {
            (10, 1): {"0 -> 9": [0, 9], "10": 10},
            (99, 4): {
                "0 -> 24": [0, 24],
                "25 -> 49": [25, 49],
                "50 -> 74": [50, 74],
                "75 -> 98": [75, 98],
                "99": 99,
            },
            (50, 4): {
                "0 -> 12": [0, 12],
                "13 -> 25": [13, 25],
                "26 -> 37": [26, 37],
                "38 -> 49": [38, 49],
                "50": 50,
            },
        }

        for test_stimulus, expected_result in test_stimuli.items():
            assert (
                AxisUtils.ranges(
                    max_val=test_stimulus[0],
                    num_ranges=test_stimulus[1],
                    separate_max=True,
                )
                == expected_result
            )

    def test_bad_options(self):
        with pytest.raises(AxisUtilsRangesMinHigherThanMax):
            AxisUtils.ranges(max_val=8, num_ranges=4, min_val=9)

        with pytest.raises(AxisUtilsRangesTooManyRanges):
            AxisUtils.ranges(max_val=9, num_ranges=10)

        with pytest.raises(AxisUtilsRangesTooManyRanges):
            AxisUtils.ranges(max_val=7, num_ranges=5, min_val=4)
