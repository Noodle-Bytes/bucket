# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Vypercore. All Rights Reserved

import hashlib
import itertools
import logging
from collections import defaultdict
from enum import Enum
from types import SimpleNamespace
from typing import TYPE_CHECKING, Callable

from pydantic import validate_call

from .axis import Axis
from .base import CoverBase
from .bucket import Bucket
from .common.chain import Link, OpenLink
from .common.types import TagStrs
from .context import CoverageContext
from .goal import GoalItem
from .link import CovDef, CovRun

if TYPE_CHECKING:
    from .covertop import CoverConfig


class GOAL(Enum):
    ILLEGAL = -1
    IGNORE = 0
    DEFAULT = 10


class Coverpoint(CoverBase):
    MOTIVATION = ""
    TIER = 0
    TAGS = []

    bucket: Bucket
    """
    This Bucket class is used for incrementing the hit count on a given bucket.

    Example 1 (using 'with' to clear the bucket after each use)::

        with self.bucket as bucket:
            bucket.set_axes(
                name=trace['Name'],
                age=trace['Age'],
                size=trace['Weight']
            )
            bucket.hit()

    Example 2 (Showing how the bucket axes can be set multiple times, and old values retained)::

            self.bucket.clear()
            self.bucket.set_axes(
                name=trace['Name'],
                age=trace['Age'],
            )
            for toy in trace['Toys']:
                bucket.set_axes(toy = toy)
                self.bucket.hit()

    Example 3 (demonstrating passing in all axis values into hit, rather than calling set_axes)::

            self.bucket.hit(
                name=trace['Name'],
                age=trace['Age'],
                size=trace['Weight']
            )

    """

    def _init(
        self,
        log: logging.Logger,
        name: str | None = None,
        description: str | None = None,
        motivation: str | None = None,
        *,
        config: "CoverConfig",
    ):
        self._active = True
        self._config = config

        self.log = log
        self.debug = log.debug
        self.info = log.info
        self.warning = log.warning
        self.error = log.error

        # List of axes used by this coverpoint
        self._axes: list[Axis] = []  # TODO make a dict
        # Number of hits for each bucket
        self._cvg_hits = defaultdict(int)
        # Dictionary of defined goals
        self._goal_dict = {"DEFAULT": GoalItem()}
        # Dictionary of goals for each bucket
        self._cvg_goals = {}
        # Instance of Bucket class to increment hit count for a bucket
        self.bucket = Bucket(parent=self, log=log)

        self._tier = 0
        self._tier_active = True
        self._tags = []

        self._setup()
        self._name = name or self.NAME or type(self).__name__
        self._description = description if description is not None else self.DESCRIPTION
        self._motivation = motivation if motivation is not None else self.MOTIVATION

        self._sha = hashlib.sha256((self._name + self._description).encode())
        self._axis_names = [x.name for x in self._axes]
        goals = SimpleNamespace(**self._goal_dict)
        for combination in self._all_axis_value_combinations():
            # Create bucket with both name and value for each axis
            bucket_dict = {}
            for axis, value_name in zip(self._axes, combination, strict=True):
                actual_value = axis.values[value_name]
                bucket_dict[axis.name] = SimpleNamespace(
                    name=value_name, value=actual_value
                )
            bucket = SimpleNamespace(**bucket_dict)
            if goal := self.apply_goals(bucket, goals):
                self._cvg_goals[combination] = goal
            else:
                goal = self._goal_dict["DEFAULT"]
            self._sha.update(goal.sha.digest())

        self.debug(f"Coverpoint created: {self._name}: {self._description}")

    def _setup(self):
        """
        This calls the user defined setup() plus any other setup required
        """
        self.setup(ctx=CoverageContext.get())
        self.set_tags(self.TAGS)
        self.set_tier(self.TIER)

    def setup(self, ctx: SimpleNamespace):
        """
        This function needs to be implemented for each coverpoint. Axes and goals are added here.
        See example.py for how to use
        """
        raise NotImplementedError("This needs to be implemented by the coverpoint")

    @validate_call
    def set_tier(self, tier):
        """Set coverpoint tier"""
        self._tier = tier
        return self

    @validate_call
    def set_tags(self, tags: TagStrs):
        """Override coverpoint tags with only those provided"""
        self._tags = tags
        return self

    @validate_call
    def add_tags(self, tags: TagStrs):
        """Add coverpoint tags to existing ones"""
        self._tags += tags
        return self

    def _set_tier_level(self, tier: int):
        self._tier_active = True if tier >= self._tier else False
        return self._tier_active

    def _apply_filter(
        self,
        matcher: Callable[[CoverBase], bool],
        match_state: bool | None,
        mismatch_state: bool | None,
    ):
        is_match = matcher(self)
        if is_match and match_state is not None:
            self._active = match_state
        elif not is_match and mismatch_state is not None:
            self._active = mismatch_state
        return self._active

    def _sample(self, trace):
        """
        Call user defined sample function if active
        """
        if self._active and self._tier_active:
            self.sample(trace)

    def _all_axis_value_combinations(self):
        """
        Iterate over all possible axis value combinations
        """
        axis_values = []
        for axis in self._axes:
            axis_values.append(list(axis.values.keys()))
        yield from itertools.product(*axis_values)

    def _increment_hit_count(self, bucket: tuple, hits: int = 1):
        """
        Increment hit count for the specified bucket. Default is +1
        """
        self._cvg_hits[bucket] += hits

    @validate_call
    def add_axis(
        self,
        name: str,
        values: dict | list | set | tuple,
        description: str,
        enable_other: None | bool | str = None,
    ):
        """
        Add axis with values to process later
        """
        self._axes.append(Axis(name, values, description, enable_other))

    @validate_call
    def add_goal(
        self,
        name: str,
        description: str,
        illegal: bool = False,
        ignore: bool = False,
        target: int | None = None,
    ):
        formatted_name = name.upper()
        assert (
            formatted_name not in self._goal_dict
        ), f'Goal "{formatted_name}" already defined for this coverpoint'
        assert (
            sum([illegal, ignore, (target is not None)]) <= 1
        ), "Only one option may be chosen: illegal, ignore or target"
        assert target is None or target > 0, "If target is supplied, it must be 1+"

        if illegal:
            target = -1
        elif ignore:
            target = 0
        elif target is None:
            # This shouldn't be hardcoded, something that can be overridden would be good
            target = 10

        self._goal_dict[formatted_name] = GoalItem(name, target, description)

    def apply_goals(self, bucket: SimpleNamespace, goals: SimpleNamespace):
        """
        If coverpoint goals are defined, this function must be implemented by the coverpoint.
        If no goals are defined, then 'DEFAULT' will be applied
        See example.py for how to use.
        """
        if len(self._goal_dict) == 1:
            return self._goal_dict["DEFAULT"]
        raise NotImplementedError("This needs to be implemented by the coverpoint")

    def _get_goal(self, bucket: tuple):
        """
        Retrieve goal for a given bucket
        """
        if bucket in self._cvg_goals:
            return self._cvg_goals[bucket]
        else:
            return self._goal_dict["DEFAULT"]

    def _chain_def(self, start: OpenLink[CovDef] | None = None) -> Link[CovDef]:
        start = start or OpenLink(CovDef())

        child_start = start.link_down()
        child_close = None

        for axis in self._axes:
            child_close = axis.chain(child_start)
            child_start = child_close.link_across()

        for goal in self._goal_dict.values():
            child_close = goal.chain(child_start)
            child_start = child_close.link_across()

        buckets = 0
        target = 0
        target_buckets = 0
        for bucket in self._all_axis_value_combinations():
            bucket_target = self._get_goal(bucket).target
            if bucket_target > 0:
                target += bucket_target
                target_buckets += 1
            buckets += 1

        link = CovDef(
            point=1,
            bucket=buckets,
            target=target,
            target_buckets=target_buckets,
            sha=self._sha,
        )

        return start.close(self, child=child_close, link=link, typ=CoverBase)

    def _chain_run(self, start: OpenLink[CovRun] | None = None) -> Link[CovRun]:
        start = start or OpenLink(CovRun())

        buckets = 0
        hits = 0
        hit_buckets = 0
        full_buckets = 0
        for bucket in self._all_axis_value_combinations():
            bucket_target = self._get_goal(bucket).target
            bucket_hits = self._cvg_hits[bucket]

            if bucket_target > 0:
                bucket_hits = min(bucket_target, bucket_hits)
                if bucket_hits > 0:
                    hit_buckets += 1
                    if bucket_hits == bucket_target:
                        full_buckets += 1
                    hits += bucket_hits
            buckets += 1

        link = CovRun(
            point=1,
            bucket=buckets,
            hits=hits,
            hit_buckets=hit_buckets,
            full_buckets=full_buckets,
        )

        return start.close(self, link=link, typ=CoverBase)

    def _bucket_goals(self):
        """
        Get goals for each bucket
        """
        for bucket in self._all_axis_value_combinations():
            yield self._get_goal(bucket).name

    def _bucket_hits(self):
        """
        Get hits for each bucket
        """
        for bucket in self._all_axis_value_combinations():
            yield self._cvg_hits[bucket]
