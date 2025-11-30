# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

from bucket import AxisUtils, Covergroup, Coverpoint


# Level 1: Arithmetic operations
class ArithmeticGroup(Covergroup):
    NAME = "arithmetic"
    DESCRIPTION = "Arithmetic operation coverage"

    def setup(self, ctx):
        self.add_coverpoint(BasicArithmetic())  # Small: ~140 buckets
        self.add_covergroup(AdvancedArithmetic())  # Nested group


# Level 2: Advanced arithmetic
class AdvancedArithmetic(Covergroup):
    NAME = "advanced_arithmetic"
    DESCRIPTION = "Advanced arithmetic coverage"

    def setup(self, ctx):
        self.add_coverpoint(ArithmeticOverflow())  # Large: ~850 buckets
        self.add_coverpoint(ArithmeticFlags())  # Medium: ~360 buckets


# Small coverpoint: ~140 buckets (3 axes: 4, 5, 7 values)
class BasicArithmetic(Coverpoint):
    NAME = "basic_arithmetic"
    DESCRIPTION = "Basic arithmetic operations"
    TIER = 1
    TAGS = ["arithmetic", "basic"]

    def setup(self, ctx):
        self.add_axis(
            name="operation",
            values=["ADD", "SUB", "MUL", "DIV"],
            description="Arithmetic operation",
            enable_other="Other",
        )
        self.add_axis(
            name="rd",
            values=ctx.riscv_data.registers[:5],
            description="Destination register",
            enable_other="Other",
        )
        self.add_axis(
            name="operand_range",
            values=AxisUtils.ranges(63, 7, min_val=0),
            description="Operand value ranges",
        )

        # Add target goal
        self.add_goal("ADD_OP", "ADD operations are common", target=70)

    def apply_goals(self, bucket, goals):
        if bucket.operation == "ADD":
            return goals.ADD_OP

    def sample(self, trace):
        if trace.category != "Arithmetic":
            return
        operation = trace.instruction_type if trace.instruction_type else "ADD"
        if operation not in ["ADD", "SUB", "MUL", "DIV"]:
            return
        operand = trace.immediate if trace.immediate is not None else 0
        self.bucket.clear()
        self.bucket.set_axes(
            operation=operation,
            rd=trace.rd if trace.rd else "x0",
            operand_range=operand % 64,
        )
        self.bucket.hit()


# Large coverpoint: ~850 buckets (5 axes: 4, 5, 5, 4, 2 values)
class ArithmeticOverflow(Coverpoint):
    NAME = "arithmetic_overflow"
    DESCRIPTION = "Arithmetic overflow coverage"
    TIER = 3
    TAGS = ["arithmetic", "overflow"]

    def setup(self, ctx):
        self.add_axis(
            name="operation",
            values=["ADD", "SUB", "MUL"],
            description="Arithmetic operation",
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
            name="overflow",
            values=AxisUtils.one_hot(2, include_zero=True),
            description="Overflow flag (one-hot)",
        )
        self.add_axis(
            name="sign",
            values=AxisUtils.polarity(),
            description="Result sign (polarity)",
        )

        # Add target goal
        self.add_goal("OVERFLOW_CASE", "Overflow cases need more coverage", target=425)

    def apply_goals(self, bucket, goals):
        if bucket.overflow != "0b0":
            return goals.OVERFLOW_CASE

    def sample(self, trace):
        if trace.category != "Arithmetic":
            return
        operation = trace.instruction_type if trace.instruction_type else "ADD"
        if operation not in ["ADD", "SUB", "MUL"]:
            operation = "Other"
        # Simulate overflow detection
        overflow = 0  # Would be calculated in real implementation
        sign = 0  # Would be calculated in real implementation
        self.bucket.clear()
        self.bucket.set_axes(
            operation=operation,
            rs1=trace.rs1 if trace.rs1 else "x0",
            rs2=trace.rs2 if trace.rs2 else "x0",
            overflow=overflow,
            sign=sign,
        )
        self.bucket.hit()


# Medium coverpoint: ~360 buckets (4 axes: 5, 4, 5, 3 values)
class ArithmeticFlags(Coverpoint):
    NAME = "arithmetic_flags"
    DESCRIPTION = "Arithmetic flag coverage"
    TIER = 2
    TAGS = ["arithmetic", "flags"]

    def setup(self, ctx):
        self.add_axis(
            name="operation",
            values=ctx.riscv_data.instruction_types[:5],
            description="Arithmetic operation",
            enable_other="Other",
        )
        self.add_axis(
            name="zero_flag",
            values=AxisUtils.enabled(),
            description="Zero flag",
        )
        self.add_axis(
            name="negative_flag",
            values=AxisUtils.polarity(),
            description="Negative flag",
        )
        self.add_axis(
            name="carry_flag",
            values=AxisUtils.enabled(),
            description="Carry flag",
        )

        # Add ignore goal
        self.add_goal("IGNORE_NO_FLAGS", "Ignore cases with no flags", ignore=True)

    def apply_goals(self, bucket, goals):
        if bucket.zero_flag == "Disabled" and bucket.carry_flag == "Disabled":
            return goals.IGNORE_NO_FLAGS

    def sample(self, trace):
        if trace.category != "Arithmetic":
            return
        # Simulate flag generation
        zero_flag = 1 if trace.immediate == 0 else 0
        negative_flag = 1 if trace.immediate and trace.immediate < 0 else 0
        carry_flag = 0  # Would be calculated in real implementation
        self.bucket.clear()
        self.bucket.set_axes(
            operation=trace.instruction_type if trace.instruction_type else "ADD",
            zero_flag=zero_flag,
            negative_flag=negative_flag,
            carry_flag=carry_flag,
        )
        self.bucket.hit()
