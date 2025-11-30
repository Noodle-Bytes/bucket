# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

import logging
import random
from pathlib import Path

from git.repo import Repo

from bucket import CoverageContext
from bucket.rw import ArchiveAccessor, MergeReadout, PointReader

from .stress_common import InstructionTrace, RISCVDataset
from .stress_top import StressTop


def generate_trace(rand: random.Random, riscv_data: RISCVDataset) -> InstructionTrace:
    """
    Generate a random instruction trace for coverage sampling.
    This creates diverse trace data that exercises various buckets.
    """
    # Randomly select instruction properties
    format_type = rand.choice(riscv_data.instruction_formats)
    category = rand.choice(riscv_data.instruction_categories)
    instruction_type = rand.choice(riscv_data.instruction_types)
    opcode = rand.choice(riscv_data.opcodes)

    # Generate register assignments
    rd = rand.choice(riscv_data.registers) if rand.random() > 0.1 else None
    rs1 = rand.choice(riscv_data.registers) if rand.random() > 0.2 else None
    rs2 = rand.choice(riscv_data.registers) if rand.random() > 0.3 else None

    # Generate immediate value (sometimes)
    immediate = rand.randint(-2048, 2047) if rand.random() > 0.4 else None

    # Generate execution state
    execution_state = (
        rand.choice(riscv_data.execution_states) if rand.random() > 0.3 else None
    )
    pipeline_stage = (
        rand.choice(riscv_data.pipeline_stages) if rand.random() > 0.2 else None
    )

    # Generate branch outcome (for branch instructions)
    branch_outcome = None
    if format_type == "B-type" or category == "Branch":
        branch_outcome = rand.choice(riscv_data.branch_outcomes)

    # Generate exception (rarely)
    exception_type = "none"
    if rand.random() < 0.05:  # 5% chance
        exception_type = rand.choice(riscv_data.exception_types)

    # Generate cache state (for memory operations)
    cache_state = None
    if category in ["Load", "Store"]:
        cache_state = rand.choice(riscv_data.cache_states)

    # Generate data size
    data_size = (
        rand.choice(riscv_data.data_sizes) if category in ["Load", "Store"] else None
    )

    # Generate alignment
    alignment = (
        rand.choice(riscv_data.alignments) if category in ["Load", "Store"] else None
    )

    # Generate privilege level
    privilege_level = (
        rand.choice(riscv_data.privilege_levels) if rand.random() > 0.5 else "user"
    )

    # Generate CSR (rarely)
    csr = None
    if category == "System" and rand.random() < 0.3:
        csr = rand.choice(riscv_data.csr_registers)

    # Generate memory pattern
    memory_pattern = (
        rand.choice(riscv_data.memory_patterns)
        if category in ["Load", "Store"]
        else None
    )

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


def run_testbench(
    output_path: Path,
    test_num: int,
    rand: random.Random,
    log: logging.Logger,
    riscv_data: RISCVDataset,
) -> Path:
    """
    Run a single testbench iteration and export coverage.
    """
    samples = rand.randint(100, 500)  # Vary sample count per test

    log.info(f"Test {test_num}: Running with {samples} samples")

    # Instance the coverage
    with CoverageContext(riscv_data=riscv_data):
        cvg = StressTop(
            source=f"stress_test_{test_num:03d}",
            source_key=str(rand.randint(1, 1000000)),
        )

    log.info(f"Test {test_num}: Sampling coverage...")
    for _ in range(samples):
        trace = generate_trace(rand, riscv_data)
        cvg.sample(trace)

    # Create a context specific hash
    # Go up from stress_example.py -> riscv_stress -> examples -> bucket (repo root)
    context_hash = Repo(Path(__file__).parent.parent.parent).head.object.hexsha

    # Create a reader
    point_reader = PointReader(context_hash)

    # Read the coverage
    readout = point_reader.read(cvg)

    # Export to bucket archive format (.bktgz)
    archive_path = output_path / f"test_{test_num:03d}.bktgz"
    archive_writer = ArchiveAccessor(archive_path).writer()
    archive_writer.write(readout)
    log.info(f"Test {test_num}: Coverage exported to {archive_path}")

    return archive_path


def merge_all_tests(
    log: logging.Logger,
    test_outputs_dir: Path,
    num_tests: int,
    merged_archive_path: Path,
):
    """
    Merge all test readouts into a single merged archive.
    """
    log.info("Starting merge of all test readouts...")

    readouts = []
    for test_num in range(num_tests):
        archive_path = test_outputs_dir / f"test_{test_num:03d}.bktgz"
        if not archive_path.exists():
            log.warning(f"Archive not found: {archive_path}, skipping")
            continue

        archive_reader = ArchiveAccessor(archive_path).reader()
        readout = next(archive_reader.read_all())
        readouts.append(readout)

        if (test_num + 1) % 50 == 0:
            log.info(f"Loaded {test_num + 1} readouts...")

    if len(readouts) == 0:
        log.error("No readouts to merge!")
        return

    log.info(f"Merging {len(readouts)} readouts...")

    # Merge all readouts
    merged_readout = MergeReadout(readouts[0], *readouts[1:])

    # Export merged coverage to bucket archive format
    archive_writer = ArchiveAccessor(merged_archive_path).writer()
    archive_writer.write(merged_readout)
    log.info(f"Merged coverage exported to archive: {merged_archive_path}")


def run(output_dir: Path = Path("."), num_tests: int = 500, seed: int = 42):
    """
    Run the stress test example.

    Args:
        output_dir: Directory where outputs will be written
        num_tests: Number of test runs to generate (default: 500)
        seed: Random seed for reproducibility (default: 42)
    """
    logging.basicConfig(level=logging.INFO)
    log = logging.getLogger("stress_test")
    log.setLevel(logging.INFO)

    rand = random.Random(seed)
    riscv_data = RISCVDataset()

    # Create output directory structure
    stress_output_dir = output_dir / "riscv_stress"
    test_outputs_dir = stress_output_dir / "test_outputs"
    test_outputs_dir.mkdir(parents=True, exist_ok=True)

    log.info(f"Starting stress test with {num_tests} test runs")
    log.info(f"Test outputs will be written to: {test_outputs_dir}")

    # Run all tests
    archive_paths = []
    for test_num in range(num_tests):
        try:
            archive_path = run_testbench(
                test_outputs_dir, test_num, rand, log, riscv_data
            )
            archive_paths.append(archive_path)

            if (test_num + 1) % 50 == 0:
                log.info(f"Completed {test_num + 1}/{num_tests} tests...")
        except Exception as e:
            log.error(f"Test {test_num} failed: {e}")
            continue

    log.info(f"Completed {len(archive_paths)}/{num_tests} tests successfully")

    # Merge all tests
    merged_archive_path = output_dir / "riscv_stress_merged.bktgz"
    merge_all_tests(log, test_outputs_dir, num_tests, merged_archive_path)

    log.info("=" * 60)
    log.info("Stress test complete!")
    log.info(f"Individual test archives: {test_outputs_dir}")
    log.info(f"Merged archive: {merged_archive_path}")
    log.info("To view coverage, open the merged archive in the Bucket viewer")
    log.info("=" * 60)


if __name__ == "__main__":
    run()
