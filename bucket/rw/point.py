# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

from ..axis import Axis
from ..covergroup import CoverBase
from ..coverpoint import Coverpoint
from ..goal import GoalItem
from .common import (
    AxisTuple,
    AxisValueTuple,
    BucketGoalTuple,
    BucketHitTuple,
    GoalTuple,
    PointHitTuple,
    PointTuple,
    PuppetReadout,
    Reader,
)


class PointReader(Reader):
    """
    Read coverage from coverpoints
    """

    def __init__(
        self,
        context_sha,
        source: str = "",
        source_key: str | int = "",
    ):
        self._rec_sha = context_sha
        # Always store as string, default to empty string
        self._source = str(source)
        self._source_key = str(source_key)

    def read(self, point):
        readout = PuppetReadout()

        chain = point._chain_def()
        readout.def_sha = chain.end.sha.hexdigest()
        readout.rec_sha = self._rec_sha

        # Get source and source_key: PointReader params take precedence, then Covertop attributes, then empty string
        # Both PointReader and Covertop store as strings (empty string if not set)
        # Store empty strings as empty strings (not None) - export formats can handle empty strings
        # PointReader params always take precedence (even if empty string), then Covertop, then default to empty string
        if self._source:
            readout.source = self._source
        elif hasattr(point, "source"):
            readout.source = point.source
        else:
            readout.source = ""

        if self._source_key:
            readout.source_key = self._source_key
        elif hasattr(point, "source_key"):
            readout.source_key = point.source_key
        else:
            readout.source_key = ""
        for point_link in sorted(
            chain.index.iter(CoverBase), key=lambda link: (link.start.point, link.depth)
        ):
            readout.points.append(PointTuple.from_link(point_link))

            if isinstance(point_link.item, Coverpoint):
                start = point_link.start.bucket
                goal_start = point_link.start.goal
                goal_offsets = {
                    k: i for i, k in enumerate(point_link.item._goal_dict.keys())
                }
                for offset, goal in enumerate(point_link.item._bucket_goals()):
                    bg_tuple = BucketGoalTuple(
                        start=(start + offset), goal=(goal_start + goal_offsets[goal])
                    )
                    readout.bucket_goals.append(bg_tuple)

        for axis_link in chain.index.iter(Axis):
            readout.axes.append(AxisTuple.from_link(axis_link))

            start = axis_link.start.axis_value
            for offset, axis_value in enumerate(axis_link.item.values.keys()):
                av_tuple = AxisValueTuple(start=(start + offset), value=axis_value)
                readout.axis_values.append(av_tuple)

        for goal_link in chain.index.iter(GoalItem):
            readout.goals.append(GoalTuple.from_link(goal_link))

        self.point = point
        chain = self.point._chain_run()

        for point_link in sorted(
            chain.index.iter(CoverBase), key=lambda link: (link.start.point, link.depth)
        ):
            readout.point_hits.append(PointHitTuple.from_link(point_link))

            if isinstance(point_link.item, Coverpoint):
                start = point_link.start.bucket
                for offset, hits in enumerate(point_link.item._bucket_hits()):
                    bh_tuple = BucketHitTuple(start=(start + offset), hits=hits)
                    readout.bucket_hits.append(bh_tuple)

        return readout
