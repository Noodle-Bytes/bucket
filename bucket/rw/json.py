# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

import json
from pathlib import Path
from typing import Iterable

from .common import (
    Accessor,
    AxisTuple,
    AxisValueTuple,
    BucketGoalTuple,
    BucketHitTuple,
    GoalTuple,
    PointHitTuple,
    PointTuple,
    PuppetReadout,
    Reader,
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
                "sha": readout.get_rec_sha(),
                "test_name": readout.get_test_name(),
                "seed": readout.get_seed(),
                "point_hit": [list(it) for it in readout.iter_point_hits()],
                "bucket_hit": [list(it) for it in readout.iter_bucket_hits()],
            }

            record_id = len(data["records"])
            data["records"].append(record)

        with self.path.open("w") as f:
            json.dump(data, f)

        return record_id


class JSONReader(Reader):
    """
    Read from a JSON file
    """

    def __init__(self, path: str | Path):
        self.path = Path(path)

    def read(self, rec_ref: int):
        readout = PuppetReadout()

        with self.path.open("r") as f:
            data = json.load(f)

        record = data.get("records", [])[rec_ref]
        definition = data.get("definitions", [])[record["def"]]

        readout.rec_sha = record["sha"]
        readout.test_name = record.get("test_name")
        readout.seed = record.get("seed")
        readout.def_sha = definition["sha"]

        readout.points = [PointTuple(*p) for p in definition["point"]]
        readout.axes = [AxisTuple(*a) for a in definition["axis"]]
        readout.axis_values = [AxisValueTuple(*av) for av in definition["axis_value"]]
        readout.goals = [GoalTuple(*g) for g in definition["goal"]]
        readout.bucket_goals = [
            BucketGoalTuple(*bg) for bg in definition["bucket_goal"]
        ]

        readout.point_hits = [PointHitTuple(*ph) for ph in record["point_hit"]]
        readout.bucket_hits = [BucketHitTuple(*bh) for bh in record["bucket_hit"]]

        return readout

    def read_all(self) -> Iterable[Readout]:
        with self.path.open("r") as f:
            data = json.load(f)

        for record_index in range(len(data.get("records", []))):
            yield self.read(record_index)


class JSONAccessor(Accessor):
    """
    Read/Write from/to an JSON file.
    """

    def __init__(self, path: str | Path):
        self.path = path

    def reader(self):
        return JSONReader(self.path)

    def writer(self):
        return JSONWriter(self.path)
