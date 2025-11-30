# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

from bucket import AxisUtils, Covergroup, Coverpoint


# Level 1: Register file
class RegisterFileGroup(Covergroup):
    NAME = "register_file"
    DESCRIPTION = "Register file coverage"

    def setup(self, ctx):
        self.add_coverpoint(RegisterAccess())  # Small: ~180 buckets
        self.add_covergroup(RegisterHazards())  # Nested group
        self.add_coverpoint(RegisterWriteback())  # Medium: ~420 buckets


# Level 2: Register hazards
class RegisterHazards(Covergroup):
    NAME = "register_hazards"
    DESCRIPTION = "Register hazard coverage"

    def setup(self, ctx):
        self.add_coverpoint(RegisterDependencies())  # Large: ~1200 buckets


# Small coverpoint: ~180 buckets (3 axes: 6, 5, 6 values)
class RegisterAccess(Coverpoint):
    NAME = "register_access"
    DESCRIPTION = "Register access coverage"
    TIER = 1
    TAGS = ["register", "access"]

    def setup(self, ctx):
        self.add_axis(
            name="register",
            values=ctx.riscv_data.registers[:6],
            description="Register accessed",
            enable_other="Other",
        )
        self.add_axis(
            name="access_type",
            values=["read", "write", "read_write"],
            description="Access type",
        )
        self.add_axis(
            name="instruction_type",
            values=ctx.riscv_data.instruction_types[:6],
            description="Instruction type",
            enable_other="Other",
        )

        # Add target goal
        self.add_goal("X0_ACCESS", "x0 access is special", target=50)

    def apply_goals(self, bucket, goals):
        if bucket.register == "x0":
            return goals.X0_ACCESS

    def sample(self, trace):
        access_type = "read"
        if trace.rd:
            if trace.rs1 or trace.rs2:
                access_type = "read_write"
            else:
                access_type = "write"
        elif trace.rs1 or trace.rs2:
            access_type = "read"
        reg = trace.rd if trace.rd else (trace.rs1 if trace.rs1 else "x0")
        self.bucket.clear()
        self.bucket.set_axes(
            register=reg,
            access_type=access_type,
            instruction_type=trace.instruction_type
            if trace.instruction_type
            else "ADD",
        )
        self.bucket.hit()


# Large coverpoint: ~1200 buckets (5 axes: 5, 4, 5, 4, 3 values)
class RegisterDependencies(Coverpoint):
    NAME = "register_dependencies"
    DESCRIPTION = "Register dependency coverage"
    TIER = 3
    TAGS = ["register", "dependencies"]

    def setup(self, ctx):
        self.add_axis(
            name="rd",
            values=ctx.riscv_data.registers[:5],
            description="Destination register",
            enable_other="Other",
        )
        self.add_axis(
            name="rs1",
            values=ctx.riscv_data.registers[:4],
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
            name="dependency_type",
            values=["RAW", "WAR", "WAW", "none"],
            description="Dependency type",
        )
        self.add_axis(
            name="stall_cycles",
            values=AxisUtils.msb(2, include_max=True),
            description="Stall cycles (MSB)",
        )

        # Add target goal
        self.add_goal("RAW_DEP", "RAW dependencies need more coverage", target=600)

    def apply_goals(self, bucket, goals):
        if bucket.dependency_type == "RAW":
            return goals.RAW_DEP

    def sample(self, trace):
        dependency_type = "none"
        if trace.rd and trace.rs1 and trace.rd == trace.rs1:
            dependency_type = "RAW"
        elif trace.rd and trace.rs2 and trace.rd == trace.rs2:
            dependency_type = "RAW"
        stall_cycles = 1 if dependency_type != "none" else 0
        self.bucket.clear()
        self.bucket.set_axes(
            rd=trace.rd if trace.rd else "x0",
            rs1=trace.rs1 if trace.rs1 else "x0",
            rs2=trace.rs2 if trace.rs2 else "x0",
            dependency_type=dependency_type,
            stall_cycles=stall_cycles,
        )
        self.bucket.hit()


# Medium coverpoint: ~420 buckets (4 axes: 5, 4, 5, 3 values)
class RegisterWriteback(Coverpoint):
    NAME = "register_writeback"
    DESCRIPTION = "Register writeback coverage"
    TIER = 2
    TAGS = ["register", "writeback"]

    def setup(self, ctx):
        self.add_axis(
            name="rd",
            values=ctx.riscv_data.registers[:5],
            description="Destination register",
            enable_other="Other",
        )
        self.add_axis(
            name="writeback_stage",
            values=ctx.riscv_data.pipeline_stages[:4],
            description="Writeback stage",
            enable_other="Other",
        )
        self.add_axis(
            name="instruction_type",
            values=ctx.riscv_data.instruction_types[:5],
            description="Instruction type",
            enable_other="Other",
        )
        self.add_axis(
            name="data_size",
            values=ctx.riscv_data.data_sizes[:3],
            description="Data size",
            enable_other="Other",
        )

        # Add ignore goal
        self.add_goal("IGNORE_X0", "Ignore writeback to x0", ignore=True)

    def apply_goals(self, bucket, goals):
        if bucket.rd == "x0":
            return goals.IGNORE_X0

    def sample(self, trace):
        if not trace.rd:
            return
        self.bucket.clear()
        self.bucket.set_axes(
            rd=trace.rd,
            writeback_stage=str(
                trace.pipeline_stage
                if trace.pipeline_stage is not None and trace.pipeline_stage < 4
                else "Other"
            ),
            instruction_type=trace.instruction_type
            if trace.instruction_type
            else "ADD",
            data_size=trace.data_size if trace.data_size else 32,
        )
        self.bucket.hit()
