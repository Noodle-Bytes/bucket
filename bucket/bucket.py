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
        axis_values = self.axis_values
        if kwargs:
            axis_values.update(kwargs)

        parent = self.parent
        assert (
            len(axis_values) == parent._axis_count
        ), "Incorrect number of axes have been set"

        try:
            axis_value_tuple = tuple(
                [
                    axis_resolver(axis_values[axis_name])
                    for axis_name, axis_resolver in parent._axis_resolvers
                ]
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
