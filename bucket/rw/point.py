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
        self, context_sha, test_name: str | None = None, seed: str | None = None
    ):
        self._rec_sha = context_sha
        self._test_name = test_name
        self._seed = seed

    def read(self, point):
        readout = PuppetReadout()

        chain = point._chain_def()
        readout.def_sha = chain.end.sha.hexdigest()
        readout.rec_sha = self._rec_sha

        # Get test_name and seed: PointReader params take precedence, then Covertop attributes, then None
        if self._test_name is not None:
            readout.test_name = self._test_name
        elif hasattr(point, "test_name"):
            readout.test_name = point.test_name
        else:
            readout.test_name = None

        if self._seed is not None:
            readout.seed = self._seed
        elif hasattr(point, "seed"):
            readout.seed = point.seed
        else:
            readout.seed = None
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
