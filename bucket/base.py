# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

from typing import Callable

from .common.chain import Link, OpenLink
from .link import CovDef, CovRun


class CoverBase:
    NAME: str | None = None
    DESCRIPTION: str = ""

    _full_path: str

    def setup(self):
        raise NotImplementedError("This needs to be implemented by the coverpoint")

    def sample(self, trace):
        raise NotImplementedError("This needs to be implemented by the coverpoint")

    def _chain_def(self, start: OpenLink[CovDef] | None = None) -> Link[CovDef]: ...

    def _chain_run(self, start: OpenLink[CovRun] | None = None) -> Link[CovRun]: ...

    def _apply_filter(
        self,
        matcher: Callable[["CoverBase"], bool],
        match_state: bool,
        mismatch_state: bool | None,
    ) -> bool: ...

    def _set_tier_level(self, tier: int) -> bool: ...

    def print(
        self,
        axes: bool = True,
        goals: bool = True,
        points: bool = True,
        summary: bool = True,
    ):
        "Print all coverage data to the console"
        # Import rw functions here to avoid circular imports
        from .rw import ConsoleWriter, PointReader

        ConsoleWriter(axes=axes, goals=goals, points=points, summary=summary).write(
            PointReader("").read(self)
        )

    def print_axes(self):
        "Print coverage axis data to the console"
        self.print(axes=True, goals=False, points=False, summary=False)

    def print_goals(self):
        "Print coverage goal data to the console"
        self.print(axes=False, goals=True, points=False, summary=False)

    def print_points(self):
        "Print coverage point data to the console"
        self.print(axes=False, goals=False, points=True, summary=False)

    def print_summary(self):
        "Print coverage summary data to the console"
        self.print(axes=False, goals=False, points=False, summary=True)
