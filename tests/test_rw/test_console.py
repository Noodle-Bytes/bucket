# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

from io import StringIO
from typing import Iterator

from rich.console import Console

from bucket.rw import ConsoleWriter
from bucket.rw.common import (
    CoverageAccess,
    Readout,
)

from ..utils import GeneratedReadout


def _check_column_values_in_line(column_values, line: str):
    """
    Check that all column values are present in a table line, handling truncation.

    Args:
        column_values: Iterable of column values to check for
        line: The table line to search in
    """
    for column_value in column_values:
        col_str = str(column_value)
        found = False
        for part in line.split("│"):
            part = part.strip()
            if part and (
                col_str in part
                or part.startswith(col_str)
                or col_str.startswith(part.rstrip("…"))
            ):
                found = True
                break
        if not found:
            raise ValueError(f"Column value '{column_value}' not found in line: {line}")


def check_text(
    text: str,
    cov: CoverageAccess,
    axes: bool = False,
    goals: bool = False,
    points: bool = False,
    summary: bool = True,
):
    lines = iter(text.splitlines())

    def next_row(lines_iter: Iterator[str]) -> str:
        """
        Skip to the next non-header table row.
        """
        while True:
            line = next(lines_iter)
            # Skip source information table if present (look for its title or content)
            if "Source Information" in line:
                # Skip until we find the end of this table (empty line or next table)
                while True:
                    line = next(lines_iter)
                    if not line.strip() or (
                        line.startswith("┏")
                        or "Summary" in line
                        or "Axes" in line
                        or "Goals" in line
                        or "Point" in line
                    ):
                        break
                continue
            # Skip source info table rows
            if (
                "Source" in line
                and "│" in line
                and ("Field" in line or "Value" in line)
            ):
                continue
            if "Source Key" in line and "│" in line:
                continue
            # skip headers etc
            if line.startswith("│") and line.endswith("│"):
                return line

    for point in cov.points():
        if point.is_group:
            continue

        if axes:
            for axis in point.axes():
                line = next_row(lines)

                # Check that all column values are present in the line
                for column_value in [axis.name, axis.description]:
                    if str(column_value) not in line:
                        raise ValueError(
                            f"Column value '{column_value}' not found in line: {line}"
                        )

        if goals:
            for goal in point.goals():
                line = next_row(lines)

                # Check that all column values are present in the line
                for column_value in [goal.name, goal.description, str(goal.target)]:
                    if str(column_value) not in line:
                        raise ValueError(
                            f"Column value '{column_value}' not found in line: {line}"
                        )

        if points:
            point_axes = list(point.axes())
            for bucket in point.buckets():
                line = next_row(lines)

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

                # Check that all column values are present (handle truncation)
                _check_column_values_in_line(column_values, line)

    if summary:
        for point in cov.points():
            line = next_row(lines)

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

            # Check that all column values are present in the line (handle truncation with …)
            _check_column_values_in_line(column_values, line)


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

    def test_source_display_with_both(self):
        """
        Test that source information table appears when both source and source_key are set
        """
        readout = GeneratedReadout(min_points=3, max_points=10)
        readout.source = "test_source"
        readout.source_key = "test_key_123"
        output = StringIO()
        console = Console(file=output, width=1000)
        writer = ConsoleWriter(console=console)
        writer.write(readout)
        text = output.getvalue()

        assert "Source Information" in text
        assert "Source" in text
        assert "Source Key" in text
        assert "test_source" in text
        assert "test_key_123" in text

    def test_source_display_with_source_only(self):
        """
        Test that source information table appears when only source is set
        """
        readout = GeneratedReadout(min_points=3, max_points=10)
        readout.source = "test_source_only"
        readout.source_key = None
        output = StringIO()
        console = Console(file=output, width=1000)
        writer = ConsoleWriter(console=console)
        writer.write(readout)
        text = output.getvalue()

        assert "Source Information" in text
        assert "Source" in text
        assert "Source Key" in text
        assert "test_source_only" in text
        assert "N/A" in text

    def test_source_display_with_source_key_only(self):
        """
        Test that source information table appears when only source_key is set
        """
        readout = GeneratedReadout(min_points=3, max_points=10)
        readout.source = None
        readout.source_key = "key_only_456"
        output = StringIO()
        console = Console(file=output, width=1000)
        writer = ConsoleWriter(console=console)
        writer.write(readout)
        text = output.getvalue()

        assert "Source Information" in text
        assert "Source" in text
        assert "Source Key" in text
        assert "key_only_456" in text
        assert "N/A" in text

    def test_source_display_with_none(self):
        """
        Test that source information table does not appear when both are None
        """
        readout = GeneratedReadout(min_points=3, max_points=10)
        readout.source = None
        readout.source_key = None
        output = StringIO()
        console = Console(file=output, width=1000)
        writer = ConsoleWriter(console=console)
        writer.write(readout)
        text = output.getvalue()

        assert "Source Information" not in text
