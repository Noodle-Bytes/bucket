# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

import logging
from types import SimpleNamespace

from bucket import Covergroup, Coverpoint, Covertop


class EmptyCovergroup(Covergroup):
    """A covergroup with no children"""

    def setup(self, ctx: SimpleNamespace):
        # Intentionally empty - no coverpoints or child covergroups
        pass


class EmptyNestedCovergroup(Covergroup):
    """A covergroup that contains only empty covergroups"""

    def setup(self, ctx: SimpleNamespace):
        # Add an empty covergroup as a child
        self.add_covergroup(EmptyCovergroup())


class SimpleCoverpoint(Coverpoint):
    """A simple coverpoint for testing"""

    TIER = 1
    TAGS = ["test", "simple"]

    def setup(self, ctx: SimpleNamespace):
        self.add_axis("value", values=[0, 1, 2], description="Test values")

    def sample(self, trace):
        if "value" in trace:
            self.bucket.hit(value=trace["value"])


class CovergroupWithCoverpoints(Covergroup):
    """A covergroup containing actual coverpoints"""

    def setup(self, ctx: SimpleNamespace):
        self.add_coverpoint(SimpleCoverpoint())


class CovertopWithEmptyCovergroups(Covertop):
    """A Covertop subclass for testing empty covergroups"""

    def setup(self, ctx: SimpleNamespace):
        # Can add covergroups here, or leave empty for specific tests
        pass


class EmptyCovertop(Covertop):
    """A completely empty Covertop with no covergroups at all"""

    def setup(self, ctx: SimpleNamespace):
        # Intentionally empty - no covergroups added
        pass


class CovertopWithOnlyEmptyCovergroups(Covertop):
    """A Covertop that only contains empty covergroups"""

    def setup(self, ctx: SimpleNamespace):
        self.add_covergroup(EmptyCovergroup(), name="Empty1")
        self.add_covergroup(EmptyCovergroup(), name="Empty2")
        self.add_covergroup(EmptyNestedCovergroup(), name="EmptyNested")


class MixedCovertop(Covertop):
    """A Covertop with both empty covergroups and covergroups with coverpoints"""

    def setup(self, ctx: SimpleNamespace):
        # Add a covergroup with actual coverpoints
        self.add_covergroup(CovergroupWithCoverpoints(), name="NormalGroup")
        # Add an empty covergroup
        self.add_covergroup(EmptyCovergroup(), name="EmptyGroup1")
        # Add another empty covergroup nested
        self.add_covergroup(EmptyNestedCovergroup(), name="NestedEmptyGroup")
        # Add another normal covergroup
        cg = Covergroup()
        cg.NAME = "AnotherNormalGroup"
        cg.DESCRIPTION = "Another group with coverpoints"

        def setup_cg(self, ctx):
            cp = SimpleCoverpoint()
            cp.TIER = 0
            self.add_coverpoint(cp, name="HighPriorityCoverpoint")

        cg.setup = lambda ctx: setup_cg(cg, ctx)
        self.add_covergroup(cg)


def test_empty_covergroup_basic():
    """Test that an empty covergroup can be created and used without errors"""
    top = CovertopWithEmptyCovergroups(log=logging.getLogger())
    top.add_covergroup(EmptyCovergroup())

    # Empty covergroups should have None tier (no coverage points)
    assert top.EmptyCovergroup._tier is None, "Empty covergroup should have None tier"

    # Should not crash when printing tree
    top.print_tree()


def test_empty_covergroup_tier_filtering():
    """Test that tier filtering works with empty covergroups"""
    top = CovertopWithEmptyCovergroups(log=logging.getLogger())
    top.add_covergroup(EmptyCovergroup())

    # Should not crash when setting tier level
    top.set_tier_level(0)
    top.set_tier_level(5)


