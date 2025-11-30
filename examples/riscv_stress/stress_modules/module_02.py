# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

from bucket import AxisUtils, Covergroup, Coverpoint


# Level 1: Pipeline coverage
class PipelineGroup(Covergroup):
    NAME = "pipeline"
    DESCRIPTION = "Pipeline stage coverage"

    def setup(self, ctx):
        self.add_coverpoint(PipelineStages())  # Small: ~150 buckets
        self.add_covergroup(PipelineHazards())  # Nested group
        self.add_coverpoint(PipelineFlush())  # Medium: ~280 buckets


# Level 2: Pipeline hazards
class PipelineHazards(Covergroup):
    NAME = "pipeline_hazards"
    DESCRIPTION = "Pipeline hazard coverage"

    def setup(self, ctx):
        self.add_coverpoint(DataHazards())  # Large: ~750 buckets
        self.add_coverpoint(ControlHazards())  # Medium: ~320 buckets


# Small coverpoint: ~150 buckets (3 axes: 5, 5, 6 values)
class PipelineStages(Coverpoint):
    NAME = "pipeline_stages"
    DESCRIPTION = "Pipeline stage coverage"
    TIER = 1
    TAGS = ["pipeline", "stages"]

    def setup(self, ctx):
        self.add_axis(
            name="stage",
            values=ctx.riscv_data.pipeline_stages,
            description="Pipeline stage",
        )
        self.add_axis(
            name="execution_state",
            values=ctx.riscv_data.execution_states[:5],
            description="Execution state",
            enable_other="Other",
        )
        self.add_axis(
            name="instruction_type",
            values=ctx.riscv_data.instruction_types[:6],
            description="Instruction type",
            enable_other="Other",
        )

        # Add target goal
        self.add_goal("EXECUTE_STAGE", "Execute stage is critical", target=100)

    def apply_goals(self, bucket, goals):
        if bucket.stage == "2" and bucket.execution_state == "execute":
            return goals.EXECUTE_STAGE

    def sample(self, trace):
        if trace.pipeline_stage is None:
            return
        # Validate execution_state
        exec_state = trace.execution_state if trace.execution_state else "idle"
        if exec_state not in ["idle", "fetch", "decode", "execute", "memory"]:
            exec_state = "Other"
        # Validate instruction_type
        inst_type = trace.instruction_type if trace.instruction_type else "ADD"
        valid_types = ["ADD", "SUB", "AND", "OR", "XOR", "SLT"]
        if inst_type not in valid_types:
            inst_type = "Other"
        self.bucket.clear()
        self.bucket.set_axes(
            stage=str(trace.pipeline_stage),
            execution_state=exec_state,
            instruction_type=inst_type,
        )
        self.bucket.hit()


# Large coverpoint: ~750 buckets (5 axes: 5, 3, 5, 5, 2 values)
class DataHazards(Coverpoint):
    NAME = "data_hazards"
    DESCRIPTION = "Data hazard coverage"
    TIER = 3
    TAGS = ["pipeline", "hazards"]

    def setup(self, ctx):
        self.add_axis(
            name="hazard_type",
            values=["RAW", "WAR", "WAW", "structural", "none"],
            description="Data hazard type",
        )
        self.add_axis(
            name="rs1",
            values=ctx.riscv_data.registers[:3],
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
            name="rd",
            values=ctx.riscv_data.registers[:5],
            description="Destination register",
            enable_other="Other",
        )
        self.add_axis(
            name="stall_cycles",
            values=AxisUtils.one_hot(2, include_zero=True),
            description="Stall cycles (one-hot)",
        )

        # Add target goal
        self.add_goal("RAW_HAZARD", "RAW hazards need more coverage", target=400)

    def apply_goals(self, bucket, goals):
        if bucket.hazard_type == "RAW":
            return goals.RAW_HAZARD

    def sample(self, trace):
        # Simulate data hazard detection
        hazard_type = "none"
        if trace.rs1 and trace.rd:
            if trace.rs1 == trace.rd:
                hazard_type = "RAW"
        stall_cycles = 0 if hazard_type == "none" else 1
        self.bucket.clear()
        self.bucket.set_axes(
            hazard_type=hazard_type,
            rs1=trace.rs1 if trace.rs1 else "x0",
            rs2=trace.rs2 if trace.rs2 else "x0",
            rd=trace.rd if trace.rd else "x0",
            stall_cycles=stall_cycles,
        )
        self.bucket.hit()


