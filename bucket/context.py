# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

from copy import copy
from types import SimpleNamespace


class ContextBase:
    _stack: list["SimpleNamespace"] = [SimpleNamespace()]

    def __init__(self, replace: bool = False, overlay: bool = True, **kwargs):
        if overlay:
            self.data = copy(self._stack[-1])
            for k, v in kwargs.items():
                if not replace and hasattr(self.data, k):
                    raise KeyError(
                        f"Context already contains `{k}` and `replace` is False"
                    )
                setattr(self.data, k, v)
        else:
            self.data = SimpleNamespace(**kwargs)

    def __enter__(self):
        self._stack.append(self.data)

    def __exit__(self, _extype, _exval, _extb):
        self._stack.pop()

    @classmethod
    def get(cls):
        if len(cls._stack):
            return cls._stack[-1]
        return SimpleNamespace()


class CoverageContext(ContextBase): ...
