# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

from __future__ import annotations

import math
import random
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from bucket import CoverageContext, Coverpoint, Covertop

from .stress_top import StressTop


class RISCVDataset:
    """
    RISC-V instruction set data for coverage.
    This provides a rich dataset for generating large coverage trees.
    """

    instruction_formats = [
        "R-type",
        "I-type",
        "S-type",
        "B-type",
        "U-type",
        "J-type",
    ]

    opcodes = list(range(0x00, 0x80, 0x04))  # 32 opcodes
    registers = [f"x{i}" for i in range(32)]

    instruction_categories = [
        "Arithmetic",
        "Logical",
        "Shift",
        "Compare",
        "Load",
        "Store",
        "Branch",
        "Jump",
        "System",
        "Fence",
    ]

    instruction_types = [
        "ADD",
        "SUB",
        "AND",
        "OR",
        "XOR",
        "SLT",
        "SLTU",
        "SLL",
        "SRL",
        "SRA",
        "BEQ",
        "BNE",
        "BLT",
        "BGE",
        "BLTU",
        "BGEU",
        "JAL",
        "JALR",
        "LW",
        "SW",
        "LUI",
        "AUIPC",
    ]

    memory_patterns = [
        "sequential",
        "random",
        "aligned",
        "unaligned",
        "cache_line",
    ]

    execution_states = [
        "idle",
        "fetch",
        "decode",
        "execute",
        "memory",
        "writeback",
        "exception",
    ]

    pipeline_stages = list(range(5))
    branch_outcomes = ["taken", "not_taken", "mispredicted"]
    exception_types = [
        "none",
        "illegal_instruction",
        "misaligned_address",
        "page_fault",
        "timer_interrupt",
    ]
    cache_states = ["hit", "miss", "evict", "writeback"]
    data_sizes = [8, 16, 32, 64]
    alignments = [1, 2, 4, 8, 16]
    privilege_levels = ["user", "supervisor", "machine"]
    csr_registers = [f"csr_{i:03x}" for i in range(0, 0x100, 0x10)]


@dataclass
class InstructionTrace:
    """Trace data for a RISC-V instruction execution"""

    opcode: int
    format_type: str
    category: str
    instruction_type: str
    rd: Optional[str] = None
    rs1: Optional[str] = None
    rs2: Optional[str] = None
    immediate: Optional[int] = None
    execution_state: Optional[str] = None
    pipeline_stage: Optional[int] = None
    branch_outcome: Optional[str] = None
    exception_type: Optional[str] = None
    cache_state: Optional[str] = None
    data_size: Optional[int] = None
    alignment: Optional[int] = None
    privilege_level: Optional[str] = None
    csr: Optional[str] = None
    memory_pattern: Optional[str] = None


def generate_trace(rand: random.Random, riscv_data: RISCVDataset) -> InstructionTrace:
    """Generate a random instruction trace that exercises the stress tree."""
    format_type = rand.choice(riscv_data.instruction_formats)
    category = rand.choice(riscv_data.instruction_categories)
    instruction_type = rand.choice(riscv_data.instruction_types)
    opcode = rand.choice(riscv_data.opcodes)

    rd = rand.choice(riscv_data.registers) if rand.random() > 0.1 else None
    rs1 = rand.choice(riscv_data.registers) if rand.random() > 0.2 else None
    rs2 = rand.choice(riscv_data.registers) if rand.random() > 0.3 else None
    immediate = rand.randint(-2048, 2047) if rand.random() > 0.4 else None
    execution_state = (
        rand.choice(riscv_data.execution_states) if rand.random() > 0.3 else None
    )
    pipeline_stage = (
        rand.choice(riscv_data.pipeline_stages) if rand.random() > 0.2 else None
    )

    branch_outcome = None
    if format_type == "B-type" or category == "Branch":
        branch_outcome = rand.choice(riscv_data.branch_outcomes)

    exception_type = "none"
    if rand.random() < 0.05:
        exception_type = rand.choice(riscv_data.exception_types)

    cache_state = None
    data_size = None
    alignment = None
    memory_pattern = None
    if category in ("Load", "Store"):
        cache_state = rand.choice(riscv_data.cache_states)
        data_size = rand.choice(riscv_data.data_sizes)
        alignment = rand.choice(riscv_data.alignments)
        memory_pattern = rand.choice(riscv_data.memory_patterns)

    privilege_level = (
        rand.choice(riscv_data.privilege_levels) if rand.random() > 0.5 else "user"
    )

    csr = None
    if category == "System" and rand.random() < 0.3:
        csr = rand.choice(riscv_data.csr_registers)

    return InstructionTrace(
        opcode=opcode,
        format_type=format_type,
        category=category,
        instruction_type=instruction_type,
        rd=rd,
        rs1=rs1,
        rs2=rs2,
        immediate=immediate,
        execution_state=execution_state,
        pipeline_stage=pipeline_stage,
        branch_outcome=branch_outcome,
        exception_type=exception_type,
        cache_state=cache_state,
        data_size=data_size,
        alignment=alignment,
        privilege_level=privilege_level,
        csr=csr,
        memory_pattern=memory_pattern,
    )


def context_hash() -> str:
    """Git HEAD of the repo, or empty string if git is unavailable."""
    repo_root = Path(__file__).resolve().parents[2]
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=repo_root,
            text=True,
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return ""


def iter_coverpoints(node):
    if isinstance(node, Coverpoint):
        yield node
        return
    for child in node.iter_children():
        yield from iter_coverpoints(child)


def tree_stats(top: Covertop) -> dict[str, int]:
    coverpoints = list(iter_coverpoints(top))
    buckets = 0
    for coverpoint in coverpoints:
        sizes = [axis.size for axis in coverpoint._axes]
        buckets += math.prod(sizes) if sizes else 1
    return {
        "coverpoints": len(coverpoints),
        "covergroups": _count_covergroups(top),
        "buckets": buckets,
    }


def _count_covergroups(node) -> int:
    if isinstance(node, Coverpoint):
        return 0
    count = 1
    for child in node.iter_children():
        count += _count_covergroups(child)
    return count


def build_coverage(
    *,
    copies: int = 1,
    source: str = "",
    source_key: str | int = "",
    riscv_data: RISCVDataset | None = None,
) -> StressTop:
    data = riscv_data or RISCVDataset()
    with CoverageContext(riscv_data=data):
        return StressTop(copies=copies, source=source, source_key=source_key)
