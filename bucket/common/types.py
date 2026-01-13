# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2024 Vypercore. All Rights Reserved

from dataclasses import dataclass
from typing import Annotated, Any

from pydantic import AfterValidator


def list_of_lower_str_validator(m_strs: str | list[str]) -> list[str]:
    "Accept a str or list of strings and make them lowercase"
    if isinstance(m_strs, str):
        m_strs = [m_strs]
    m_strs[:] = (m_str.lower() for m_str in m_strs)
    return m_strs


MatchStrs = Annotated[str | list[str], AfterValidator(list_of_lower_str_validator)]
TagStrs = Annotated[str | list[str], AfterValidator(list_of_lower_str_validator)]


@dataclass(frozen=True)
class BucketVal:
    """
    Represents a bucket axis value with both name (string) and value (actual value).
    This is a frozen dataclass to prevent accidental modification and direct comparison.
    Users should access .name or .value properties explicitly.
    """

    name: str
    value: Any

    def __eq__(self, other: object) -> bool:
        raise TypeError(
            "BucketVal should not be compared directly, use the .name or .value properties!"
        )

    def __lt__(self, other: object) -> bool:
        raise TypeError(
            "BucketVal should not be compared directly, use the .name or .value properties!"
        )

    def __le__(self, other: object) -> bool:
        raise TypeError(
            "BucketVal should not be compared directly, use the .name or .value properties!"
        )

    def __gt__(self, other: object) -> bool:
        raise TypeError(
            "BucketVal should not be compared directly, use the .name or .value properties!"
        )

    def __ge__(self, other: object) -> bool:
        raise TypeError(
            "BucketVal should not be compared directly, use the .name or .value properties!"
        )
