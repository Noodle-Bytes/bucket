# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

from rich.console import Console
from rich.table import Column, Table

from .common import CoverageAccess, Readout, Writer


class ConsoleWriter(Writer):
    """
    Write coverage information out to the terminal using Rich.
    """

    def __init__(
        self,
        axes=False,
        goals=False,
        points=False,
        summary=True,
        console: Console | None = None,
    ):
        self.write_axes = axes
        self.write_goals = goals
        self.write_points = points
        self.write_summary = summary
        self.console = console or Console()

    def write(self, readout: Readout):
        summary_table_columns = [
            Column("Name", justify="left", style="cyan", no_wrap=True),
            Column("Description", justify="left", style="cyan", no_wrap=True),
            Column("Target", justify="right", style="cyan", no_wrap=True),
            Column("Hits", justify="right", style="cyan", no_wrap=True),
            Column("Hits %", justify="right", style="cyan", no_wrap=True),
            Column("Target Buckets", justify="right", style="cyan", no_wrap=True),
            Column("Hit Buckets", justify="right", style="cyan", no_wrap=True),
            Column("Full Buckets", justify="right", style="cyan", no_wrap=True),
            Column("Hit %", justify="right", style="cyan", no_wrap=True),
            Column("Full %", justify="right", style="cyan", no_wrap=True),
        ]
        summary_table = Table(*summary_table_columns, title="Point Summary")

        point_tables = []
        point_table_base_columns = [
            Column("Hits", justify="right", style="cyan", no_wrap=True),
            Column("Target", justify="right", style="cyan", no_wrap=True),
            Column("Target %", justify="right", style="cyan", no_wrap=True),
            Column("Goal Name", justify="left", style="cyan", no_wrap=True),
            Column("Goal Description", justify="left", style="cyan", no_wrap=True),
        ]

        coverage = CoverageAccess(readout)

        # Display source and source_key
        source = readout.get_source()
        source_key = readout.get_source_key()
        if source or source_key:
            info_table = Table(title="Source Information")
            info_table.add_column("Field", justify="left", style="cyan", no_wrap=True)
            info_table.add_column("Value", justify="left", style="cyan", no_wrap=True)
            info_table.add_row("Source", source if source else "N/A")
            info_table.add_row("Source Key", source_key if source_key else "N/A")
            self.console.print(info_table)
            self.console.print()

        for point in coverage.points():
            summary_table.add_row(
                point.name,
                point.description,
                str(point.target),
                str(point.hits),
                point.hit_percent,
                str(point.buckets_targeted),
                str(point.buckets_hit),
                str(point.buckets_full),
                point.buckets_hit_percent,
                point.buckets_full_percent,
            )

            if point.is_group:
                # Skip groups
                continue

            axis_table = Table("Name", "Description", title=f"{point.name} - Axes")
            if self.write_axes:
                point_tables.append(axis_table)

            axis_titles = []
            for axis in point.axes():
                axis_table.add_row(axis.name, axis.description)
                axis_titles.append(axis.name)

            if self.write_goals:
                goal_table = Table(
                    "Name", "Description", "Target", title=f"{point.name} - Goals"
                )
                point_tables.append(goal_table)
                for goal in point.goals():
                    goal_table.add_row(goal.name, goal.description, str(goal.target))

            if self.write_points:
                standard_columns = [c.copy() for c in point_table_base_columns]
                point_table = Table(
                    *(axis_titles + standard_columns),
                    title=f"{point.name} - {point.description}",
                )
                point_tables.append(point_table)

                for bucket in point.buckets():
                    goal = bucket.goal()

                    bucket_columns = []

                    for axis_title in axis_titles:
                        bucket_columns.append(bucket.axis_value(axis_title))

                    bucket_columns += [
                        str(bucket.hits),
                        str(bucket.target) if bucket.is_legal else "-",
                        bucket.hit_percent,
                        goal.name,
                        goal.description,
                    ]

                    point_table.add_row(*bucket_columns)

        for point_table in point_tables:
            self.console.print(point_table)
        if self.write_summary:
            self.console.print(summary_table)
