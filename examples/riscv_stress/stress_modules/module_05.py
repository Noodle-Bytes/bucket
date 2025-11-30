# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

from bucket import AxisUtils, Covergroup, Coverpoint


# Level 1: Control flow
class ControlFlowGroup(Covergroup):
    NAME = "control_flow"
    DESCRIPTION = "Control flow coverage"

    def setup(self, ctx):
        self.add_coverpoint(JumpOperations())  # Small: ~90 buckets
        self.add_covergroup(BranchControl())  # Nested group


# Level 2: Branch control
class BranchControl(Covergroup):
    NAME = "branch_control"
    DESCRIPTION = "Branch control coverage"

    def setup(self, ctx):
        self.add_coverpoint(BranchTargets())  # Large: ~1100 buckets
        self.add_covergroup(BranchPrediction())  # Level 3 nested


# Level 3: Branch prediction
class BranchPrediction(Covergroup):
    NAME = "branch_prediction"
    DESCRIPTION = "Branch prediction details"

    def setup(self, ctx):
        self.add_coverpoint(PredictionAccuracy())  # Medium: ~380 buckets


# Small coverpoint: ~90 buckets (3 axes: 3, 5, 6 values)
class JumpOperations(Coverpoint):
    NAME = "jump_operations"
    DESCRIPTION = "Jump operation coverage"
    TIER = 1
    TAGS = ["jump", "control-flow"]

    def setup(self, ctx):
        self.add_axis(
            name="jump_type",
            values=["JAL", "JALR"],
            description="Jump instruction type",
            enable_other="Other",
        )
        self.add_axis(
            name="rd",
            values=ctx.riscv_data.registers[:5],
            description="Return address register",
            enable_other="Other",
        )
        self.add_axis(
            name="target",
            values=AxisUtils.ranges(1023, 6, min_val=0),
            description="Jump target ranges",
        )

        # Add target goal
        self.add_goal("JAL_JUMP", "JAL jumps are common", target=60)

    def apply_goals(self, bucket, goals):
        if bucket.jump_type == "JAL":
            return goals.JAL_JUMP

    def sample(self, trace):
        if trace.category != "Jump":
            return
        jump_type = trace.instruction_type if trace.instruction_type else "JAL"
        if jump_type not in ["JAL", "JALR"]:
            jump_type = "Other"
        self.bucket.clear()
        self.bucket.set_axes(
            jump_type=jump_type,
            rd=trace.rd if trace.rd else "x1",
            target=(trace.immediate if trace.immediate is not None else 0) % 1024,
        )
        self.bucket.hit()


# Large coverpoint: ~1100 buckets (5 axes: 4, 5, 5, 4, 2 values)
class BranchTargets(Coverpoint):
    NAME = "branch_targets"
    DESCRIPTION = "Branch target coverage"
    TIER = 3
    TAGS = ["branch", "targets"]

    def setup(self, ctx):
        self.add_axis(
            name="branch_type",
            values=["BEQ", "BNE", "BLT", "BGE"],
            description="Branch type",
            enable_other="Other",
        )
        self.add_axis(
            name="rs1",
            values=ctx.riscv_data.registers[:5],
            description="Source register 1",
            enable_other="Other",
        )
        self.add_axis(
            name="rs2",
            values=ctx.riscv_data.registers[:5],
            description="Source register 2",
            enable_other="Other",
        )
        self.add_axis(
            name="target_offset",
            values=AxisUtils.ranges(
                2047, 4, min_val=-1024, separate_min=True, separate_max=True
            ),
            description="Branch target offset",
        )
        self.add_axis(
            name="taken",
            values=AxisUtils.polarity(),
            description="Branch taken (polarity)",
        )

        # Add target goal
        self.add_goal("FAR_BRANCH", "Far branches need more coverage", target=550)

    def apply_goals(self, bucket, goals):
        if "1023" in bucket.target_offset or "-1024" in bucket.target_offset:
            return goals.FAR_BRANCH

    def sample(self, trace):
        if trace.format_type != "B-type":
            return
        branch_type = trace.instruction_type if trace.instruction_type else "BEQ"
        if branch_type not in ["BEQ", "BNE", "BLT", "BGE"]:
            return
        taken = 1 if trace.branch_outcome == "taken" else 0
        offset = trace.immediate if trace.immediate is not None else 0
        # Clamp to range
        if offset > 1023:
            offset = 1023
        elif offset < -1024:
            offset = -1024
        self.bucket.clear()
        self.bucket.set_axes(
            branch_type=branch_type,
            rs1=trace.rs1 if trace.rs1 else "x0",
            rs2=trace.rs2 if trace.rs2 else "x0",
            target_offset=offset,
            taken=taken,
        )
        self.bucket.hit()


# Medium coverpoint: ~380 buckets (4 axes: 4, 5, 5, 3 values)
class PredictionAccuracy(Coverpoint):
    NAME = "prediction_accuracy"
    DESCRIPTION = "Branch prediction accuracy coverage"
    TIER = 2
    TAGS = ["branch", "prediction"]

    def setup(self, ctx):
        self.add_axis(
            name="prediction",
            values=["taken", "not_taken"],
            description="Prediction",
        )
        self.add_axis(
            name="actual",
            values=["taken", "not_taken"],
            description="Actual outcome",
        )
        self.add_axis(
            name="branch_type",
            values=ctx.riscv_data.instruction_types[:5],
            description="Branch type",
            enable_other="Other",
        )
        self.add_axis(
            name="confidence",
            values=["high", "medium", "low"],
            description="Prediction confidence",
        )

        # Add target goal for prediction accuracy (needs more coverage)
        self.add_goal(
            "PREDICTION_ACCURACY", "Prediction accuracy needs more coverage", target=400
        )

    def apply_goals(self, bucket, goals):
        # Apply goal for mispredicted branches
        if bucket.prediction != bucket.actual:
            return goals.PREDICTION_ACCURACY

    def sample(self, trace):
        if trace.branch_outcome is None:
            return
        prediction = (
            "taken"
            if trace.branch_outcome in ["taken", "mispredicted"]
            else "not_taken"
        )
        actual = "taken" if trace.branch_outcome == "taken" else "not_taken"
        confidence = "high" if trace.branch_outcome != "mispredicted" else "low"
        self.bucket.clear()
        self.bucket.set_axes(
            prediction=prediction,
            actual=actual,
            branch_type=trace.instruction_type if trace.instruction_type else "BEQ",
            confidence=confidence,
        )
        self.bucket.hit()
