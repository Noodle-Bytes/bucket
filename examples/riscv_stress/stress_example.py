# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

import logging
import os
import random
import sys
import time
from pathlib import Path

from git.repo import Repo

from bucket import CoverageContext
from bucket.rw import ArchiveAccessor, MergeReadout, PointReader, SQLAccessor
from bucket.rw.sql import merge_sql_direct

# Handle both relative imports (when run as module) and absolute imports (when run directly)
try:
    from .stress_common import InstructionTrace, RISCVDataset
    from .stress_top import StressTop
except ImportError:
    # Running directly, add current directory to path and use absolute imports
    _current_dir = os.path.dirname(os.path.abspath(__file__))
    if _current_dir not in sys.path:
        sys.path.insert(0, _current_dir)
    from stress_common import InstructionTrace, RISCVDataset
    from stress_top import StressTop


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
    export_formats: list[str],
) -> tuple[Path | None, Path | None]:
    """
    Run a single testbench iteration and export coverage.

    Args:
        output_path: Base output directory
        test_num: Test number for unique naming
        rand: Random number generator
        log: Logger instance
        riscv_data: RISC-V dataset
        export_formats: List of formats to export: ["sql"], ["archive"], or ["sql", "archive"]

    Returns:
        Tuple of (sql_path, archive_path). Either can be None if not exported.
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

    sql_path = None
    archive_path = None

    # Export to SQL format if requested
    if "sql" in export_formats:
        sql_dir = output_path / "sql"
        sql_dir.mkdir(parents=True, exist_ok=True)
        sql_path = sql_dir / f"test_{test_num:03d}.db"
        sql_writer = SQLAccessor.File(sql_path).writer()
        sql_writer.write(readout)
        log.info(f"Test {test_num}: Coverage exported to SQL: {sql_path}")

    # Export to bucket archive format (.bktgz) if requested
    if "archive" in export_formats:
        archive_dir = output_path / "archive"
        archive_dir.mkdir(parents=True, exist_ok=True)
        archive_path = archive_dir / f"test_{test_num:03d}.bktgz"
        archive_writer = ArchiveAccessor(archive_path).writer()
        archive_writer.write(readout)
        log.info(f"Test {test_num}: Coverage exported to Archive: {archive_path}")

    return sql_path, archive_path


def merge_sql_tests(
    log: logging.Logger,
    test_outputs_dir: Path,
    num_tests: int,
    merged_sql_path: Path,
    use_direct_merge: bool = False,
) -> float:
    """
    Merge all SQL test readouts into a single merged SQL database.

    Args:
        log: Logger instance
        test_outputs_dir: Directory containing test outputs
        num_tests: Number of tests to merge
        merged_sql_path: Path for merged SQL output
        use_direct_merge: If True, use direct SQL merge (faster, less memory).
                         If False, use Python MergeReadout (legacy).

    Returns:
        Elapsed time in seconds
    """
    start_time = time.time()

    sql_dir = test_outputs_dir / "sql"

    if use_direct_merge:
        log.info("Starting direct SQL merge of all test databases...")

        # Collect all SQL database paths
        sql_paths = []
        for test_num in range(num_tests):
            sql_path = sql_dir / f"test_{test_num:03d}.db"
            if not sql_path.exists():
                log.warning(f"SQL file not found: {sql_path}, skipping")
                continue
            sql_paths.append(sql_path)

        if len(sql_paths) == 0:
            log.error("No SQL databases to merge!")
            return 0.0

        log.info(f"Merging {len(sql_paths)} SQL databases using direct SQL merge...")

        # Use direct SQL merge - much faster and uses less memory
        merge_sql_direct(
            merged_sql_path,
            *sql_paths,
            source=f"riscv_stress_merged_{num_tests}tests",
            source_key="direct_sql_merge",
        )

        elapsed_time = time.time() - start_time
        log.info(
            f"Direct SQL merge completed: {merged_sql_path} (took {elapsed_time:.2f}s)"
        )

    else:
        log.info("Starting Python merge of all SQL test readouts...")

        readouts = []
        for test_num in range(num_tests):
            sql_path = sql_dir / f"test_{test_num:03d}.db"
            if not sql_path.exists():
                log.warning(f"SQL file not found: {sql_path}, skipping")
                continue

            sql_reader = SQLAccessor.File(sql_path).reader()
            readout = next(sql_reader.read_all())
            readouts.append(readout)

            if (test_num + 1) % 50 == 0:
                log.info(f"Loaded {test_num + 1} SQL readouts...")

        if len(readouts) == 0:
            log.error("No SQL readouts to merge!")
            return 0.0

        log.info(f"Merging {len(readouts)} SQL readouts using Python MergeReadout...")

        # Merge all readouts
        merged_readout = MergeReadout(readouts[0], *readouts[1:])

        # Export merged coverage to SQL format
        sql_writer = SQLAccessor.File(merged_sql_path).writer()
        sql_writer.write(merged_readout)
        elapsed_time = time.time() - start_time
        log.info(
            f"Python merge completed: {merged_sql_path} (took {elapsed_time:.2f}s)"
        )

    return elapsed_time


def merge_archive_tests(
    log: logging.Logger,
    test_outputs_dir: Path,
    num_tests: int,
    merged_archive_path: Path,
) -> float:
    """
    Merge all Archive test readouts into a single merged archive.

    Args:
        log: Logger instance
        test_outputs_dir: Directory containing test outputs
        num_tests: Number of tests to merge
        merged_archive_path: Path for merged Archive output

    Returns:
        Elapsed time in seconds
    """
    start_time = time.time()
    log.info("Starting merge of all Archive test readouts...")

    archive_dir = test_outputs_dir / "archive"
    readouts = []
    for test_num in range(num_tests):
        archive_path = archive_dir / f"test_{test_num:03d}.bktgz"
        if not archive_path.exists():
            log.warning(f"Archive not found: {archive_path}, skipping")
            continue

        archive_reader = ArchiveAccessor(archive_path).reader()
        readout = next(archive_reader.read_all())
        readouts.append(readout)

        if (test_num + 1) % 50 == 0:
            log.info(f"Loaded {test_num + 1} Archive readouts...")

    if len(readouts) == 0:
        log.error("No Archive readouts to merge!")
        return 0.0

    log.info(f"Merging {len(readouts)} Archive readouts...")

    # Merge all readouts
    merged_readout = MergeReadout(readouts[0], *readouts[1:])

    # Export merged coverage to bucket archive format
    archive_writer = ArchiveAccessor(merged_archive_path).writer()
    archive_writer.write(merged_readout)
    elapsed_time = time.time() - start_time
    log.info(
        f"Merged Archive coverage exported to: {merged_archive_path} (took {elapsed_time:.2f}s)"
    )

    return elapsed_time


def run(
    output_dir: Path = Path("."),
    num_tests: int = 1000,
    seed: int = 42,
    export_formats: list[str] | None = None,
    use_direct_sql_merge: bool = True,
    compare_merge_methods: bool = False,
):
    """
    Run the stress test example.

    Args:
        output_dir: Directory where outputs will be written
        num_tests: Number of test runs to generate (default: 1000)
        seed: Random seed for reproducibility (default: 42)
        export_formats: List of formats to export: ["sql"], ["archive"], or ["sql", "archive"]
                       Defaults to ["both"] which exports both formats
        use_direct_sql_merge: Use direct SQL merge for better performance (default: True)
        compare_merge_methods: If True, run both merge methods and compare timing (default: False)
    """
    if export_formats is None:
        export_formats = ["both"]

    # Normalize "both" to both formats
    if "both" in export_formats:
        export_formats = ["sql", "archive"]
    elif not export_formats:
        export_formats = ["archive"]  # Default to archive if empty

    logging.basicConfig(level=logging.INFO)
    log = logging.getLogger("stress_test")
    log.setLevel(logging.INFO)

    riscv_data = RISCVDataset()

    # Create output directory structure
    stress_output_dir = output_dir / "riscv_stress"
    test_outputs_dir = stress_output_dir / "test_outputs"
    test_outputs_dir.mkdir(parents=True, exist_ok=True)

    log.info(f"Starting stress test with {num_tests} test runs")
    log.info(f"Export formats: {export_formats}")
    log.info(f"Test outputs will be written to: {test_outputs_dir}")

    # Run all tests
    sql_paths = []
    archive_paths = []
    for test_num in range(num_tests):
        try:
            # Use unique seed per test: base_seed + test_num
            test_rand = random.Random(seed + test_num)
            sql_path, archive_path = run_testbench(
                test_outputs_dir, test_num, test_rand, log, riscv_data, export_formats
            )
            if sql_path:
                sql_paths.append(sql_path)
            if archive_path:
                archive_paths.append(archive_path)

            if (test_num + 1) % 50 == 0:
                log.info(f"Completed {test_num + 1}/{num_tests} tests...")
        except Exception as e:
            log.error(f"Test {test_num} failed: {e}")
            continue

    log.info(
        f"Completed {len(sql_paths) + len(archive_paths)}/{num_tests} tests successfully"
    )
    if sql_paths:
        log.info(f"  - {len(sql_paths)} SQL files created")
    if archive_paths:
        log.info(f"  - {len(archive_paths)} Archive files created")

    # Merge tests for each format
    sql_merge_time = None
    sql_merge_time_python = None
    archive_merge_time = None

    if "sql" in export_formats and sql_paths:
        merged_sql_path = stress_output_dir / "riscv_stress_merged_sql.db"

        if compare_merge_methods:
            # Compare both merge methods
            log.info("=" * 60)
            log.info("COMPARING MERGE METHODS")
            log.info("=" * 60)

            # Direct SQL merge
            sql_merge_time = merge_sql_tests(
                log, test_outputs_dir, num_tests, merged_sql_path, use_direct_merge=True
            )

            # Python merge (for comparison)
            merged_sql_path_python = (
                stress_output_dir / "riscv_stress_merged_sql_python.db"
            )
            sql_merge_time_python = merge_sql_tests(
                log,
                test_outputs_dir,
                num_tests,
                merged_sql_path_python,
                use_direct_merge=False,
            )

            log.info("=" * 60)
            log.info("MERGE METHOD COMPARISON RESULTS")
            log.info(f"  Direct SQL merge: {sql_merge_time:.2f}s")
            log.info(f"  Python MergeReadout: {sql_merge_time_python:.2f}s")
            if sql_merge_time < sql_merge_time_python:
                speedup = sql_merge_time_python / sql_merge_time
                log.info(f"  ✓ Direct SQL merge was {speedup:.2f}x FASTER")
            else:
                slowdown = sql_merge_time / sql_merge_time_python
                log.info(
                    f"  ✗ Direct SQL merge was {slowdown:.2f}x SLOWER (unexpected!)"
                )
            log.info("=" * 60)
        else:
            # Use selected merge method
            sql_merge_time = merge_sql_tests(
                log,
                test_outputs_dir,
                num_tests,
                merged_sql_path,
                use_direct_merge=use_direct_sql_merge,
            )

    if "archive" in export_formats and archive_paths:
        merged_archive_path = stress_output_dir / "riscv_stress_merged_archive.bktgz"
        archive_merge_time = merge_archive_tests(
            log, test_outputs_dir, num_tests, merged_archive_path
        )

    # Report timing comparison
    log.info("=" * 60)
    log.info("Stress test complete!")
    log.info(f"Individual test outputs: {test_outputs_dir}")
    if sql_merge_time is not None:
        merge_method = (
            "Direct SQL" if use_direct_sql_merge or compare_merge_methods else "Python"
        )
        log.info(f"Merged SQL: {stress_output_dir / 'riscv_stress_merged_sql.db'}")
        log.info(f"  SQL merge time ({merge_method}): {sql_merge_time:.2f}s")
    if archive_merge_time is not None:
        log.info(
            f"Merged Archive: {stress_output_dir / 'riscv_stress_merged_archive.bktgz'}"
        )
        log.info(f"  Archive merge time: {archive_merge_time:.2f}s")

    if (
        sql_merge_time is not None
        and archive_merge_time is not None
        and not compare_merge_methods
    ):
        if sql_merge_time < archive_merge_time:
            speedup = archive_merge_time / sql_merge_time
            log.info(f"  SQL merge was {speedup:.2f}x faster than Archive")
        else:
            speedup = sql_merge_time / archive_merge_time
            log.info(f"  Archive merge was {speedup:.2f}x faster than SQL")

    log.info("To view coverage, open the merged files in the Bucket viewer")
    log.info("=" * 60)


if __name__ == "__main__":
    run()
