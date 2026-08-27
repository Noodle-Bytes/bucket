# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Vypercore. All Rights Reserved
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .coverpoint import Coverpoint


class Bucket:
    """
    This class is used for incrementing the hit count on a given bucket.
    This is meant to be used within the coverpoint as self.bucket.
    See coverpoint.py or example.py for how to use
    """

    def __init__(self, parent: "Coverpoint", log: logging.Logger):
        self.parent = parent
        self.log = log
        self.axis_values = {}

    def __call__(self): ...

    def clear(self):
        """
        This function clears the bucket. No values will be retained for any axis
        """
        self.axis_values.clear()

    def __enter__(self):
        # 'with' allows the bucket to be wiped before use
        self.clear()
        return self

    def __exit__(self, *args):
        # 'with' allows the bucket to be wiped after use
        self.clear()

    def hit(self, **kwargs):
        """
        This function will attempt to increment the hit count for the combination of axis
        values specified. All axes need to have been set to a valid value, if not an error
        will be generated.
        """

        parent = self.parent
        resolvers = parent._axis_resolvers

        # Fast path: hit(a=..., b=...) with every axis in kwargs. Skip merging
        # into axis_values and skip the intermediate list before the tuple.
        if len(kwargs) == parent._axis_count:
            source = kwargs
        else:
            axis_values = self.axis_values
            if kwargs:
                axis_values.update(kwargs)
            assert (
                len(axis_values) == parent._axis_count
            ), "Incorrect number of axes have been set"
            source = axis_values

        try:
            axis_value_tuple = tuple(
                axis_resolver(source[axis_name])
                for axis_name, axis_resolver in resolvers
            )
        except KeyError as ex:
            raise Exception(f"Axis {ex.args[0]} has not been set") from None

        # Check for any applied goals (inlined Coverpoint._get_goal — this is
        # the innermost sampling loop, where the extra call is measurable)
        bucket_goal = parent._cvg_goals.get(axis_value_tuple, parent._default_goal)

        # If the bucket goal is defined as IGNORE, nothing happens.
        # If the bucket goal is defined as ILLEGAL, an error is printed out
        # Else the bucket hit count is incremented
        if bucket_goal.target != 0:
            parent._cvg_hits[axis_value_tuple] += 1
        if bucket_goal.target < 0:
            illegal_str = (
                f"Illegal bucket '{parent._name}.{bucket_goal.name}' hit! "
                + f"Bucket values: {dict(zip(parent._axis_names, list(axis_value_tuple), strict=True))}"
            )
            if parent._config.except_on_illegal:
                raise RuntimeError(illegal_str)
            self.log.error(illegal_str)

    def set_axes(self, **kwargs):
        """
        Update dictionary of axis values, overwriting existing axis values if same key is set again
        """
        self.axis_values.update(kwargs)
