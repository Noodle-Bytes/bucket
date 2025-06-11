# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

from io import StringIO

from rich.console import Console

from bucket.rw import ConsoleWriter
from bucket.rw.common import (
    CoverageAccess,
    Readout,
)

from ..utils import GeneratedReadout


def check_text(
    text: str,
    cov: CoverageAccess,
    axes: bool = False,
    goals: bool = False,
    points: bool = False,
    summary: bool = True,
):
    lines = iter(text.splitlines())

    for point in cov.points():
        if point.is_group:
            continue

        if axes:
            for axis in point.axes():
                # strip headers etc
                while True:
                    line = next(lines)
                    if line.startswith("│") and line.endswith("│"):
                        break

                start = 0
                for column_value in [axis.name, axis.description]:
                    start = line.index(column_value, start) + len(column_value)

        if goals:
            for goal in point.goals():
                # strip headers etc
                while True:
                    line = next(lines)
                    if line.startswith("│") and line.endswith("│"):
                        break

                start = 0
                for column_value in [goal.name, goal.description, str(goal.target)]:
                    start = line.index(column_value, start) + len(column_value)

        if points:
            point_axes = list(point.axes())
            for bucket in point.buckets():
                # strip headers etc
                while True:
                    line = next(lines)
                    if line.startswith("│") and line.endswith("│"):
                        break

                start = 0
                goal = bucket.goal()
                column_values = list(
                    map(
                        str,
                        (
                            *(bucket.axis_value(a.name) for a in point_axes),
                            bucket.hits,
                            bucket.target if bucket.is_legal else "-",
                            bucket.hit_percent,
                            goal.name,
                            goal.description,
                        ),
                    )
                )

                for column_value in column_values:
                    start = line.index(column_value, start) + len(column_value)

    if summary:
        for point in cov.points():
            # strip headers etc
            while True:
                line = next(lines)
                if line.startswith("│") and line.endswith("│"):
                    break

            column_values = map(
                str,
                (
                    point.name,
                    point.description,
                    point.target,
                    point.hits,
                    point.hit_percent,
                    point.buckets_targeted,
                    point.buckets_hit,
                    point.buckets_full,
                    point.buckets_hit_percent,
                    point.buckets_full_percent,
                ),
            )

            start = 0
            for column_value in column_values:
                start = line.index(column_value, start) + len(column_value)


def check_readout(
    readout: Readout,
    axes: bool = False,
    goals: bool = False,
    points: bool = False,
    summary: bool = True,
):
    cov = CoverageAccess(readout)
    with StringIO() as op:
        # wide to prevent truncation of values
        console = Console(file=op, width=1000)
        writer = ConsoleWriter(
            axes=axes, goals=goals, points=points, summary=summary, console=console
        )
        writer.write(readout)

        check_text(
            op.getvalue(),
            cov,
            axes=axes,
            goals=goals,
            points=points,
            summary=summary,
        )


class TestConsole:
    """
    Tests console display in various configurations. These check that values
    are present but don't check the exact formatting.
    """

    def test_summary(self):
        readout = GeneratedReadout(min_points=3, max_points=10)
        check_readout(readout)

    def test_axes(self):
        readout = GeneratedReadout(min_points=3, max_points=10)
        check_readout(readout, axes=True, summary=False)

    def test_goals(self):
        readout = GeneratedReadout(min_points=3, max_points=10)
        check_readout(readout, goals=True, summary=False)

    def test_points(self):
        readout = GeneratedReadout(min_points=3, max_points=10, max_axis_values=3)
        check_readout(readout, points=True, summary=False)

    def test_all(self):
        readout = GeneratedReadout(min_points=3, max_points=10, max_axis_values=3)
        check_readout(readout, points=True, axes=True, goals=True, summary=True)
