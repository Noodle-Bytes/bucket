# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

from bucket import Covergroup, Coverpoint


# Level 1: Exception handling
class ExceptionGroup(Covergroup):
    NAME = "exceptions"
    DESCRIPTION = "Exception handling coverage"

    def setup(self, ctx):
        self.add_coverpoint(ExceptionTypes())  # Small: ~100 buckets
        self.add_covergroup(ExceptionHandling())  # Nested group


# Level 2: Exception handling
class ExceptionHandling(Covergroup):
    NAME = "exception_handling"
    DESCRIPTION = "Exception handling details"

    def setup(self, ctx):
        self.add_coverpoint(ExceptionContext())  # Large: ~900 buckets
        self.add_covergroup(ExceptionRecovery())  # Level 3 nested


# Level 3: Exception recovery
class ExceptionRecovery(Covergroup):
    NAME = "exception_recovery"
    DESCRIPTION = "Exception recovery coverage"

    def setup(self, ctx):
        self.add_coverpoint(RecoveryPaths())  # Medium: ~300 buckets


# Small coverpoint: ~100 buckets (3 axes: 5, 4, 5 values)
class ExceptionTypes(Coverpoint):
    NAME = "exception_types"
    DESCRIPTION = "Exception type coverage"
    TIER = 1
    TAGS = ["exception", "error"]

    def setup(self, ctx):
        self.add_axis(
            name="exception_type",
            values=ctx.riscv_data.exception_types,
            description="Exception type",
        )
        self.add_axis(
            name="privilege",
            values=ctx.riscv_data.privilege_levels,
            description="Privilege level",
            enable_other="Other",
        )
        self.add_axis(
            name="instruction_type",
            values=ctx.riscv_data.instruction_types[:5],
            description="Instruction type",
            enable_other="Other",
        )

        # Add target goal
        self.add_goal("ILLEGAL_INSTR", "Illegal instructions need coverage", target=80)

    def apply_goals(self, bucket, goals):
        if bucket.exception_type == "illegal_instruction":
            return goals.ILLEGAL_INSTR

    def sample(self, trace):
        if trace.exception_type is None or trace.exception_type == "none":
            return
        self.bucket.clear()
        self.bucket.set_axes(
            exception_type=trace.exception_type,
            privilege=trace.privilege_level if trace.privilege_level else "user",
            instruction_type=trace.instruction_type
            if trace.instruction_type
            else "ADD",
        )
        self.bucket.hit()


# Large coverpoint: ~900 buckets (5 axes: 5, 4, 5, 3, 3 values)
class ExceptionContext(Coverpoint):
    NAME = "exception_context"
    DESCRIPTION = "Exception context coverage"
    TIER = 3
    TAGS = ["exception", "context"]

    def setup(self, ctx):
        self.add_axis(
            name="exception_type",
            values=ctx.riscv_data.exception_types,
            description="Exception type",
        )
        self.add_axis(
            name="privilege",
            values=ctx.riscv_data.privilege_levels,
            description="Privilege level",
            enable_other="Other",
        )
        self.add_axis(
            name="pipeline_stage",
            values=ctx.riscv_data.pipeline_stages[:5],
            description="Pipeline stage",
            enable_other="Other",
        )
        self.add_axis(
            name="execution_state",
            values=ctx.riscv_data.execution_states[:3],
            description="Execution state",
            enable_other="Other",
        )
        self.add_axis(
            name="instruction_type",
            values=ctx.riscv_data.instruction_types[:3],
            description="Instruction type",
            enable_other="Other",
        )

        # Add ignore goal for invalid exception state (not interesting)
        self.add_goal(
            "INVALID_EXCEPTION", "Invalid exception state combination", ignore=True
        )

    def apply_goals(self, bucket, goals):
        if bucket.exception_type == "none" and bucket.execution_state == "exception":
            return goals.INVALID_EXCEPTION

    def sample(self, trace):
        if trace.exception_type is None:
            return
        self.bucket.clear()
        self.bucket.set_axes(
            exception_type=trace.exception_type,
            privilege=trace.privilege_level if trace.privilege_level else "user",
            pipeline_stage=str(trace.pipeline_stage)
            if trace.pipeline_stage is not None and trace.pipeline_stage < 5
            else "Other",
            execution_state=trace.execution_state if trace.execution_state else "idle",
            instruction_type=trace.instruction_type
            if trace.instruction_type
            else "ADD",
        )
        self.bucket.hit()


# Medium coverpoint: ~300 buckets (4 axes: 5, 4, 5, 3 values)
class RecoveryPaths(Coverpoint):
    NAME = "recovery_paths"
    DESCRIPTION = "Exception recovery path coverage"
    TIER = 2
    TAGS = ["exception", "recovery"]

    def setup(self, ctx):
        self.add_axis(
            name="exception_type",
            values=ctx.riscv_data.exception_types,
            description="Exception type",
        )
        self.add_axis(
            name="recovery_type",
            values=["retry", "skip", "handler", "abort"],
            description="Recovery type",
        )
        self.add_axis(
            name="privilege",
            values=ctx.riscv_data.privilege_levels,
            description="Privilege level",
            enable_other="Other",
        )
        self.add_axis(
            name="pipeline_stage",
            values=ctx.riscv_data.pipeline_stages[:3],
            description="Pipeline stage",
            enable_other="Other",
        )

        # Add target goal
        self.add_goal(
            "HANDLER_RECOVERY", "Handler recovery needs more coverage", target=200
        )

    def apply_goals(self, bucket, goals):
        if bucket.recovery_type == "handler":
            return goals.HANDLER_RECOVERY

    def sample(self, trace):
        if trace.exception_type is None or trace.exception_type == "none":
            return
        recovery_type = "handler" if trace.exception_type != "none" else "skip"
        self.bucket.clear()
        self.bucket.set_axes(
            exception_type=trace.exception_type,
            recovery_type=recovery_type,
            privilege=trace.privilege_level if trace.privilege_level else "user",
            pipeline_stage=str(trace.pipeline_stage)
            if trace.pipeline_stage is not None and trace.pipeline_stage < 5
            else "Other",
        )
        self.bucket.hit()
