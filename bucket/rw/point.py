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
        source: str | int | None = None,
        source_key: str | int | None = None,
    ):
        self._rec_sha = context_sha
        # Convert int to str, keep None as None
        self._source = str(source) if isinstance(source, int) else source
        self._source_key = (
            str(source_key) if isinstance(source_key, int) else source_key
        )

    def read(self, point):
        readout = PuppetReadout()

        chain = point._chain_def()
        readout.def_sha = chain.end.sha.hexdigest()
        readout.rec_sha = self._rec_sha

        # Get source and source_key: PointReader params take precedence, then Covertop attributes, then None
        # Convert int to str, keep None as None
        if self._source is not None:
            readout.source = self._source
        elif hasattr(point, "source"):
            point_source = point.source
            readout.source = (
                str(point_source) if isinstance(point_source, int) else point_source
            )
        else:
            readout.source = None

        if self._source_key is not None:
            readout.source_key = self._source_key
        elif hasattr(point, "source_key"):
            point_source_key = point.source_key
            readout.source_key = (
                str(point_source_key)
                if isinstance(point_source_key, int)
                else point_source_key
            )
        else:
            readout.source_key = None
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
