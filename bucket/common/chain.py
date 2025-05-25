# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved
"""
This file contains utilities to label the bounds of items in a tree structure.

Each node is given start and end bounds such that a child's start bound is
always >= a parents start bound, a child's end bound is always < a
parents end bound, and a node's end bound is always > its start bound.

This is done by (starting at the root node):
  1. Get this node start bound from one of:
    - (For root node) an initial value, usually 0.
    - (for the first child of a parent) the start bound of the parent .
    -  (for subsequent children) the end bound of the the previous child.
  2. Recurse 1.
  3. Add the size of this node (usually 1) to create the end bound of this
     node.

We describe this process as chaining through the tree, with each Link being
connected to a node in the tree, and containing the start and end bound
information. Links are opened from parents or siblings and passed through
to the next node.

When a link is closed, it adds itself to an shared index, which each link in
a chain has a reference to. The index can be used to iterate over links of
a certain type in a chain.

The start and end bounds can be complex multi-faceted values so long as they
can be added together.
"""

from collections import defaultdict
from typing import Any, Generic, Hashable, Optional, Protocol, Self, TypeVar


class Index:
    def __init__(self):
        self.values = defaultdict(list)

    def add(self, typ: Hashable, item: "Link"):
        self.values[typ].append(item)

    def iter(self, typ: Hashable):
        yield from self.values[typ]


class Addable(Protocol):
    def __add__(self, other: Self) -> Self: ...


_LinkType = TypeVar("_LinkType", bound=Addable)


class OpenLink(Generic[_LinkType]):
    def __init__(self, start: _LinkType, index: Optional[Index] = None, depth: int = 0):
        self.start = start
        self.index = index or Index()
        self.depth = depth

    def link_down(self):
        return OpenLink[_LinkType](
            start=self.start, index=self.index, depth=self.depth + 1
        )

    def close(
        self,
        item: Any,
        *,
        typ: Hashable,
        link: Optional[_LinkType] = None,
        child: Optional["Link[_LinkType]"] = None,
    ):
        if child is None:
            end = self.start
        else:
            end = child.end

        if link is not None:
            end += link

        return Link[_LinkType](self, item=item, typ=typ, end=end)


class Link(Generic[_LinkType]):
    def __init__(
        self, open_link: OpenLink[_LinkType], item: Any, typ: Hashable, end: _LinkType
    ):
        self.start = open_link.start
        self.depth = open_link.depth
        self.index = open_link.index
        self.item = item
        self.end = end
        self.index.add(typ, self)

    def link_across(self):
        return OpenLink[_LinkType](start=self.end, index=self.index, depth=self.depth)
