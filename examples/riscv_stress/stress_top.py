# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

from bucket import Covertop

# Handle both relative imports (when run as module) and absolute imports (when run directly)
try:
    from .stress_modules import (
        module_00,
        module_01,
        module_02,
        module_03,
        module_04,
        module_05,
        module_06,
        module_07,
        module_08,
        module_09,
    )
except ImportError:
    # Running directly, use absolute imports
    from stress_modules import (
        module_00,
        module_01,
        module_02,
        module_03,
        module_04,
        module_05,
        module_06,
        module_07,
        module_08,
        module_09,
    )


class StressTop(Covertop):
    """
    Top-level covertop containing all stress test coverage modules.
    This creates a large, deeply nested coverage tree to stress test the viewer.
    """

    NAME = "StressTest"
    DESCRIPTION = (
        "Large-scale stress test coverage with deep nesting and extensive features"
    )

    def setup(self, ctx):
        # Module 0: Instruction formats
        self.add_covergroup(module_00.InstructionFormatGroup())

        # Module 1: Memory operations
        self.add_covergroup(module_01.MemoryGroup())

        # Module 2: Pipeline
        self.add_covergroup(module_02.PipelineGroup())

        # Module 3: Exceptions
        self.add_covergroup(module_03.ExceptionGroup())

        # Module 4: Register file
        self.add_covergroup(module_04.RegisterFileGroup())

        # Module 5: Control flow
        self.add_covergroup(module_05.ControlFlowGroup())

        # Module 6: Arithmetic
        self.add_covergroup(module_06.ArithmeticGroup())

        # Module 7: Logical
        self.add_covergroup(module_07.LogicalGroup())

        # Module 8: System
        self.add_covergroup(module_08.SystemGroup())

        # Module 9: Compare
        self.add_covergroup(module_09.CompareGroup())
