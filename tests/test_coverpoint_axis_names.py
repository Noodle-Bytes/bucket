# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

import pytest

from bucket import Covergroup, Coverpoint, Covertop
from bucket.axis import AxisNameAlreadyInUse


class DuplicateAxisPoint(Coverpoint):
    def setup(self, ctx):
        self.add_axis("value", values=[0, 1], description="First")
        self.add_axis("value", values=[2, 3], description="Second, same name")

    def sample(self, trace):
        pass


class DistinctAxesPoint(Coverpoint):
    def setup(self, ctx):
        self.add_axis("value", values=[0, 1], description="First")
        self.add_axis("other", values=[2, 3], description="Second")

    def sample(self, trace):
        self.bucket.hit(value=trace["value"], other=trace["other"])


class Group(Covergroup):
    NAME = "group"

    def setup(self, ctx):
        self.add_coverpoint(DuplicateAxisPoint(), name="dup")


class Top(Covertop):
    NAME = "top"

    def setup(self, ctx):
        self.add_covergroup(Group())


def test_duplicate_axis_name_is_rejected_at_setup():
    with pytest.raises(AxisNameAlreadyInUse) as excinfo:
        Top()
    message = str(excinfo.value)
    assert "DuplicateAxisPoint" in message
    assert "'value'" in message


def test_distinct_axis_names_are_accepted():
    class LocalTop(Covertop):
        NAME = "top"

        def setup(self, ctx):
            self.add_coverpoint(DistinctAxesPoint(), name="distinct")

    top = LocalTop()
    top.sample({"value": 1, "other": 3})
    assert [axis.name for axis in top.distinct._axes] == ["value", "other"]
    assert sum(top.distinct._hits) == 1
