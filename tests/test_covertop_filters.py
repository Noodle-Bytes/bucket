# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

"""
Semantics of the Covertop include/restrict/exclude filters.

Each filter family (function, name, tags) must agree on what happens to a
matched and an unmatched coverpoint:

    include:  matched -> active,   unmatched -> unchanged
              (except the very first filter, which deactivates the rest)
    restrict: matched -> unchanged, unmatched -> inactive
    exclude:  matched -> inactive, unmatched -> unchanged
"""

import pytest

from bucket import Covergroup, Coverpoint, Covertop


class _Point(Coverpoint):
    def setup(self, ctx):
        self.samples = 0
        self.add_axis("value", values=[0, 1], description="Test axis")

    def sample(self, trace):
        self.samples += 1


class CatsPoint(_Point):
    TAGS = ["pets", "cats"]


class DogsPoint(_Point):
    TAGS = ["pets", "dogs"]


class FishPoint(_Point):
    TAGS = ["fish"]


class PetsGroup(Covergroup):
    NAME = "pets"

    def setup(self, ctx):
        self.add_coverpoint(CatsPoint(), name="cats")
        self.add_coverpoint(DogsPoint(), name="dogs")


class AquariumGroup(Covergroup):
    NAME = "aquarium"

    def setup(self, ctx):
        self.add_coverpoint(FishPoint(), name="fish")


class FilterTop(Covertop):
    NAME = "top"

    def setup(self, ctx):
        self.add_covergroup(PetsGroup())
        self.add_covergroup(AquariumGroup())


def _active(top: FilterTop) -> dict[str, bool]:
    return {
        "cats": top.pets.cats._active,
        "dogs": top.pets.dogs._active,
        "fish": top.aquarium.fish._active,
    }


def _top() -> FilterTop:
    top = FilterTop()
    assert _active(top) == {"cats": True, "dogs": True, "fish": True}
    return top


# ---------------------------------------------------------------------------
# restrict: matched unchanged, unmatched deactivated
# ---------------------------------------------------------------------------


def test_restrict_by_name_keeps_matches_and_disables_the_rest():
    top = _top()
    top.restrict_by_name("cats")
    assert _active(top) == {"cats": True, "dogs": False, "fish": False}


def test_restrict_by_name_matches_anywhere_in_the_path():
    top = _top()
    top.restrict_by_name("pets")
    assert _active(top) == {"cats": True, "dogs": True, "fish": False}


def test_restrict_by_tags_keeps_matches_and_disables_the_rest():
    top = _top()
    top.restrict_by_tags(["cats"])
    assert _active(top) == {"cats": True, "dogs": False, "fish": False}


def test_restrict_by_tags_match_all():
    top = _top()
    top.restrict_by_tags(["pets", "dogs"], match_all=True)
    assert _active(top) == {"cats": False, "dogs": True, "fish": False}


def test_restrict_by_tags_match_any():
    top = _top()
    top.restrict_by_tags(["cats", "fish"])
    assert _active(top) == {"cats": True, "dogs": False, "fish": True}


def test_restrict_does_not_reactivate_already_disabled_points():
    top = _top()
    top.exclude_by_name("cats")
    top.restrict_by_name("pets")
    # cats matched the restriction but had already been excluded: unchanged.
    assert _active(top) == {"cats": False, "dogs": True, "fish": False}


def test_restrict_by_function_matches_name_and_tag_variants():
    by_function = _top().restrict_by_function(lambda cp: "dogs" in cp._full_path)
    by_name = _top().restrict_by_name("dogs")
    by_tags = _top().restrict_by_tags(["dogs"])
    assert _active(by_function) == _active(by_name) == _active(by_tags)
    assert _active(by_name) == {"cats": False, "dogs": True, "fish": False}


# ---------------------------------------------------------------------------
# exclude: matched deactivated, unmatched unchanged
# ---------------------------------------------------------------------------


def test_exclude_by_name_disables_only_matches():
    top = _top()
    top.exclude_by_name("cats")
    assert _active(top) == {"cats": False, "dogs": True, "fish": True}


def test_exclude_by_tags_disables_only_matches():
    top = _top()
    top.exclude_by_tags(["pets"])
    assert _active(top) == {"cats": False, "dogs": False, "fish": True}


# ---------------------------------------------------------------------------
# include: matched activated; first include deactivates everything else
# ---------------------------------------------------------------------------


def test_first_include_by_name_disables_the_rest():
    top = _top()
    top.include_by_name("cats")
    assert _active(top) == {"cats": True, "dogs": False, "fish": False}


def test_subsequent_include_by_name_leaves_unmatched_alone():
    top = _top()
    top.include_by_name("cats")
    top.include_by_name("fish")
    assert _active(top) == {"cats": True, "dogs": False, "fish": True}


def test_include_by_tags_reactivates_excluded_points():
    top = _top()
    top.exclude_by_tags(["pets"])
    top.include_by_tags(["dogs"])
    assert _active(top) == {"cats": False, "dogs": True, "fish": True}


# ---------------------------------------------------------------------------
# chaining and group roll-up
# ---------------------------------------------------------------------------


def test_filters_chain_and_return_self():
    top = _top()
    result = top.restrict_by_name("pets").exclude_by_tags(["cats"])
    assert result is top
    assert _active(top) == {"cats": False, "dogs": True, "fish": False}


def test_covergroup_active_reflects_children():
    top = _top()
    top.restrict_by_name("cats")
    assert top.pets._active is True
    assert top.aquarium._active is False


@pytest.mark.parametrize(
    "method",
    ["restrict_by_name", "exclude_by_name", "include_by_name"],
)
def test_name_filters_are_case_insensitive(method):
    lower = getattr(_top(), method)("cats")
    upper = getattr(_top(), method)("CATS")
    assert _active(lower) == _active(upper)


def test_filtered_points_do_not_sample():
    top = _top()
    top.restrict_by_name("cats")
    top.sample({})
    top.sample({})
    assert top.pets.cats.samples == 2
    assert top.pets.dogs.samples == 0
    assert top.aquarium.fish.samples == 0
