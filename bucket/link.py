# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

import hashlib
from dataclasses import dataclass, fields
from typing import Self


@dataclass(kw_only=True)
class CovDef:
    point: int = 0
    axis: int = 0
    axis_value: int = 0
    goal: int = 0
    bucket: int = 0
    target: int = 0
    target_buckets: int = 0
    sha: "hashlib._Hash" = hashlib.sha256()

    def __add__(self, other: Self) -> Self:
        new = type(self)()
        for field in fields(self):
            if field.name == "sha":
                new_sha = self.sha.copy()
                new_sha.update(other.sha.digest())
                setattr(new, field.name, new_sha)
            else:
                setattr(
                    new,
                    field.name,
                    getattr(self, field.name) + getattr(other, field.name),
                )
        return new


@dataclass(kw_only=True)
class CovRun:
    point: int = 0
    bucket: int = 0
    hits: int = 0
    hit_buckets: int = 0
    full_buckets: int = 0

    def __add__(self, other: Self) -> Self:
        new = type(self)()
        for field in fields(self):
            setattr(
                new, field.name, getattr(self, field.name) + getattr(other, field.name)
            )
        return new
