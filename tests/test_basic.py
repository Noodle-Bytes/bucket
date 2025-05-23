# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Vypercore. All Rights Reserved

from pathlib import Path
from tempfile import NamedTemporaryFile

from example import example


def test_example():
    "Run the example"
    with NamedTemporaryFile("w") as tf:
        example.run(Path(tf.name))
