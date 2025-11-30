# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

from bucket import AxisUtils, Covergroup, Coverpoint


# Level 1: Compare operations
class CompareGroup(Covergroup):
    NAME = "compare"
    DESCRIPTION = "Compare operation coverage"

    def setup(self, ctx):
        self.add_coverpoint(CompareOperations())  # Small: ~160 buckets
        self.add_covergroup(CompareAdvanced())  # Nested group


# Level 2: Advanced compare
class CompareAdvanced(Covergroup):
    NAME = "compare_advanced"
    DESCRIPTION = "Advanced compare coverage"

    def setup(self, ctx):
        self.add_coverpoint(CompareResults())  # Large: ~700 buckets
        self.add_covergroup(CompareFlags())  # Level 3 nested


# Level 3: Compare flags
class CompareFlags(Covergroup):
    NAME = "compare_flags"
    DESCRIPTION = "Compare flag coverage"

    def setup(self, ctx):
        self.add_coverpoint(FlagGeneration())  # Medium: ~270 buckets


# Small coverpoint: ~160 buckets (3 axes: 4, 5, 8 values)
class CompareOperations(Coverpoint):
    NAME = "compare_operations"
    DESCRIPTION = "Compare operation coverage"
    TIER = 1
    TAGS = ["compare", "basic"]

    def setup(self, ctx):
        self.add_axis(
            name="compare_type",
            values=["SLT", "SLTU", "EQ", "NE"],
            description="Compare type",
            enable_other="Other",
        )
        self.add_axis(
            name="rs1",
            values=ctx.riscv_data.registers[:5],
            description="Source register 1",
            enable_other="Other",
        )
        self.add_axis(
            name="operand_range",
            values=AxisUtils.ranges(
                127, 8, min_val=-64, separate_min=True, separate_max=True
            ),
            description="Operand value ranges",
        )

        # Add target goal
        self.add_goal("SLT_COMPARE", "SLT compares are common", target=80)

    def apply_goals(self, bucket, goals):
        if bucket.compare_type == "SLT":
            return goals.SLT_COMPARE

    def sample(self, trace):
        if trace.category != "Compare":
            return
        compare_type = trace.instruction_type if trace.instruction_type else "SLT"
        if compare_type not in ["SLT", "SLTU", "EQ", "NE"]:
            return
        operand = trace.immediate if trace.immediate is not None else 0
        # Clamp to range
        if operand > 127:
            operand = 127
        elif operand < -64:
            operand = -64
        self.bucket.clear()
        self.bucket.set_axes(
            compare_type=compare_type,
            rs1=trace.rs1 if trace.rs1 else "x0",
            operand_range=operand,
        )
        self.bucket.hit()


# Large coverpoint: ~700 buckets (5 axes: 4, 5, 5, 4, 2 values)
class CompareResults(Coverpoint):
    NAME = "compare_results"
    DESCRIPTION = "Compare result coverage"
    TIER = 3
    TAGS = ["compare", "results"]

    def setup(self, ctx):
        self.add_axis(
            name="compare_type",
            values=["SLT", "SLTU", "EQ", "NE"],
            description="Compare type",
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
            name="result",
            values=AxisUtils.enabled(),
            description="Compare result",
        )
        self.add_axis(
            name="zero_result",
            values=AxisUtils.polarity(),
            description="Zero result (polarity)",
        )

        # Add target goal
        self.add_goal("TRUE_RESULT", "True results need more coverage", target=350)

    def apply_goals(self, bucket, goals):
        if bucket.result == "Enabled":
            return goals.TRUE_RESULT

    def sample(self, trace):
        if trace.category != "Compare":
            return
        compare_type = trace.instruction_type if trace.instruction_type else "SLT"
        if compare_type not in ["SLT", "SLTU", "EQ", "NE"]:
            return
        # Simulate compare result
        result = 1  # Would be calculated in real implementation
        zero_result = 0  # Would be calculated in real implementation
        self.bucket.clear()
        self.bucket.set_axes(
            compare_type=compare_type,
            rs1=trace.rs1 if trace.rs1 else "x0",
            rs2=trace.rs2 if trace.rs2 else "x0",
            result=result,
            zero_result=zero_result,
        )
        self.bucket.hit()


# Medium coverpoint: ~270 buckets (4 axes: 3, 5, 5, 3 values)
class FlagGeneration(Coverpoint):
    NAME = "flag_generation"
    DESCRIPTION = "Flag generation coverage"
    TIER = 2
    TAGS = ["compare", "flags"]

    def setup(self, ctx):
        self.add_axis(
            name="compare_type",
            values=["SLT", "SLTU", "EQ"],
            description="Compare type",
            enable_other="Other",
        )
        self.add_axis(
            name="less_flag",
            values=AxisUtils.enabled(),
            description="Less than flag",
        )
        self.add_axis(
            name="equal_flag",
            values=AxisUtils.enabled(),
            description="Equal flag",
        )
        self.add_axis(
            name="greater_flag",
            values=AxisUtils.enabled(),
            description="Greater than flag",
        )

        # Add ignore goal
        self.add_goal("IGNORE_NO_FLAGS", "Ignore cases with no flags set", ignore=True)

    def apply_goals(self, bucket, goals):
        if (
            bucket.less_flag == "Disabled"
            and bucket.equal_flag == "Disabled"
            and bucket.greater_flag == "Disabled"
        ):
            return goals.IGNORE_NO_FLAGS

    def sample(self, trace):
        if trace.category != "Compare":
            return
        compare_type = trace.instruction_type if trace.instruction_type else "SLT"
        if compare_type not in ["SLT", "SLTU", "EQ"]:
            return
        # Simulate flag generation
        less_flag = 1 if compare_type == "SLT" else 0
        equal_flag = 1 if compare_type == "EQ" else 0
        greater_flag = 0  # Would be calculated in real implementation
        self.bucket.clear()
        self.bucket.set_axes(
            compare_type=compare_type,
            less_flag=less_flag,
            equal_flag=equal_flag,
            greater_flag=greater_flag,
        )
        self.bucket.hit()
