# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

from bucket import AxisUtils, Covergroup, Coverpoint


# Level 1: System operations
class SystemGroup(Covergroup):
    NAME = "system"
    DESCRIPTION = "System operation coverage"

    def setup(self, ctx):
        self.add_coverpoint(CSROperations())  # Small: ~130 buckets
        self.add_covergroup(SystemAdvanced())  # Nested group


# Level 2: Advanced system
class SystemAdvanced(Covergroup):
    NAME = "system_advanced"
    DESCRIPTION = "Advanced system coverage"

    def setup(self, ctx):
        self.add_coverpoint(PrivilegeTransitions())  # Large: ~800 buckets
        self.add_coverpoint(InterruptHandling())  # Medium: ~290 buckets


# Small coverpoint: ~130 buckets (3 axes: 4, 5, 6 values)
class CSROperations(Coverpoint):
    NAME = "csr_operations"
    DESCRIPTION = "CSR operation coverage"
    TIER = 1
    TAGS = ["system", "csr"]

    def setup(self, ctx):
        self.add_axis(
            name="csr_op",
            values=["CSRRW", "CSRRS", "CSRRC", "CSRRWI"],
            description="CSR operation",
        )
        self.add_axis(
            name="csr",
            values=ctx.riscv_data.csr_registers[:5],
            description="CSR register",
            enable_other="Other",
        )
        self.add_axis(
            name="rd",
            values=ctx.riscv_data.registers[:6],
            description="Destination register",
            enable_other="Other",
        )

        # Add target goal
        self.add_goal("CSR_READ", "CSR reads are common", target=65)

    def apply_goals(self, bucket, goals):
        if bucket.csr_op in ["CSRRS", "CSRRC"]:
            return goals.CSR_READ

    def sample(self, trace):
        if trace.csr is None:
            return
        csr_op = "CSRRW"  # Default
        self.bucket.clear()
        self.bucket.set_axes(
            csr_op=csr_op,
            csr=trace.csr,
            rd=trace.rd if trace.rd else "x0",
        )
        self.bucket.hit()


# Large coverpoint: ~800 buckets (5 axes: 4, 5, 4, 4, 2 values)
class PrivilegeTransitions(Coverpoint):
    NAME = "privilege_transitions"
    DESCRIPTION = "Privilege transition coverage"
    TIER = 3
    TAGS = ["system", "privilege"]

    def setup(self, ctx):
        self.add_axis(
            name="from_privilege",
            values=ctx.riscv_data.privilege_levels,
            description="Source privilege level",
        )
        self.add_axis(
            name="to_privilege",
            values=ctx.riscv_data.privilege_levels,
            description="Destination privilege level",
        )
        self.add_axis(
            name="transition_type",
            values=["ecall", "mret", "sret", "exception"],
            description="Transition type",
        )
        self.add_axis(
            name="pipeline_stage",
            values=ctx.riscv_data.pipeline_stages[:4],
            description="Pipeline stage",
            enable_other="Other",
        )
        self.add_axis(
            name="allowed",
            values=AxisUtils.enabled(),
            description="Transition allowed",
        )

        # Add target goal for privilege transitions (needs more coverage)
        self.add_goal(
            "PRIVILEGE_TRANS", "Privilege transitions need more coverage", target=450
        )

    def apply_goals(self, bucket, goals):
        # Apply goal for user to machine transitions (should be rare)
        if bucket.from_privilege == "user" and bucket.to_privilege == "machine":
            return goals.PRIVILEGE_TRANS

    def sample(self, trace):
        if trace.privilege_level is None:
            return
        from_priv = trace.privilege_level
        to_priv = "supervisor" if trace.exception_type != "none" else from_priv
        transition_type = "exception" if trace.exception_type != "none" else "ecall"
        allowed = 1 if (from_priv != "user" or to_priv != "machine") else 0
        self.bucket.clear()
        self.bucket.set_axes(
            from_privilege=from_priv,
            to_privilege=to_priv,
            transition_type=transition_type,
            pipeline_stage=str(trace.pipeline_stage)
            if trace.pipeline_stage is not None and trace.pipeline_stage < 5
            else "Other",
            allowed=allowed,
        )
        self.bucket.hit()


# Medium coverpoint: ~290 buckets (4 axes: 3, 5, 5, 3 values)
class InterruptHandling(Coverpoint):
    NAME = "interrupt_handling"
    DESCRIPTION = "Interrupt handling coverage"
    TIER = 2
    TAGS = ["system", "interrupt"]

    def setup(self, ctx):
        self.add_axis(
            name="interrupt_type",
            values=["timer", "external", "software"],
            description="Interrupt type",
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
            name="masked",
            values=AxisUtils.enabled(),
            description="Interrupt masked",
        )

        # Add target goal
        self.add_goal("TIMER_INT", "Timer interrupts need more coverage", target=145)

    def apply_goals(self, bucket, goals):
        if bucket.interrupt_type == "timer":
            return goals.TIMER_INT

    def sample(self, trace):
        if trace.exception_type != "timer_interrupt":
            return
        interrupt_type = (
            "timer" if trace.exception_type == "timer_interrupt" else "external"
        )
        masked = 0  # Would be determined by interrupt mask in real implementation
        self.bucket.clear()
        self.bucket.set_axes(
            interrupt_type=interrupt_type,
            privilege=trace.privilege_level if trace.privilege_level else "user",
            pipeline_stage=str(trace.pipeline_stage)
            if trace.pipeline_stage is not None and trace.pipeline_stage < 5
            else "Other",
            masked=masked,
        )
        self.bucket.hit()
