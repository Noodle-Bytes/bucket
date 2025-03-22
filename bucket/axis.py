# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Vypercore. All Rights Reserved

import hashlib
from functools import lru_cache

from .common.chain import Link, OpenLink
from .common.ensure import ensure
from .link import CovDef


class AxisRangeNotInt(Exception):
    pass


class AxisRangeIncorrectLength(Exception):
    pass


class AxisIncorrectNameFormat(Exception):
    pass


class AxisOtherNameAlreadyInUse(Exception):
    pass


class AxisIncorrectValueFormat(Exception):
    pass


class AxisUnrecognisedValue(Exception):
    pass


class Axis:
    def __init__(
        self,
        name: str,
        values: dict | list | set | tuple,
        description: str,
        enable_other: None | bool | str = None,
    ):
        self.name = name
        self.description = description
        self.enable_other = True if enable_other is not None else False
        self.other_name = enable_other if isinstance(enable_other, str) else "Other"

        self.values = self.sanitise_values(values)

        self.size = 0
        self.sha = hashlib.sha256((self.name + self.description).encode())
        for key in self.values.keys():
            self.size += 1
            self.sha.update(key.encode())

    def chain(self, start: OpenLink[CovDef] | None = None) -> Link[CovDef]:
        start = start or OpenLink(CovDef())
        link = CovDef(axis=1, axis_value=self.size, sha=self.sha)
        return start.close(self, link=link, typ=Axis)

    def sanitise_values(self, values: dict | list | set | tuple):
        """
        Take input values and return a dict
        Input values can be in the form of dict, tuple, list or set
        The return dictionary will have string form of the values as the key
        and the values (or ranges) as the value.
        """

        def check_ranges(ranges):
            ensure(
                all(isinstance(item, int) for item in ranges),
                AxisRangeNotInt,
                "Ranges should be specified as integers",
            )
            ensure(
                len(ranges) == 2,
                AxisRangeIncorrectLength,
                "Ranges should be specified as a list of two integers"
                + f"length of range is not 2. Length was {len(ranges)}",
            )

        if isinstance(values, dict):
            values_dict = values
            for v in values_dict.values():
                if isinstance(v, list | tuple | set):
                    check_ranges(v)
        elif isinstance(values, list | tuple | set):
            values_dict = {}
            for v in values:
                if isinstance(v, list | tuple | set):
                    check_ranges(v)
                    sorted_v = sorted(v)
                    key = f"{sorted_v[0]} -> {sorted_v[1]}"
                    values_dict[key] = sorted_v
                else:
                    values_dict[str(v)] = v
        else:
            ensure(
                False,
                AxisIncorrectValueFormat,
                f"Unexpected type for values. Got {type(values)}. Expected dict/list/tuple/set",
            )

        # Add 'other' if enabled
        if self.enable_other:
            ensure(
                self.other_name not in values_dict,
                AxisOtherNameAlreadyInUse,
                f'Values already contains "{self.other_name}"',
            )
            values_dict[str(self.other_name)] = None

        for key in values_dict:
            ensure(
                isinstance(key, str),
                AxisIncorrectNameFormat,
                "Values provided for axis are incorrectly formatted: "
                + f"{key} is {type(key).__name__}. All names must be string",
            )

        return dict(sorted(values_dict.items()))

    @lru_cache(maxsize=128)  # noqa: B019
    def get_named_value(self, value: str | int):
        """
        Retrieve the name of the value/range for a given value
        """
        if (value_str := str(value)) in self.values:
            return value_str
        else:
            # Must be named, in a range or 'other'
            for k, v in self.values.items():
                if value == v:
                    return k
                elif isinstance(v, list) and isinstance(value, int):
                    if v[0] <= value <= v[1]:
                        return k

            # Value not recognised as user defined
            # If 'other' category has been enabled, then return other name
            ensure(
                self.enable_other,
                AxisUnrecognisedValue,
                f"Unrecognised value for axis '{self.name}': {value}",
            )
            return self.other_name
