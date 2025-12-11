# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Vypercore. All Rights Reserved

from pathlib import Path
from tempfile import TemporaryDirectory

from example import example


def test_example():
    "Run the example"
    with TemporaryDirectory() as td:
        example.run(Path(td))