def test_empty_covergroup_name_filtering():
    """Test that name filtering works with empty covergroups"""
    top = CovertopWithEmptyCovergroups(log=logging.getLogger())
    top.add_covergroup(EmptyCovergroup())

    # Should not crash when filtering by name
    top.include_by_name("EmptyCovergroup")
    top.exclude_by_name("EmptyCovergroup")
    top.restrict_by_name("EmptyCovergroup")


def test_empty_covergroup_tag_filtering():
    """Test that tag filtering works with empty covergroups"""
    top = CovertopWithEmptyCovergroups(log=logging.getLogger())
    top.add_covergroup(EmptyCovergroup())

    # Should not crash when filtering by tags
    top.include_by_tags(["test"])
    top.exclude_by_tags(["test"])
    top.restrict_by_tags(["test"])


def test_nested_empty_covergroups():
    """Test that nested empty covergroups work correctly"""
    top = CovertopWithEmptyCovergroups(log=logging.getLogger())
    top.add_covergroup(EmptyNestedCovergroup())

    # Empty covergroups should have None tier
    assert top.EmptyNestedCovergroup._tier is None
    top.print_tree()
    top.set_tier_level(0)


def test_empty_covergroup_sampling():
    """Test that sampling works with empty covergroups"""
    top = CovertopWithEmptyCovergroups(log=logging.getLogger())
    top.add_covergroup(EmptyCovergroup())

    # Should not crash when sampling
    top.sample({"test": "data"})


def test_mixed_covergroups():
    """Test a covertop with both empty covergroups and normal covergroups"""
    top = MixedCovertop(log=logging.getLogger())

    # Verify structure
    assert hasattr(top, "NormalGroup")
    assert hasattr(top, "EmptyGroup1")
    assert hasattr(top, "NestedEmptyGroup")
    assert hasattr(top, "AnotherNormalGroup")

    # Verify tiers
    assert top._tier == 0  # Should be minimum tier from children
    assert top.NormalGroup._tier == 1  # From SimpleCoverpoint
    assert top.EmptyGroup1._tier is None  # Empty
    assert top.NestedEmptyGroup._tier is None  # Empty nested
    assert top.AnotherNormalGroup._tier == 0  # From high priority coverpoint

    # Verify tags are propagated correctly
    assert "test" in top._tags
    assert "simple" in top._tags

    # Test printing doesn't crash
    top.print_tree()

    # Test sampling works
    top.sample({"value": 0})
    top.sample({"value": 1})
    top.sample({"value": 2})

    # Test tier filtering
    top.set_tier_level(0)
    assert top._tier_active is True


def test_empty_covertop():
    """Test a completely empty Covertop with no covergroups"""
    top = EmptyCovertop(log=logging.getLogger())

    # Should have None tier (no children)
    assert top._tier is None
    assert top._tags == []

    # Should not crash on operations
    top.print_tree()
    top.sample({"test": "data"})
    top.set_tier_level(0)
    assert top._tier_active is False  # No children, so inactive

    # Filtering should work
    top.include_by_name("anything")
    top.exclude_by_tags(["test"])


def test_covertop_with_only_empty_covergroups():
    """Test a Covertop that only contains empty covergroups"""
    top = CovertopWithOnlyEmptyCovergroups(log=logging.getLogger())

    # Verify structure
    assert hasattr(top, "Empty1")
    assert hasattr(top, "Empty2")
    assert hasattr(top, "EmptyNested")

    # All should have None tier
    assert top._tier is None
    assert top.Empty1._tier is None
    assert top.Empty2._tier is None
    assert top.EmptyNested._tier is None

    # Tags should be empty
    assert top._tags == []

    # Operations should not crash
    top.print_tree()
    top.sample({"test": "data"})

    # Tier filtering
    top.set_tier_level(0)
    assert top._tier_active is False  # All children are empty
    top.set_tier_level(10)
    assert top._tier_active is False  # Still no active children

    # Name filtering should work
    top.include_by_name("Empty1")
    assert top._active is False  # Empty covergroups don't activate

    # Tag filtering should work
    top.include_by_tags(["nonexistent"])
    assert top._active is False
