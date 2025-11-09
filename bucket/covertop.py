# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Vypercore. All Rights Reserved

import logging
from dataclasses import dataclass
from typing import Callable

from pydantic import validate_call

from .base import CoverBase
from .common.types import MatchStrs, TagStrs
from .covergroup import Covergroup


@dataclass
class CoverConfig:
    except_on_illegal: bool = False


class Covertop(Covergroup):
    """This is for the top of the coverage tree"""

    def __init__(
        self,
        log: logging.Logger | None = None,
        verbosity: str | int | None = None,
        except_on_illegal: bool = False,
        source: str | None = None,
        source_key: str | None = None,
    ):
        self.config = CoverConfig(except_on_illegal=except_on_illegal)
        self.source = source
        self.source_key = source_key

        if log:
            assert isinstance(
                log, logging.Logger
            ), f"log should be an instance of logging.Logger. Instead got {type(log)}"
            self.log = log.getChild("bucket")

        else:
            self.log = logging.getLogger("bucket")

        if verbosity is not None:
            if not isinstance(verbosity, int):
                verbosity = getattr(logging, verbosity)
            self.log.setLevel(verbosity)
        self._init(self.log, config=self.config)

    def sample(self, trace):
        """Go through the coverage tree and recursively call sample, passing in trace"""
        processed_trace = self.process_trace(trace)
        if processed_trace is not None:
            for child in self.iter_children():
                child._sample(processed_trace)

    def process_trace(self, trace):
        """
        This function is to modify/preprocess the trace data into
        more useful for coverage. For now this will just return
        the trace as it is, but can be adapted as required.
        """
        return trace

    @validate_call
    def include_by_function(self, matcher: Callable[[CoverBase], bool]):
        """
        Enable coverpoints which match the provided function. Unmatched coverpoints will
        not have their active state changed, except this is the first filter to be
        applied, then any coverpoints which do not match are explicitly set to inactive,
        as the default state is active.
        Parameters:
            matcher: A function to match against coverpoint/covergroup data
        """
        mismatch_state = None
        if not self._filter_applied:
            mismatch_state = False
        self._apply_filter(matcher, True, mismatch_state)
        return self

    @validate_call
    def restrict_by_function(self, matcher: Callable[[CoverBase], bool]):
        """
        Filter coverpoints which match the provided function. Those that match will not
        change their active state, those that don't match will be set to inactive.
        Parameters:
            matcher: A function to match against coverpoint/covergroup data
        """
        self._apply_filter(matcher, None, False)
        return self

    @validate_call
    def exclude_by_function(self, matcher: Callable[[CoverBase], bool]):
        """
        Disable coverpoints which match the provided function. Unmatched coverpoints will
        not have their active state changed.
        Parameters:
            matcher: A function to match against coverpoint/covergroup data
        """
        self._apply_filter(matcher, False, None)
        return self

    @validate_call
    def include_by_name(self, names: MatchStrs):
        """
        Enable coverpoints which match the provided names. Unmatched coverpoints will not
        have their active state changed, except this is the first filter to be applied,
        then any coverpoints which do not match are explicitly set to inactive, as the
        default state is active.
        Parameters:
            names: A case-insensitive string or string list to match against
        """
        return self.include_by_function(self._match_by_name(names))

    @validate_call
    def restrict_by_name(self, names: MatchStrs):
        """
        Filter coverpoints which match the provided names. Those that match will not
        change their active state, those that don't match will be set to inactive.
        Parameters:
            names: A case-insensitive string or string list to match against
        """
        return self.exclude_by_function(self._match_by_name(names))

    @validate_call
    def exclude_by_name(self, names: MatchStrs):
        """
        Disable coverpoints which match the provided names. Unmatched coverpoints will
        not have their active state changed.
        Parameters:
            names: A case-insensitive string or string list to match against
        """
        return self.exclude_by_function(self._match_by_name(names))

    @validate_call
    def include_by_tags(self, tags: TagStrs, match_all: bool = False):
        """
        Enable coverpoints which match the provided tags. Unmatched coverpoints will not
        have their active state changed, except this is the first filter to be applied,
        then any coverpoints which do not match are explicitly set to inactive, as the
        default state is active.
        Parameters:
            tags: Tag(s) to match against
            match_all: If set, all tags must match.
                       If cleared, any tags can match (default: False)
        """
        return self.include_by_function(self._match_by_tags(tags, match_all))

    @validate_call
    def restrict_by_tags(self, tags: TagStrs, match_all: bool = False):
        """
        Filter coverpoints which match the provided tags. Those that match will not
        change their active state, those that don't match will be set to inactive.
        Parameters:
            tags: Tag(s) to match against
            match_all: If set, all tags must match. If cleared, any tags can match
        """
        return self.exclude_by_function(self._match_by_tags(tags, match_all))

    @validate_call
    def exclude_by_tags(self, tags: TagStrs, match_all: bool = False):
        """
        Disable coverpoints which match the provided tags. Unmatched coverpoints will not
        have their active state changed.
        Parameters:
            tags: Tag(s) to match against
            match_all: If set, all tags must match. If cleared, any tags can match
        """
        return self.exclude_by_function(self._match_by_tags(tags, match_all))

    @validate_call
    def set_tier_level(self, tier: int):
        """
        Filter the coverage tree for coverpoints equal to or less than 'tier'.
        Parameters:
            tier: The highest tier level to be set active
        """
        self._set_tier_level(tier)
        return self
