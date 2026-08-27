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

        # Fast path: hit(a=..., b=...) with every axis in kwargs. Skip merging
        # into axis_values.
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
            index = 0
            for axis_name, axis_resolver, stride in parent._hit_spec:
                index += axis_resolver(source[axis_name]) * stride
        except KeyError as ex:
            raise Exception(f"Axis {ex.args[0]} has not been set") from None

        # Inlined Coverpoint._get_goal — innermost sampling loop
        bucket_goal = parent._goal_items[index]

        # If the bucket goal is defined as IGNORE, nothing happens.
        # If the bucket goal is defined as ILLEGAL, an error is printed out
        # Else the bucket hit count is incremented
        if bucket_goal.target != 0:
            parent._hits[index] += 1
        if bucket_goal.target < 0:
            illegal_str = (
                f"Illegal bucket '{parent._name}.{bucket_goal.name}' hit! "
                + f"Bucket values: {parent._names_from_index(index)}"
            )
            if parent._config.except_on_illegal:
                raise RuntimeError(illegal_str)
            self.log.error(illegal_str)

    def set_axes(self, **kwargs):
        """
        Update dictionary of axis values, overwriting existing axis values if same key is set again
        """
        self.axis_values.update(kwargs)
