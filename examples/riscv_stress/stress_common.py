# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

from dataclasses import dataclass
from typing import Optional


class RISCVDataset:
    """
    RISC-V instruction set data for coverage.
    This provides a rich dataset for generating large coverage trees.
    """

    # RISC-V instruction formats
    instruction_formats = [
        "R-type",
        "I-type",
        "S-type",
        "B-type",
        "U-type",
        "J-type",
    ]

    # RISC-V opcodes (simplified set)
    opcodes = list(range(0x00, 0x80, 0x04))  # 32 opcodes

    # RISC-V registers (32 registers)
    registers = [f"x{i}" for i in range(32)]

    # RISC-V instruction categories
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

    # RISC-V instruction types
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

    # Immediate value ranges
    immediate_ranges = {
        "small": [0, 15],
        "medium": [16, 255],
        "large": [256, 4095],
        "very_large": [4096, 65535],
    }

    # Memory access patterns
    memory_patterns = [
        "sequential",
        "random",
        "aligned",
        "unaligned",
        "cache_line",
    ]

    # Execution states
    execution_states = [
        "idle",
        "fetch",
        "decode",
        "execute",
        "memory",
        "writeback",
        "exception",
    ]

    # Pipeline stages
    pipeline_stages = list(range(5))  # 0-4

    # Branch outcomes
    branch_outcomes = ["taken", "not_taken", "mispredicted"]

    # Exception types
    exception_types = [
        "none",
        "illegal_instruction",
        "misaligned_address",
        "page_fault",
        "timer_interrupt",
    ]

    # Cache states
    cache_states = ["hit", "miss", "evict", "writeback"]

    # Data sizes
    data_sizes = [8, 16, 32, 64]  # bits

    # Address alignment
    alignments = [1, 2, 4, 8, 16]

    # Privilege levels
    privilege_levels = ["user", "supervisor", "machine"]

    # CSR registers (simplified)
    csr_registers = [f"csr_{i:03x}" for i in range(0, 0x100, 0x10)]  # 16 CSRs


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
