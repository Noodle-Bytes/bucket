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
        self.clear()

    def __call__(self): ...

    def clear(self):
        """
        This function clears the bucket. No values will be retained for any axis
        """
        self.axis_values = {}

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

        # If axis values are passed in, set axes
        self.set_axes(**kwargs)

        axis_values = self.axis_values
        assert (
            len(axis_values) == self.parent._axis_count
        ), "Incorrect number of axes have been set"

        axis_value_list = []
        for axis_name, axis_resolver in self.parent._axis_resolvers:
            if axis_name in axis_values:
                result = axis_resolver(axis_values[axis_name])
                axis_value_list.append(result)
            else:
                raise Exception(f"Axis {axis_name} has not been set")

        # make it a tuple, increment cvg_hits
        axis_value_tuple = tuple(axis_value_list)
        # Check for any applied goals
        bucket_goal = self.parent._get_goal(axis_value_tuple)

        # If the bucket goal is defined as IGNORE, nothing happens.
        # If the bucket goal is defined as ILLEGAL, an error is printed out
        # Else the bucket hit count is incremented
        if bucket_goal.target != 0:
            self.parent._increment_hit_count(axis_value_tuple)
        if bucket_goal.target < 0:
            illegal_str = (
                f"Illegal bucket '{self.parent._name}.{bucket_goal.name}' hit! "
                + f"Bucket values: {dict(zip(self.parent._axis_names, list(axis_value_tuple), strict=True))}"
            )
            if self.parent._config.except_on_illegal:
                raise RuntimeError(illegal_str)
            self.log.error(illegal_str)

    def set_axes(self, **kwargs):
        """
        Update dictionary of axis values, overwriting existing axis values if same key is set again
        """
        self.axis_values.update(kwargs)
