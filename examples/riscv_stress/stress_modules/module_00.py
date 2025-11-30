# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

from bucket import AxisUtils, Covergroup, Coverpoint


# Level 1: Top-level covergroup for instruction formats
class InstructionFormatGroup(Covergroup):
    NAME = "instruction_formats"
    DESCRIPTION = "Coverage for RISC-V instruction formats"

    def setup(self, ctx):
        self.add_covergroup(RTypeGroup())
        self.add_covergroup(ITypeGroup())
        self.add_covergroup(BranchTypeGroup())


# Level 2: R-type instructions
class RTypeGroup(Covergroup):
    NAME = "r_type"
    DESCRIPTION = "R-type instruction coverage"

    def setup(self, ctx):
        self.add_coverpoint(RTypeArithmetic())  # Small: ~100 buckets
        self.add_coverpoint(RTypeLogical())  # Medium: ~300 buckets
        self.add_covergroup(RTypeAdvanced())  # Nested group


# Level 3: Advanced R-type
class RTypeAdvanced(Covergroup):
    NAME = "r_type_advanced"
    DESCRIPTION = "Advanced R-type coverage"

    def setup(self, ctx):
        self.add_coverpoint(RTypeShift())  # Large: ~800 buckets


# Small coverpoint: ~100 buckets (3 axes: 5, 4, 5 values)
class RTypeArithmetic(Coverpoint):
    NAME = "r_type_arithmetic"
    DESCRIPTION = "R-type arithmetic operations"
    TIER = 1
    TAGS = ["arithmetic", "r-type"]

    def setup(self, ctx):
        self.add_axis(
            name="opcode",
            values=list(range(5)),
            description="Arithmetic opcodes",
        )
        self.add_axis(
            name="rd",
            values=ctx.riscv_data.registers[:4],
            description="Destination register",
            enable_other="Other",
        )
        self.add_axis(
            name="rs1",
            values=ctx.riscv_data.registers[:5],
            description="Source register 1",
            enable_other="Other",
        )

        # Add target goal for specific combinations
        self.add_goal("HIGH_PRIORITY", "High priority arithmetic ops", target=100)

    def apply_goals(self, bucket, goals):
        if bucket.opcode == "0" and bucket.rd in ["x0", "x1"]:
            return goals.HIGH_PRIORITY

    def sample(self, trace):
        if trace.format_type != "R-type" or trace.category != "Arithmetic":
            return
        self.bucket.clear()
        self.bucket.set_axes(
            opcode=trace.opcode % 5,
            rd=trace.rd if trace.rd else "x0",
            rs1=trace.rs1 if trace.rs1 else "x0",
        )
        self.bucket.hit()


# Medium coverpoint: ~300 buckets (4 axes: 6, 5, 5, 2 values)
class RTypeLogical(Coverpoint):
    NAME = "r_type_logical"
    DESCRIPTION = "R-type logical operations"
    TIER = 2
    TAGS = ["logical", "r-type"]

    def setup(self, ctx):
        self.add_axis(
            name="opcode",
            values=list(range(6)),
            description="Logical opcodes",
        )
        self.add_axis(
            name="rd",
            values=ctx.riscv_data.registers[:5],
            description="Destination register",
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
            values=ctx.riscv_data.registers[:2],
            description="Source register 2",
            enable_other="Other",
        )

        # Add target goal for x0 usage (should be rare)
        self.add_goal("ZERO_DEST", "Using x0 as destination should be rare", target=200)

    def apply_goals(self, bucket, goals):
        if bucket.rd == "x0":
            return goals.ZERO_DEST

    def sample(self, trace):
        if trace.format_type != "R-type" or trace.category != "Logical":
            return
        self.bucket.clear()
        self.bucket.set_axes(
            opcode=trace.opcode % 6,
            rd=trace.rd if trace.rd else "x0",
            rs1=trace.rs1 if trace.rs1 else "x0",
            rs2=trace.rs2 if trace.rs2 else "x0",
        )
        self.bucket.hit()


