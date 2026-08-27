# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

from bucket import Covertop

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

_MODULE_FACTORIES = (
    ("instruction_formats", module_00.InstructionFormatGroup),
    ("memory_operations", module_01.MemoryGroup),
    ("pipeline", module_02.PipelineGroup),
    ("exceptions", module_03.ExceptionGroup),
    ("register_file", module_04.RegisterFileGroup),
    ("control_flow", module_05.ControlFlowGroup),
    ("arithmetic", module_06.ArithmeticGroup),
    ("logical", module_07.LogicalGroup),
    ("system", module_08.SystemGroup),
    ("compare", module_09.CompareGroup),
)


class StressTop(Covertop):
    """
    Top-level covertop containing all stress test coverage modules.

    Pass copies > 1 to replicate the module set with unique names, which
    scales the tree for sampling and merge stress tests.
    """

    NAME = "StressTest"
    DESCRIPTION = (
        "Large-scale stress test coverage with deep nesting and extensive features"
    )

    def __init__(self, copies: int = 1, **kwargs):
        if copies < 1:
            raise ValueError("copies must be >= 1")
        self.copies = copies
        super().__init__(**kwargs)

    def setup(self, ctx):
        for copy_idx in range(self.copies):
            for module_name, factory in _MODULE_FACTORIES:
                kwargs = {}
                if self.copies > 1:
                    kwargs["name"] = f"{module_name}_{copy_idx:02d}"
                self.add_covergroup(factory(), **kwargs)
