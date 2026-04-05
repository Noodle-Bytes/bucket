# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

import hashlib
from bisect import bisect_right
from enum import Enum, auto
from functools import lru_cache

from .common.chain import Link, OpenLink
from .common.exceptions import BucketException
from .link import CovDef


class AxisException(BucketException):
    pass


class AxisRangeNotInt(AxisException):
    pass


class AxisRangeIncorrectLength(AxisException):
    pass


class AxisIncorrectNameFormat(AxisException):
    pass


class AxisOtherNameAlreadyInUse(AxisException):
    pass


class AxisIncorrectValueFormat(AxisException):
    pass


class AxisUnrecognisedValue(AxisException):
    pass


class AxisOverlappingRanges(AxisException):
    pass


class AxisLookupMode(Enum):
    GENERIC = auto()
    SCALAR_ONLY = auto()
    RANGES_NON_OVERLAPPING = auto()


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
        self._ordered_values = tuple(self.values.items())
        self._init_lookup_index()

        self.size = 0
        self.sha = hashlib.sha256((self.name + self.description).encode())
        for key in self.values.keys():
            self.size += 1
            self.sha.update(key.encode())

    def _init_lookup_index(self):
        """
        Build lookup indexes for fast resolution while preserving existing matching semantics.
        """
        self._lookup_mode = AxisLookupMode.GENERIC

        scalar_entries = []
        range_entries = []
        for order, (key, resolved_value) in enumerate(self._ordered_values):
            if isinstance(resolved_value, (list, tuple)):
                range_entries.append((order, key, resolved_value))
            else:
                scalar_entries.append((order, key, resolved_value))

        # Fast path: only scalar values.
        if range_entries == []:
            self._lookup_mode = AxisLookupMode.SCALAR_ONLY
            self._exact_lookup = {}
            self._unhashable_exact_values = []
            for _order, key, resolved_value in scalar_entries:
                try:
                    hash(resolved_value)
                except TypeError:
                    self._unhashable_exact_values.append((key, resolved_value))
                else:
                    self._exact_lookup.setdefault(resolved_value, key)
            return

        # Validate that ranges do not overlap. Gaps are allowed, but overlaps
        # are disallowed and must be caught during setup rather than sampling.
        ordered_ranges = []
        for _order, key, resolved_value in range_entries:
            start, end = resolved_value
            ordered_ranges.append((start, end, key))

        sorted_ranges = sorted(ordered_ranges, key=lambda it: (it[0], it[1], it[2]))
        if sorted_ranges:
            _prev_start, prev_end, _prev_key = sorted_ranges[0]
            for start, end, _key in sorted_ranges[1:]:
                if start <= prev_end:
                    raise AxisOverlappingRanges(
                        f'Axis "{self.name}" has overlapping ranges defined'
                    )
                _prev_start, prev_end = start, end

        # Fast path: ranges (plus optional "Other"/None scalar), non-overlapping.
        has_only_ranges_and_other = True
        for _order, key, resolved_value in scalar_entries:
            if not (
                self.enable_other and key == self.other_name and resolved_value is None
            ):
                has_only_ranges_and_other = False
                break

        if has_only_ranges_and_other:
            self._lookup_mode = AxisLookupMode.RANGES_NON_OVERLAPPING
            self._range_starts = [it[0] for it in sorted_ranges]
            self._range_ends = [it[1] for it in sorted_ranges]
            self._range_keys = [it[2] for it in sorted_ranges]
            self._exact_lookup = {}
            self._unhashable_exact_values = []
            for _order, key, resolved_value in scalar_entries:
                try:
                    hash(resolved_value)
                except TypeError:
                    self._unhashable_exact_values.append((key, resolved_value))
                else:
                    self._exact_lookup.setdefault(resolved_value, key)
            return

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
            if any(not isinstance(item, int) for item in ranges):
                raise AxisRangeNotInt("Ranges should be specified as integers")
            if len(ranges) != 2:
                raise AxisRangeIncorrectLength(
                    "Ranges should be specified as a list of two integers"
                    + f"length of range is not 2. Length was {len(ranges)}"
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
            raise AxisIncorrectValueFormat(
                f"Unexpected type for values. Got {type(values)}. Expected dict/list/tuple/set"
            )

        # Add 'other' if enabled
        if self.enable_other:
            if self.other_name in values_dict:
                raise AxisOtherNameAlreadyInUse(
                    f'Values already contains name "{self.other_name}"'
                    + " - alternate name for Other must be used"
                )
            values_dict[str(self.other_name)] = None

        for key in values_dict:
            if not isinstance(key, str):
                raise AxisIncorrectNameFormat(
                    "Values provided for axis are incorrectly formatted: "
                    + f"{key} is {type(key).__name__}. All names must be string",
                )

        return dict(sorted(values_dict.items()))

    @lru_cache(maxsize=4096)  # noqa: B019
    def get_named_value(self, value: str | int):
        """
        Retrieve the name of the value/range for a given value
        """
        if (value_str := str(value)) in self.values:
            return value_str

        if self._lookup_mode == AxisLookupMode.SCALAR_ONLY:
            try:
                return self._exact_lookup[value]
            except (KeyError, TypeError):
                pass

            for key, resolved_value in self._unhashable_exact_values:
                if value == resolved_value:
                    return key

        elif self._lookup_mode == AxisLookupMode.RANGES_NON_OVERLAPPING:
            try:
                return self._exact_lookup[value]
            except (KeyError, TypeError):
                pass

            for key, resolved_value in self._unhashable_exact_values:
                if value == resolved_value:
                    return key

            if isinstance(value, int) and self._range_starts:
                idx = bisect_right(self._range_starts, value) - 1
                if idx >= 0 and value <= self._range_ends[idx]:
                    return self._range_keys[idx]

        else:
            # Generic semantics-preserving path.
            # Must be named, in a range or 'other'
            for k, v in self._ordered_values:
                if value == v:
                    return k
                elif isinstance(v, (list, tuple)) and isinstance(value, int):
                    if v[0] <= value <= v[1]:
                        return k

        # Value not recognised as user defined
        # If 'other' category has been enabled, then return other name
        if not self.enable_other:
            raise AxisUnrecognisedValue(
                f'Unrecognised value for axis "{self.name}": {value}',
            )
        return self.other_name
