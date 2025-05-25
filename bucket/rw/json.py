# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

import json
from pathlib import Path

from .common import (
    AxisTuple,
    AxisValueTuple,
    BucketGoalTuple,
    BucketHitTuple,
    GoalTuple,
    PointHitTuple,
    PointTuple,
    Readout,
    Writer,
)

###############################################################################
# Accessors
###############################################################################


class JSONWriter(Writer):
    """
    Write to a json file
    """

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

        if self.path.exists():
            with self.path.open("r") as f:
                data = json.load(f)
        else:
            data = {}

        if "tables" not in data:
            data["tables"] = {
                "point": PointTuple._fields,
                "axis": AxisTuple._fields,
                "axis_value": AxisValueTuple._fields,
                "goal": GoalTuple._fields,
                "bucket_goal": BucketGoalTuple._fields,
                "point_hit": PointHitTuple._fields,
                "bucket_hit": BucketHitTuple._fields,
            }
        if "definitions" not in data:
            data["definitions"] = []
        if "records" not in data:
            data["records"] = []

        with self.path.open("w") as f:
            json.dump(data, f)

    def write(self, readout: Readout):
        with self.path.open("r") as f:
            data = json.load(f)

            definition = {
                "sha": readout.get_def_sha(),
                "point": [list(it) for it in readout.iter_points()],
                "axis": [list(it) for it in readout.iter_axes()],
                "axis_value": [list(it) for it in readout.iter_axis_values()],
                "goal": [list(it) for it in readout.iter_goals()],
                "bucket_goal": [list(it) for it in readout.iter_bucket_goals()],
            }

            definition_id = len(data["definitions"])
            data["definitions"].append(definition)

            record = {
                "def": definition_id,
                "sha": "",
                "point_hit": [list(it) for it in readout.iter_point_hits()],
                "bucket_hit": [list(it) for it in readout.iter_bucket_hits()],
            }

            record_id = len(data["records"])
            data["records"].append(record)

        with self.path.open("w") as f:
            json.dump(data, f)

        return record_id
