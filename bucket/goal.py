# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

import hashlib
from dataclasses import dataclass

from .common.chain import Link, OpenLink
from .link import CovDef


@dataclass
class GoalItem:
    name: str = "DEFAULT"
    target: int = 10
    description: str = ""

    def __post_init__(self):
        self.sha = hashlib.sha256(
            (self.name + self.description + str(self.target)).encode()
        )

    def chain(self, start: OpenLink[CovDef] | None = None) -> Link[CovDef]:
        start = start or OpenLink(CovDef())
        link = CovDef(goal=1, sha=self.sha)
        return start.close(self, link=link, typ=GoalItem)
