# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Noodle-Bytes. All Rights Reserved

"""
Coverage waivers (exclusions).

A waiver file excuses buckets that were not (fully) hit from scoring after the
fact, so that verification sign-off can distinguish "unhit" from "unhit but
excused". Waivers are matched against a readout by coverpoint path and axis
value names; matched buckets are represented in memory as
``BucketWaiverTuple`` rows and excluded from the point hit totals (see
``bucket.rw.common.compute_point_hits`` for the scoring semantics).

Matching rules:

- ``point`` is a case-insensitive glob (``fnmatch`` syntax) on the dotted path
  of point names from the root, e.g. ``"Pets.dogs.*"``. A waiver whose glob
  matches a point's own path *or any ancestor path* applies to it, so naming a
  covergroup (``"Pets.dogs"``) waives buckets in its whole subtree. This is
  the same convention as the report's ``--point`` option.
- ``axes`` maps axis names to one or more case-insensitive globs matched
  against the bucket's axis *value name*. A bucket matches when every listed
  axis matches one of its patterns; axes not listed match anything, and an
  empty ``axes`` waives every bucket of the point.
- Only buckets whose goal target is > 0 are waivable; illegal (target < 0)
  and ignore (target == 0) buckets are never waived.
- The first waiver (in file order) matching a bucket supplies its reason.
"""

from __future__ import annotations

import json
from fnmatch import fnmatchcase
from pathlib import Path
from typing import Iterable

from pydantic import BaseModel, Field, field_validator

from .common.exceptions import BucketException
from .rw.common import BucketWaiverTuple, CoverageAccess, PointAccess, Readout


class WaiverError(BucketException):
    """A waiver specification could not be applied."""


class WaiverAxisError(WaiverError):
    """A waiver names an axis that a matched coverpoint does not have."""


def _normalise_text(value: str) -> str:
    # Reasons are stored one per CSV row in archives, so keep them single-line.
    return " ".join(str(value).split())


class Waiver(BaseModel):
    """
    One waiver rule. See the module docstring for the matching rules.
    """

    point: str = Field(min_length=1)
    axes: dict[str, str | list[str]] = {}
    reason: str = Field(min_length=1)
    author: str = ""
    disabled: bool = False

    @field_validator("reason")
    @classmethod
    def _reason_not_blank(cls, value: str) -> str:
        value = _normalise_text(value)
        if not value:
            raise ValueError("waiver reason must not be empty")
        return value

    @field_validator("author")
    @classmethod
    def _author_single_line(cls, value: str) -> str:
        return _normalise_text(value)

    @field_validator("axes")
    @classmethod
    def _axes_patterns_non_empty(
        cls, value: dict[str, str | list[str]]
    ) -> dict[str, str | list[str]]:
        for axis, patterns in value.items():
            if isinstance(patterns, list) and not patterns:
                raise ValueError(f"axis {axis!r} has no patterns")
        return value

    def axis_patterns(self) -> dict[str, list[str]]:
        """Axis patterns normalised to lower-case lists."""
        return {
            axis: [
                str(pattern).lower()
                for pattern in (
                    [patterns] if isinstance(patterns, str) else list(patterns)
                )
            ]
            for axis, patterns in self.axes.items()
        }

    def matches_point(self, path: str) -> bool:
        """
        True if the point glob matches the dotted path or any ancestor path.
        """
        pattern = self.point.lower()
        parts = path.lower().split(".")
        return any(
            fnmatchcase(".".join(parts[:count]), pattern)
            for count in range(1, len(parts) + 1)
        )

    def matches_axis_values(self, axis_values: dict[str, str]) -> bool:
        """
        True if every listed axis value name matches one of its patterns.
        """
        for axis, patterns in self.axis_patterns().items():
            value = str(axis_values[axis]).lower()
            if not any(fnmatchcase(value, pattern) for pattern in patterns):
                return False
        return True


class WaiverFile(BaseModel):
    """
    The waiver specification file: ``{"waivers": [Waiver, ...]}``.
    """

    waivers: list[Waiver] = []


def load_waivers(path: str | Path) -> WaiverFile:
    """
    Load and validate a waiver specification from a JSON file.
    """
    with Path(path).open("r", encoding="utf-8") as f:
        data = json.load(f)
    return WaiverFile.model_validate(data)


def iter_point_paths(readout: Readout) -> Iterable[tuple[str, int, int]]:
    """
    Yield (dotted_path, index, depth) for every point of the readout, where
    index is the point's position in ``iter_points()`` order. The dotted path
    joins the names of all ancestors from the root with ".".
    """
    names: list[str] = []
    for index, point in enumerate(readout.iter_points()):
        # Points are ordered by (start, depth), so the most recently seen
        # point at each shallower depth is this point's ancestor.
        del names[point.depth :]
        names.append(point.name)
        yield ".".join(names), index, point.depth


def match_waivers(readout: Readout, waiver_file: WaiverFile) -> list[BucketWaiverTuple]:
    """
    Resolve a waiver file against a readout.

    Returns the waived buckets (global bucket index and reason) ordered by
    index. The first matching waiver wins for each bucket. Raises
    ``WaiverAxisError`` if a waiver that matches a coverpoint names an axis
    the coverpoint does not have.
    """
    if not waiver_file.waivers:
        return []

    coverage = CoverageAccess(readout)
    points = list(readout.iter_points())
    point_hits = list(readout.iter_point_hits())
    matched: dict[int, str] = {}

    for path, index, _depth in iter_point_paths(readout):
        point = points[index]
        if point.end != point.start + 1:
            # Groups hold no buckets of their own.
            continue

        applicable = [
            waiver
            for waiver in waiver_file.waivers
            if not waiver.disabled and waiver.matches_point(path)
        ]
        if not applicable:
            continue

        access = PointAccess(coverage, point, point_hits[index])
        axis_names = {axis.name for axis in access.axes()}
        for waiver in applicable:
            unknown = sorted(set(waiver.axes) - axis_names)
            if unknown:
                raise WaiverAxisError(
                    f"Waiver for point {waiver.point!r} names unknown "
                    f"axis/axes {unknown} on coverpoint {path!r}; its axes are "
                    f"{sorted(axis_names)}"
                )

        for bucket in access.buckets():
            if bucket.target <= 0 or bucket.start in matched:
                continue
            axis_values = bucket.axis_values
            for waiver in applicable:
                if waiver.matches_axis_values(axis_values):
                    matched[bucket.start] = waiver.reason
                    break

    return [
        BucketWaiverTuple(index, reason) for index, reason in sorted(matched.items())
    ]
