# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

from bucket import Covergroup, Coverpoint, Covertop


class DefaultTierTagsCoverpoint(Coverpoint):
    TIER = 2
    TAGS = ["class_default"]

    def setup(self, ctx):
        self.add_axis("value", values=[0, 1], description="Test axis")

    def sample(self, trace):
        pass


class ChainedTierTagsCoverpoint(Coverpoint):
    TIER = 0
    TAGS = ["class_default"]

    def setup(self, ctx):
        self.add_axis("value", values=[0, 1], description="Test axis")

    def sample(self, trace):
        pass


class SetupTierCoverpoint(Coverpoint):
    TIER = 0

    def setup(self, ctx):
        self.add_axis("value", values=[0, 1], description="Test axis")
        self.set_tier(4)

    def sample(self, trace):
        pass


class TierTagsCovergroup(Covergroup):
    NAME = "tier_tags_cg"

    def setup(self, ctx):
        self.add_coverpoint(DefaultTierTagsCoverpoint())
        self.add_coverpoint(
            ChainedTierTagsCoverpoint().set_tier(5).set_tags(["toys", "age", "legs"])
        )
        self.add_coverpoint(SetupTierCoverpoint())


class TierTagsTop(Covertop):
    NAME = "tier_tags_top"

    def setup(self, ctx):
        self.add_covergroup(TierTagsCovergroup())


def test_coverpoint_uses_class_tier_and_tags_by_default():
    top = TierTagsTop()
    cp = top.tier_tags_cg.DefaultTierTagsCoverpoint
    assert cp._tier == 2
    assert cp._tags == ["class_default"]


def test_coverpoint_preserves_tier_and_tags_chained_before_add_coverpoint():
    top = TierTagsTop()
    cp = top.tier_tags_cg.ChainedTierTagsCoverpoint
    assert cp._tier == 5
    assert cp._tags == ["toys", "age", "legs"]


def test_coverpoint_set_tier_in_setup_is_preserved():
    top = TierTagsTop()
    cp = top.tier_tags_cg.SetupTierCoverpoint
    assert cp._tier == 4
