# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

from typing import Callable

from pydantic import validate_call

from .common.exceptions import BucketException


class AxisUtilsException(BucketException):
    pass


class AxisUtilsOneHotIncorrectWidth(AxisUtilsException):
    pass


class AxisUtilsOneHotIncompatibleOptions(AxisUtilsException):
    pass


class AxisUtilsMsbIncorrectWidth(AxisUtilsException):
    pass


class AxisUtilsMsbIncompatibleOptions(AxisUtilsException):
    pass


class AxisUtilsRangesMinHigherThanMax(AxisUtilsException):
    pass


class AxisUtilsRangesTooManyRanges(AxisUtilsException):
    pass


class AxisUtils:
    """Common utils for Axes"""

    @validate_call
    def one_hot(
        width: int,
        display_bin: bool = False,
        display_hex: bool = False,
        include_zero: bool = False,
        pad_zero: bool = True,
    ):
        """
        Creates an axis with one-hot encoding up to the requested width (in bits). Includes zero.
        Bucket name will display in binary/hexadecimal automatically based on width.

        Parameters:
            width: Number of bits
            display_bin: Override bucket name to display as binary (Default: False)
            display_hex: Override bucket name to display as hexadecimal (Default: False)
            include_zero: Include all-zero. (Default: True)
            pad_zero: Pad bucket name with leading zeroes. (Default: True)

            Returns: Dict of {bucket_name: value}

        """
        if width <= 0:
            raise AxisUtilsOneHotIncorrectWidth(
                f"Width must be 1+ for one_hot_axis. Received: {width}"
            )
        if display_bin and display_hex:
            raise AxisUtilsOneHotIncompatibleOptions(
                "Either display_bin OR display_hex may be set for one_hot"
            )

        if not (display_bin or display_hex):
            if width <= 8:
                display_bin = True
            else:
                display_hex = True

        one_hot_vals = []
        if include_zero:
            one_hot_vals.append(0)
        for i in range(width):
            one_hot_vals.append(1 << i)

        if display_bin:
            pad = (width + ((width - 1) // 4)) if pad_zero else 0
            one_hot_dict = {f"0b{v:0{pad}_b}": v for v in one_hot_vals}
        elif display_hex:
            # Count hexadecimal bits plus underscores
            pad = (((width - 1) // 4) + 1 + ((width - 1) // 16)) if pad_zero else 0
            one_hot_dict = {f"0x{v:0{pad}_x}": v for v in one_hot_vals}

        return one_hot_dict

    @validate_call
    def msb(
        width: int,
        display_bin: bool = False,
        display_hex: bool = False,
        pad_zero: bool = True,
        include_max=False,
    ):
        """
        Creates an axis with one-hot encoding up to the requested width (in bits), with the
        full range of values. Includes zero. Bucket name will display in binary/hexadecimal
        automatically based on width.

        Parameters:
            width: Number of bits
            display_bin: Override bucket name to display as binary (Default: False)
            display_hex: Override bucket name to display as hexadecimal (Default: False)
            pad_zero: Pad bucket name with leading zeroes. (Default: True)
            include_maxX: Include all-ones (Default: False)

            Returns: Dict of {bucket_name: value_range}

        """
        if width < 2:
            raise AxisUtilsMsbIncorrectWidth(
                f"Width must be 2+ for msb_axis. Received: {width}"
            )
        if display_bin and display_hex:
            raise AxisUtilsMsbIncompatibleOptions(
                "Either display_bin OR display_hex may be set for msb"
            )

        if not (display_bin or display_hex):
            if width <= 8:
                display_bin = True
            else:
                display_hex = True

        if include_max:
            max_val = (1 << width) - 1

        msb_vals = [0]
        for i in range(width):
            msb_vals.append(1 << i)
        if include_max:
            msb_vals.append(max_val)

        def val_range(msb_val):
            if msb_val == 0:
                lower, upper = 0, 0
            elif include_max and (msb_val == max_val):
                lower, upper = max_val, max_val
            elif include_max and (msb_val == 1 << (width - 1)):
                lower, upper = msb_val, (msb_val << 1) - 2
            else:
                lower, upper = msb_val, (msb_val << 1) - 1
            return [lower, upper]

        if display_bin:
            pad = (width + ((width - 1) // 4)) if pad_zero else 0
            msb_dict = {f"0b{v:0{pad}_b}": val_range(v) for v in msb_vals}
        elif display_hex:
            # Count hexadecimal bits plus underscores
            pad = (((width - 1) // 4) + 1 + ((width - 1) // 16)) if pad_zero else 0
            msb_dict = {f"0x{v:0{pad}_x}": val_range(v) for v in msb_vals}

        return msb_dict

    def enabled():
        return {"Enabled": 1, "Disabled": 0}

    def disabled():
        return {"Disabled": 1, "Enabled": 0}

    def read_write():
        return {"WRITE": 1, "READ": 0}

    def polarity():
        return {"Negative": 1, "Positive": 0}

    @validate_call
    def ranges(
        max_val: int,
        num_ranges: int,
        min_val: int = 0,
        separate_min: bool = False,
        separate_max: bool = False,
        formatter: Callable[[int], str] = str,
    ):
        """
        Creates an axis with a specified number of ranges from min to max values.
        eg. max_val=100, num_ranges=5, separate_max=True:
        -> {
             "0 -> 19": [0, 19],
             "20 -> 39": [20, 39],
             "40 -> 59": [40, 59],
             "60 -> 79": [60, 79],
             "80 -> 99": [80, 99],
             "100": 100
            }

        Parameters:
            min_val: Min value for range (default: 0)
            max_val: Max value for range
            num_ranges: Number of ranges to be split into
            separate_min: Split out min val as separate bucket (default: False)
            separate_max: Split out max val as separate bucket (default: False)
            formatter: Formatter for the name of each bucket. (default: str)

        Returns: Dict of {bucket_name: value}

        """
        if min_val >= max_val:
            raise AxisUtilsRangesMinHigherThanMax(
                f"min_val ({min_val}) must be lower than max_val ({max_val})"
            )

        # assert each range is 1+ in size
        total_range = max_val - min_val
        total_range -= 1 if separate_min else 0
        total_range -= 1 if separate_max else 0
        if (total_range // num_ranges) < 1:
            raise AxisUtilsRangesTooManyRanges(
                f"Total range is too small to have {num_ranges} ranges. Need at least 1 value per range."
            )

        ranges = {}
        if separate_min:
            name = formatter(min_val)
            ranges[name] = min_val
            min_val += 1
        if separate_max:
            name = formatter(max_val)
            ranges[name] = max_val
            max_val -= 1

        step = (total_range + 1) // num_ranges
        remainder = (total_range + 1) % num_ranges

        start = min_val
        for _ in range(num_ranges):
            end = start + step - 1
            if remainder > 0:
                end += 1
                remainder -= 1
            name = f"{formatter(start)} -> {formatter(end)}"
            ranges[name] = [start, end]
            start = end + 1

        return ranges
