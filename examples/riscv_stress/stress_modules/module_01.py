# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

from bucket import AxisUtils, Covergroup, Coverpoint


# Level 1: Memory operations
class MemoryGroup(Covergroup):
    NAME = "memory_operations"
    DESCRIPTION = "Memory operation coverage"

    def setup(self, ctx):
        self.add_coverpoint(LoadOperations())  # Small: ~120 buckets
        self.add_coverpoint(StoreOperations())  # Medium: ~350 buckets
        self.add_covergroup(MemoryAdvanced())  # Nested group


# Level 2: Advanced memory
class MemoryAdvanced(Covergroup):
    NAME = "memory_advanced"
    DESCRIPTION = "Advanced memory coverage"

    def setup(self, ctx):
        self.add_coverpoint(CacheOperations())  # Large: ~1000 buckets
        self.add_covergroup(MemoryAlignment())  # Level 3 nested


# Level 3: Memory alignment
class MemoryAlignment(Covergroup):
    NAME = "memory_alignment"
    DESCRIPTION = "Memory alignment coverage"

    def setup(self, ctx):
        self.add_coverpoint(AlignmentCoverage())  # Medium: ~240 buckets


# Small coverpoint: ~120 buckets (3 axes: 4, 5, 6 values)
class LoadOperations(Coverpoint):
    NAME = "load_operations"
    DESCRIPTION = "Load operation coverage"
    TIER = 1
    TAGS = ["load", "memory"]

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
            name="data_size",
            values=ctx.riscv_data.data_sizes,
            description="Data size in bits",
        )

        # Add target goal
        self.add_goal("WORD_LOAD", "Word loads are common", target=50)

    def apply_goals(self, bucket, goals):
        if bucket.load_type == "LW" and bucket.data_size == 32:
            return goals.WORD_LOAD

    def sample(self, trace):
        if trace.category != "Load":
            return
        load_type = trace.instruction_type if trace.instruction_type else "LW"
        if load_type not in ["LW", "LH", "LB", "LHU"]:
            return
        self.bucket.clear()
        self.bucket.set_axes(
            load_type=load_type,
            rd=trace.rd if trace.rd else "x0",
            data_size=trace.data_size if trace.data_size else 32,
        )
        self.bucket.hit()


# Medium coverpoint: ~350 buckets (4 axes: 5, 4, 5, 3 values)
class StoreOperations(Coverpoint):
    NAME = "store_operations"
    DESCRIPTION = "Store operation coverage"
    TIER = 2
    TAGS = ["store", "memory"]

    def setup(self, ctx):
        self.add_axis(
            name="store_type",
            values=["SW", "SH", "SB"],
            description="Store instruction type",
        )
        self.add_axis(
            name="rs1",
            values=ctx.riscv_data.registers[:4],
            description="Base register",
            enable_other="Other",
        )
        self.add_axis(
            name="rs2",
            values=ctx.riscv_data.registers[:5],
            description="Source register",
            enable_other="Other",
        )
        self.add_axis(
            name="alignment",
            values=ctx.riscv_data.alignments[:3],
            description="Address alignment",
            enable_other="Other",
        )

        # Add ignore goal for x0 store (not interesting)
        self.add_goal("ZERO_STORE", "Storing from x0 is not interesting", ignore=True)

    def apply_goals(self, bucket, goals):
        if bucket.rs2 == "x0":
            return goals.ZERO_STORE

    def sample(self, trace):
        if trace.category != "Store":
            return
        store_type = trace.instruction_type if trace.instruction_type else "SW"
        if store_type not in ["SW", "SH", "SB"]:
            return
        self.bucket.clear()
        self.bucket.set_axes(
            store_type=store_type,
            rs1=trace.rs1 if trace.rs1 else "x0",
            rs2=trace.rs2 if trace.rs2 else "x0",
            alignment=trace.alignment if trace.alignment else 4,
        )
        self.bucket.hit()


# Large coverpoint: ~1000 buckets (5 axes: 4, 5, 5, 4, 2 values)
class CacheOperations(Coverpoint):
    NAME = "cache_operations"
    DESCRIPTION = "Cache operation coverage"
    TIER = 3
    TAGS = ["cache", "memory"]

    def setup(self, ctx):
        self.add_axis(
            name="cache_state",
            values=ctx.riscv_data.cache_states,
            description="Cache state",
        )
        self.add_axis(
            name="memory_pattern",
            values=ctx.riscv_data.memory_patterns,
            description="Memory access pattern",
        )
        self.add_axis(
            name="rs1",
            values=ctx.riscv_data.registers[:5],
            description="Base register",
            enable_other="Other",
        )
        self.add_axis(
            name="data_size",
            values=ctx.riscv_data.data_sizes,
            description="Data size",
        )
        self.add_axis(
            name="privilege",
            values=ctx.riscv_data.privilege_levels[:2],
            description="Privilege level",
            enable_other="Other",
        )

        # Add target goal
        self.add_goal("CACHE_MISS", "Cache misses need more coverage", target=500)

    def apply_goals(self, bucket, goals):
        if bucket.cache_state == "miss":
            return goals.CACHE_MISS

    def sample(self, trace):
        if trace.cache_state is None:
            return
        self.bucket.clear()
        self.bucket.set_axes(
            cache_state=trace.cache_state,
            memory_pattern=trace.memory_pattern
            if trace.memory_pattern
            else "sequential",
            rs1=trace.rs1 if trace.rs1 else "x0",
            data_size=trace.data_size if trace.data_size else 32,
            privilege=trace.privilege_level if trace.privilege_level else "user",
        )
        self.bucket.hit()


# Medium coverpoint: ~240 buckets (4 axes: 4, 4, 5, 3 values)
class AlignmentCoverage(Coverpoint):
    NAME = "alignment_coverage"
    DESCRIPTION = "Memory alignment coverage"
    TIER = 2
    TAGS = ["alignment", "memory"]

    def setup(self, ctx):
        self.add_axis(
            name="alignment",
            values=ctx.riscv_data.alignments,
            description="Address alignment",
        )
        self.add_axis(
            name="data_size",
            values=ctx.riscv_data.data_sizes,
            description="Data size",
        )
        self.add_axis(
            name="address",
            values=AxisUtils.ranges(1023, 5, min_val=0),
            description="Address ranges",
        )
        self.add_axis(
            name="operation",
            values=["load", "store"],
            description="Memory operation type",
        )

        # Add target goal for misaligned access (needs more coverage)
        self.add_goal("MISALIGNED", "Misaligned access needs more coverage", target=300)

    def apply_goals(self, bucket, goals):
        # Check if alignment matches data size requirement
        align_val = int(bucket.alignment) if bucket.alignment != "Other" else 4
        size_val = int(bucket.data_size) // 8
        if align_val < size_val:
            return goals.MISALIGNED

    def sample(self, trace):
        if trace.alignment is None:
            return
        self.bucket.clear()
        # Alignment value - enable_other will handle values not in [1, 2, 4]
        align_val = trace.alignment if trace.alignment else 4
        self.bucket.set_axes(
            alignment=align_val,
            data_size=trace.data_size if trace.data_size else 32,
            address=(trace.immediate if trace.immediate is not None else 0) % 1024,
            operation="load" if trace.category == "Load" else "store",
        )
        self.bucket.hit()
