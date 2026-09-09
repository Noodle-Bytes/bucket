# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

import pytest

from bucket.base import CoverBase


class TestCoverBase:
    def test_unimplemented_functions(self):
        base = CoverBase()

        with pytest.raises(NotImplementedError):
            base.setup()
        with pytest.raises(NotImplementedError):
            base.sample(None)
