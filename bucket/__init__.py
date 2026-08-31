# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as _version

from . import rw
from .axisutils import AxisUtils
from .context import CoverageContext
from .covergroup import Covergroup
from .coverpoint import Coverpoint
from .covertop import Covertop

# PyPI distribution name. The import package remains `bucket`; `bucket` itself
# is already taken on PyPI (an unrelated Bitbucket CLI).
DIST_NAME = "noodle-bucket"

try:
    __version__ = _version(DIST_NAME)
except PackageNotFoundError:
    __version__ = "unknown"

version = __version__

assert all((CoverageContext, Covergroup, Coverpoint, Covertop, AxisUtils, rw))
