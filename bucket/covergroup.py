# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Vypercore. All Rights Reserved

import hashlib
import itertools
import logging
from types import NoneType, SimpleNamespace
from typing import TYPE_CHECKING, Callable, Iterable

from pydantic import validate_call

from .base import CoverBase
from .common.chain import Link, OpenLink
from .common.types import MatchStrs, TagStrs
from .context import CoverageContext
from .link import CovDef, CovRun

if TYPE_CHECKING:
    from .coverpoint import Coverpoint


class Covergroup(CoverBase):
    """This class groups coverpoints together, and adds them to the hierarchy"""

    def _init(
        self,
        log: logging.Logger,
        name: str | None = None,
        description: str | None = None,
        parent=None,
    ):
        """
        Parameters:
            name: Name of covergroup
            description: Description of covergroup
        """
        self.log = log
        self.debug = log.debug
        self.info = log.info
        self.warning = log.warning
        self.error = log.error

        self._name = name or self.NAME or type(self).__name__
        self._description = description if description is not None else self.DESCRIPTION

        # Required for top covergroup - will be overwritten for all others
        self._full_path = self._name.lower()

        self._tier = None
        self._tier_active = True
        self._tags = []

        self._filter_applied = False
        self._active = True
        self._coverpoints = {}
        self._covergroups = {}
        self._sha = hashlib.sha256((self._name + self._description).encode())
        self._setup()

    def _setup(self):
        """
        This calls the user defined setup() plus any other setup required
        """
        self.setup(ctx=CoverageContext.get())
        self._set_full_path_for_children()
        self._update_tags_and_tiers()

    def setup(self, ctx: SimpleNamespace):
        raise NotImplementedError("This needs to be implemented by the covergroup")

    def _update_tags_and_tiers(self):
        """
        Update covergroup with child tiers and tags
        """
        for child in self.iter_children():
            if self._tier is None or child._tier < self._tier:
                self._tier = child._tier
            for tag in child._tags:
                if tag not in self._tags:
                    self._tags.append(tag)

    def _set_full_path_for_children(self):
        """
        Set full_path strings for each child
        """
        for cp in self._coverpoints.values():
            cp._full_path = self._full_path + f".{cp._name.lower()}"

        for cg in self._covergroups.values():
            cg._full_path = self._full_path + f".{cg._name.lower()}"
            cg._set_full_path_for_children()

    def _set_tier_level(self, tier: int):
        any_children_active = False
        for child in self.iter_children():
            any_children_active |= child._set_tier_level(tier)
        self._tier_active = any_children_active
        return self._tier_active

    def _match_by_name(self, names: MatchStrs):
        def matcher(cp: CoverBase):
            l_name = cp._full_path.lower()
            return any(f_str in l_name for f_str in names)

        return matcher

    def _match_by_tier(self, tier: int):
        def matcher(cp: CoverBase):
            return cp._tier <= tier

        return matcher

    def _match_by_tags(self, tags: TagStrs, match_all: bool = False):
        def matcher(cp: CoverBase):
            if not isinstance(cp, Coverpoint):
                return False
            if match_all:
                return all(tag in cp._tags for tag in tags)
            else:
                return any(tag in cp._tags for tag in tags)

        return matcher

    def _apply_filter(
        self,
        matcher: Callable[[CoverBase], bool],
        match_state: bool | None,
        mismatch_state: bool | None,
    ):
        self._filter_applied = True
        any_children_active = False
        if matcher(self):
            for child in self.iter_children():
                any_children_active |= child._apply_filter(
                    lambda _: True, match_state, mismatch_state
                )
        else:
            for child in self.iter_children():
                any_children_active |= child._apply_filter(
                    matcher, match_state, mismatch_state
                )

        self._active = any_children_active
        return self._active

    def add_coverpoint(
        self,
        coverpoint: "Coverpoint",
        name: str | None = None,
        description: str | None = None,
        motivation: str | None = None,
    ):
        """
        Add a coverpoint instance to the covergroup
        Parameters:
            coverpoint: instance of a coverpoint
            name: [Optional]: Override the name
            description: [Optional]: Override the description
            motivation: [Optional]: Override the motivation
        """
        assert isinstance(
            name, str | NoneType
        ), f"name must be a string, not {type(name)}"
        assert isinstance(
            description, str | NoneType
        ), f"description must be a string, not {type(description)}"
        assert isinstance(
            motivation, str | NoneType
        ), f"motivation must be a string, not {type(motivation)}"
        coverpoint._init(
            self.log,
            name=name,
            description=description,
            motivation=motivation,
            parent=self,
        )

        if coverpoint._name in self._coverpoints:
            raise Exception("Coverpoint names must be unique within a covergroup")
        self._coverpoints[coverpoint._name] = coverpoint

    def add_covergroup(
        self,
        covergroup: "Covergroup",
        name: str | None = None,
        description: str | None = None,
    ):
        """
        Add a covergroup instance to the covergroup
        Parameters:
            covergroup: instance of a covergroup
            name: [Optional]: Override the name
            description: [Optional]: Override the description
        """
        assert isinstance(
            name, str | NoneType
        ), f"name must be a string, not {type(name)}"
        assert isinstance(
            description, str | NoneType
        ), f"description must be a string, not {type(description)}"
        covergroup._init(
            self.log,
            name=name,
            description=description,
            parent=self,
        )
        if covergroup._name in self._covergroups:
            raise Exception("Covergroup names must be unique within a covergroup")
        self._covergroups[covergroup._name] = covergroup

    def __getattr__(self, key: str):
        """
        Allow reference to child covergroups and coverpoints using <parent>.<child>
        """
        if key in self._covergroups:
            return self._covergroups[key]
        elif key in self._coverpoints:
            return self._coverpoints[key]
        else:
            return super().__getattribute__(key)

    @validate_call
    def print_tree(self, indent: int = 0):
        """Print out coverage hierarch from this covergroup down"""

        def fmt_active(active):
            return "A" if active else "-"

        if indent == 0:
            self.info("COVERAGE_TREE")
            self.info(
                f"[{fmt_active(self._active)}]({self._tier}) {self._name}: {self._description} -- Tags:{self._tags}"
            )
        indent += 1
        indentation = "    " * indent
        for cp in self._coverpoints.values():
            self.info(
                f"[{fmt_active(cp._active)}]({cp._tier}) {indentation}|-- {cp._name}: {cp._description} -- Tags:{cp._tags}"
            )

        for cg in self._covergroups.values():
            self.info(
                f"[{fmt_active(cg._active)}]({cg._tier}) {indentation}|-- {cg._name}: {cg._description} -- Tags:{cg._tags}"
            )
            cg.print_tree(indent + 1)

    def should_sample(self, trace) -> bool:
        # This function can be optionally overridden by the user to stop the covergroup from
        # passing on the trace data to its children. By default it returns True.
        return True

    def _sample(self, trace):
        """Call sample for all children if active"""

        if self._active and self.should_sample(trace):
            for child in self.iter_children():
                child._sample(trace)

    @validate_call
    def iter_children(self) -> Iterable[CoverBase]:
        self._coverpoints = dict(sorted(self._coverpoints.items()))
        self._covergroups = dict(sorted(self._covergroups.items()))

        yield from itertools.chain(
            self._coverpoints.values(), self._covergroups.values()
        )

    def _chain_def(self, start: OpenLink[CovDef] | None = None) -> Link[CovDef]:
        start = start or OpenLink(CovDef())
        child_start = start.link_down()
        child_close = None
        for child in self.iter_children():
            child_close = child._chain_def(child_start)
            child_start = child_close.link_across()
        return start.close(
            self, child=child_close, link=CovDef(point=1, sha=self._sha), typ=CoverBase
        )

    def _chain_run(self, start: OpenLink[CovRun] | None = None) -> Link[CovRun]:
        start = start or OpenLink(CovRun())
        child_start = start.link_down()
        child_close = None
        for child in self.iter_children():
            child_close = child._chain_run(child_start)
            child_start = child_close.link_across()
        return start.close(self, child=child_close, link=CovRun(point=1), typ=CoverBase)


class Covertop(Covergroup):
    """This is for the top of the coverage tree"""

    def __init__(
        self, log: logging.Logger | None = None, verbosity: str | int = "INFO"
    ):
        if log:
            assert isinstance(
                log, logging.Logger
            ), f"log should be an instance of logging.Logger. Instead got {type(log)}"
            self.log = log.getChild("bucket")
            self.log.setLevel(getattr(logging, verbosity, getattr(logging, "INFO")))
        else:
            import sys

            self.log = logging.getLogger("bucket")
            handler = logging.StreamHandler(sys.stdout)
            logging_verbosity = getattr(logging, verbosity, getattr(logging, "INFO"))
            handler.setLevel(logging_verbosity)
            formatter = logging.Formatter(
                "%(asctime)s - %(name)-20s - %(levelname)s - %(message)s"
            )
            handler.setFormatter(formatter)
            self.log.addHandler(handler)
        self._init(self.log)

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
