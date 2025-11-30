# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

from bucket import AxisUtils, Covergroup, Coverpoint


# Level 1: Logical operations
class LogicalGroup(Covergroup):
    NAME = "logical"
    DESCRIPTION = "Logical operation coverage"

    def setup(self, ctx):
        self.add_coverpoint(BasicLogical())  # Small: ~110 buckets
        self.add_covergroup(LogicalAdvanced())  # Nested group


# Level 2: Advanced logical
class LogicalAdvanced(Covergroup):
    NAME = "logical_advanced"
    DESCRIPTION = "Advanced logical coverage"

    def setup(self, ctx):
        self.add_coverpoint(BitwiseOperations())  # Large: ~950 buckets
        self.add_covergroup(LogicalShifts())  # Level 3 nested


# Level 3: Logical shifts
class LogicalShifts(Covergroup):
    NAME = "logical_shifts"
    DESCRIPTION = "Logical shift coverage"

    def setup(self, ctx):
        self.add_coverpoint(ShiftOperations())  # Medium: ~340 buckets


# Small coverpoint: ~110 buckets (3 axes: 3, 5, 7 values)
class BasicLogical(Coverpoint):
    NAME = "basic_logical"
    DESCRIPTION = "Basic logical operations"
    TIER = 1
    TAGS = ["logical", "basic"]

    def setup(self, ctx):
        self.add_axis(
            name="operation",
            values=["AND", "OR", "XOR"],
            description="Logical operation",
        )
        self.add_axis(
            name="rd",
            values=ctx.riscv_data.registers[:5],
            description="Destination register",
            enable_other="Other",
        )
        self.add_axis(
            name="mask",
            values=AxisUtils.ranges(31, 7, min_val=0),
            description="Mask value ranges",
        )

        # Add target goal
        self.add_goal("AND_OP", "AND operations are common", target=55)

    def apply_goals(self, bucket, goals):
        if bucket.operation == "AND":
            return goals.AND_OP

    def sample(self, trace):
        if trace.category != "Logical":
            return
        operation = trace.instruction_type if trace.instruction_type else "AND"
        if operation not in ["AND", "OR", "XOR"]:
            return
        mask = trace.immediate if trace.immediate is not None else 0
        self.bucket.clear()
        self.bucket.set_axes(
            operation=operation,
            rd=trace.rd if trace.rd else "x0",
            mask=mask % 32,
        )
        self.bucket.hit()


# Large coverpoint: ~950 buckets (5 axes: 4, 5, 5, 4, 2 values)
class BitwiseOperations(Coverpoint):
    NAME = "bitwise_operations"
    DESCRIPTION = "Bitwise operation coverage"
    TIER = 3
    TAGS = ["logical", "bitwise"]

    def setup(self, ctx):
        self.add_axis(
            name="operation",
            values=["AND", "OR", "XOR", "NOT"],
            description="Bitwise operation",
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
            name="bit_position",
            values=AxisUtils.one_hot(4, include_zero=True),
            description="Bit position (one-hot)",
        )
        self.add_axis(
            name="result_bit",
            values=AxisUtils.enabled(),
            description="Result bit value",
        )

        # Add target goal
        self.add_goal("XOR_OP", "XOR operations need more coverage", target=475)

    def apply_goals(self, bucket, goals):
        if bucket.operation == "XOR":
            return goals.XOR_OP

    def sample(self, trace):
        if trace.category != "Logical":
            return
        operation = trace.instruction_type if trace.instruction_type else "AND"
        if operation not in ["AND", "OR", "XOR", "NOT"]:
            return
        bit_pos = (trace.immediate if trace.immediate is not None else 0) % 16
        result_bit = 1 if bit_pos % 2 == 0 else 0
        self.bucket.clear()
        self.bucket.set_axes(
            operation=operation,
            rs1=trace.rs1 if trace.rs1 else "x0",
            rs2=trace.rs2 if trace.rs2 else "x0",
            bit_position=1 << (bit_pos % 4) if bit_pos < 4 else 0,
            result_bit=result_bit,
        )
        self.bucket.hit()


# Medium coverpoint: ~340 buckets (4 axes: 4, 5, 5, 3 values)
class ShiftOperations(Coverpoint):
    NAME = "shift_operations"
    DESCRIPTION = "Shift operation coverage"
    TIER = 2
    TAGS = ["logical", "shift"]

    def setup(self, ctx):
        self.add_axis(
            name="shift_type",
            values=["SLL", "SRL", "SRA"],
            description="Shift type",
            enable_other="Other",
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
            description="Source register",
            enable_other="Other",
        )
        self.add_axis(
            name="shift_amount",
            values=AxisUtils.ranges(31, 3, min_val=0),
            description="Shift amount ranges",
            enable_other="Other",
        )

        # Add target goal for large shift amounts (needs more coverage)
        self.add_goal(
            "LARGE_SHIFT_AMOUNT", "Large shift amounts need more coverage", target=350
        )

    def apply_goals(self, bucket, goals):
        # Apply goal for shift amounts in the highest range
        if "28 -> 31" in bucket.shift_amount or "30 -> 31" in bucket.shift_amount:
            return goals.LARGE_SHIFT_AMOUNT

    def sample(self, trace):
        if trace.category != "Shift":
            return
        shift_type = trace.instruction_type if trace.instruction_type else "SLL"
        if shift_type not in ["SLL", "SRL", "SRA"]:
            shift_type = "Other"
        shift_amount = trace.immediate if trace.immediate is not None else 0
        # Values outside [0, 31] will be caught by enable_other automatically
        # Clamp > 31 to 31 to stay in range
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