# Large coverpoint: ~800 buckets (4 axes: 5, 4, 5, 4 values)
class RTypeShift(Coverpoint):
    NAME = "r_type_shift"
    DESCRIPTION = "R-type shift operations"
    TIER = 3
    TAGS = ["shift", "r-type"]

    def setup(self, ctx):
        self.add_axis(
            name="shift_type",
            values=["SLL", "SRL", "SRA", "SLLI", "SRLI"],
            description="Shift operation type",
        )
        self.add_axis(
            name="rd",
            values=ctx.riscv_data.registers[:4],
            description="Destination register",
            enable_other="Other",
        )
        self.add_axis(
            name="rs1",
            values=ctx.riscv_data.registers[:5],
            description="Source register 1",
            enable_other="Other",
        )
        self.add_axis(
            name="shift_amount",
            values=AxisUtils.ranges(31, 4, min_val=0),
            description="Shift amount ranges",
            enable_other="Other",
        )

        # Add target goal
        self.add_goal(
            "LARGE_SHIFT", "Large shift amounts need more coverage", target=200
        )

    def apply_goals(self, bucket, goals):
        if "30 -> 31" in bucket.shift_amount or "28 -> 29" in bucket.shift_amount:
            return goals.LARGE_SHIFT

    def sample(self, trace):
        if trace.format_type != "R-type" or trace.category != "Shift":
            return
        shift_type = trace.instruction_type if trace.instruction_type else "SLL"
        if shift_type not in ["SLL", "SRL", "SRA", "SLLI", "SRLI"]:
            return
        shift_amount = trace.immediate if trace.immediate is not None else 0
        # Clamp to valid range [0, 31] - values outside will be caught by enable_other
        if shift_amount > 31:
            shift_amount = 31
        # Negative values will be handled by enable_other
        self.bucket.clear()
        self.bucket.set_axes(
            shift_type=shift_type,
            rd=trace.rd if trace.rd else "x0",
            rs1=trace.rs1 if trace.rs1 else "x0",
            shift_amount=shift_amount,
        )
        self.bucket.hit()


# Level 2: I-type instructions
class ITypeGroup(Covergroup):
    NAME = "i_type"
    DESCRIPTION = "I-type instruction coverage"

    def setup(self, ctx):
        self.add_coverpoint(ITypeLoad())  # Small: ~80 buckets
        self.add_coverpoint(ITypeImmediate())  # Medium: ~400 buckets


# Small coverpoint: ~80 buckets (3 axes: 4, 5, 4 values)
class ITypeLoad(Coverpoint):
    NAME = "i_type_load"
    DESCRIPTION = "I-type load operations"
    TIER = 1
    TAGS = ["load", "i-type"]

    def setup(self, ctx):
        self.add_axis(
            name="load_type",
            values=["LW", "LH", "LB", "LHU"],
            description="Load instruction type",
        )
        self.add_axis(
            name="rd",
            values=ctx.riscv_data.registers[:5],
            description="Destination register",
            enable_other="Other",
        )
        self.add_axis(
            name="rs1",
            values=ctx.riscv_data.registers[:4],
            description="Base register",
            enable_other="Other",
        )

        # Add ignore goal
        self.add_goal("IGNORE_X0", "Ignore loads to x0", ignore=True)

    def apply_goals(self, bucket, goals):
        if bucket.rd == "x0":
            return goals.IGNORE_X0

    def sample(self, trace):
        if trace.format_type != "I-type" or trace.category != "Load":
            return
        load_type = trace.instruction_type if trace.instruction_type else "LW"
        if load_type not in ["LW", "LH", "LB", "LHU"]:
            return
        self.bucket.clear()
        self.bucket.set_axes(
            load_type=load_type,
            rd=trace.rd if trace.rd else "x0",
            rs1=trace.rs1 if trace.rs1 else "x0",
        )
        self.bucket.hit()


# Medium coverpoint: ~400 buckets (4 axes: 5, 4, 5, 4 values)
class ITypeImmediate(Coverpoint):
    NAME = "i_type_immediate"
    DESCRIPTION = "I-type immediate operations"
    TIER = 2
    TAGS = ["immediate", "i-type"]

    def setup(self, ctx):
        self.add_axis(
            name="opcode",
            values=list(range(5)),
            description="Immediate opcodes",
        )
        self.add_axis(
            name="rd",
            values=ctx.riscv_data.registers[:4],
            description="Destination register",
            enable_other="Other",
        )
        self.add_axis(
            name="rs1",
            values=ctx.riscv_data.registers[:5],
            description="Source register 1",
            enable_other="Other",
        )
        self.add_axis(
            name="immediate",
            values=AxisUtils.ranges(4095, 4, min_val=0),
            description="Immediate value ranges",
            enable_other="Other",
        )

        # Add target goal
        self.add_goal("LARGE_IMM", "Large immediate values", target=150)

    def apply_goals(self, bucket, goals):
        if "3072 -> 4095" in bucket.immediate:
            return goals.LARGE_IMM

    def sample(self, trace):
        if trace.format_type != "I-type" and trace.immediate is not None:
            return
        self.bucket.clear()
        # Clamp immediate to valid range [0, 4095]
        imm_val = trace.immediate if trace.immediate is not None else 0
        if imm_val < 0 or imm_val > 4095:
            imm_val = "Other"
        self.bucket.set_axes(
            opcode=trace.opcode % 5,
            rd=trace.rd if trace.rd else "x0",
            rs1=trace.rs1 if trace.rs1 else "x0",
            immediate=imm_val,
        )
        self.bucket.hit()