# Medium coverpoint: ~320 buckets (4 axes: 4, 5, 4, 4 values)
class ControlHazards(Coverpoint):
    NAME = "control_hazards"
    DESCRIPTION = "Control hazard coverage"
    TIER = 2
    TAGS = ["pipeline", "control"]

    def setup(self, ctx):
        self.add_axis(
            name="branch_outcome",
            values=ctx.riscv_data.branch_outcomes,
            description="Branch outcome",
        )
        self.add_axis(
            name="pipeline_stage",
            values=ctx.riscv_data.pipeline_stages[:5],
            description="Pipeline stage",
            enable_other="Other",
        )
        self.add_axis(
            name="flush_depth",
            values=AxisUtils.ranges(4, 4, min_val=0),
            description="Pipeline flush depth",
        )
        self.add_axis(
            name="instruction_type",
            values=ctx.riscv_data.instruction_types[:4],
            description="Instruction type",
            enable_other="Other",
        )

        # Add ignore goal
        self.add_goal("IGNORE_NO_FLUSH", "Ignore non-flush cases", ignore=True)

    def apply_goals(self, bucket, goals):
        if bucket.flush_depth == "0":
            return goals.IGNORE_NO_FLUSH

    def sample(self, trace):
        if trace.branch_outcome is None:
            return
        flush_depth = 0 if trace.branch_outcome == "not_taken" else 2
        self.bucket.clear()
        self.bucket.set_axes(
            branch_outcome=trace.branch_outcome,
            pipeline_stage=str(trace.pipeline_stage)
            if trace.pipeline_stage is not None and trace.pipeline_stage < 5
            else "Other",
            flush_depth=flush_depth,
            instruction_type=trace.instruction_type
            if trace.instruction_type
            else "BEQ",
        )
        self.bucket.hit()


# Medium coverpoint: ~280 buckets (4 axes: 5, 4, 5, 3 values)
class PipelineFlush(Coverpoint):
    NAME = "pipeline_flush"
    DESCRIPTION = "Pipeline flush coverage"
    TIER = 2
    TAGS = ["pipeline", "flush"]

    def setup(self, ctx):
        self.add_axis(
            name="flush_reason",
            values=["branch_mispredict", "exception", "interrupt", "none", "reset"],
            description="Flush reason",
        )
        self.add_axis(
            name="flush_depth",
            values=AxisUtils.ranges(4, 4, min_val=0),
            description="Pipeline flush depth",
        )
        self.add_axis(
            name="pipeline_stage",
            values=ctx.riscv_data.pipeline_stages[:5],
            description="Pipeline stage",
            enable_other="Other",
        )
        self.add_axis(
            name="privilege",
            values=ctx.riscv_data.privilege_levels,
            description="Privilege level",
            enable_other="Other",
        )

        # Add target goal for reset flush (needs more coverage)
        self.add_goal("RESET_FLUSH", "Reset flush needs more coverage", target=250)

    def apply_goals(self, bucket, goals):
        if bucket.flush_reason == "reset":
            return goals.RESET_FLUSH

    def sample(self, trace):
        flush_reason = "none"
        if trace.exception_type and trace.exception_type != "none":
            flush_reason = "exception"
        elif trace.branch_outcome == "mispredicted":
            flush_reason = "branch_mispredict"
        self.bucket.clear()
        self.bucket.set_axes(
            flush_reason=flush_reason,
            flush_depth=2 if flush_reason != "none" else 0,
            pipeline_stage=str(trace.pipeline_stage)
            if trace.pipeline_stage is not None and trace.pipeline_stage < 5
            else "Other",
            privilege=trace.privilege_level if trace.privilege_level else "user",
        )
        self.bucket.hit()