# Level 2: Branch instructions
class BranchTypeGroup(Covergroup):
    NAME = "branch_type"
    DESCRIPTION = "Branch instruction coverage"

    def setup(self, ctx):
        self.add_coverpoint(BranchOperations())  # Medium: ~250 buckets
        self.add_covergroup(BranchAdvanced())  # Nested group


# Level 3: Advanced branch
class BranchAdvanced(Covergroup):
    NAME = "branch_advanced"
    DESCRIPTION = "Advanced branch coverage"

    def setup(self, ctx):
        self.add_coverpoint(BranchPrediction())  # Large: ~600 buckets


# Medium coverpoint: ~250 buckets (3 axes: 5, 5, 10 values)
class BranchOperations(Coverpoint):
    NAME = "branch_operations"
    DESCRIPTION = "Branch operation types"
    TIER = 2
    TAGS = ["branch", "control-flow"]

    def setup(self, ctx):
        self.add_axis(
            name="branch_type",
            values=["BEQ", "BNE", "BLT", "BGE", "BLTU"],
            description="Branch instruction type",
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
            values=ctx.riscv_data.registers[:10],
            description="Source register 2",
            enable_other="Other",
        )

        # Add ignore goal for x0 branch (not interesting)
        self.add_goal("ZERO_BRANCH", "Branching on x0 is not interesting", ignore=True)

    def apply_goals(self, bucket, goals):
        if bucket.rs1 == "x0" and bucket.rs2 == "x0":
            return goals.ZERO_BRANCH

    def sample(self, trace):
        if trace.format_type != "B-type" or trace.category != "Branch":
            return
        branch_type = trace.instruction_type if trace.instruction_type else "BEQ"
        if branch_type not in ["BEQ", "BNE", "BLT", "BGE", "BLTU"]:
            return
        self.bucket.clear()
        self.bucket.set_axes(
            branch_type=branch_type,
            rs1=trace.rs1 if trace.rs1 else "x0",
            rs2=trace.rs2 if trace.rs2 else "x0",
        )
        self.bucket.hit()


# Large coverpoint: ~600 buckets (4 axes: 5, 4, 5, 3 values)
class BranchPrediction(Coverpoint):
    NAME = "branch_prediction"
    DESCRIPTION = "Branch prediction coverage"
    TIER = 3
    TAGS = ["branch", "prediction"]

    def setup(self, ctx):
        self.add_axis(
            name="branch_type",
            values=["BEQ", "BNE", "BLT", "BGE", "BLTU"],
            description="Branch instruction type",
            enable_other="Other",
        )
        self.add_axis(
            name="outcome",
            values=ctx.riscv_data.branch_outcomes,
            description="Branch outcome",
        )
        self.add_axis(
            name="rs1",
            values=ctx.riscv_data.registers[:5],
            description="Source register 1",
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
            "MISPREDICT", "Mispredicted branches need more coverage", target=300
        )

    def apply_goals(self, bucket, goals):
        if bucket.outcome == "mispredicted":
            return goals.MISPREDICT

    def sample(self, trace):
        if trace.format_type != "B-type" or trace.branch_outcome is None:
            return
        branch_type = trace.instruction_type if trace.instruction_type else "BEQ"
        if branch_type not in ["BEQ", "BNE", "BLT", "BGE", "BLTU"]:
            return
        self.bucket.clear()
        self.bucket.set_axes(
            branch_type=branch_type,
            outcome=trace.branch_outcome,
            rs1=trace.rs1 if trace.rs1 else "x0",
            pipeline_stage=trace.pipeline_stage
            if trace.pipeline_stage is not None
            else 0,
        )
        self.bucket.hit()
