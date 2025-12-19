# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

import argparse
import logging
import os
import random
import sys
import time
from pathlib import Path

from git.repo import Repo

from bucket import CoverageContext
from bucket.rw import (
    ArchiveAccessor,
    JSONAccessor,
    MergeReadout,
    PointReader,
    SQLAccessor,
)
from bucket.rw.common import (
    BucketHitTuple,
    PointHitTuple,
    PuppetReadout,
)
from bucket.rw.sql import merge_sql_direct

# Handle both relative imports (when run as module) and absolute imports (when run directly)
try:
    from .stress_common import RISCVDataset
    from .stress_example import generate_trace
    from .stress_top import StressTop
except ImportError:
    # Running directly, add current directory to path and use absolute imports
    _current_dir = os.path.dirname(os.path.abspath(__file__))
    if _current_dir not in sys.path:
        sys.path.insert(0, _current_dir)
    from stress_common import RISCVDataset
    from stress_example import generate_trace
    from stress_top import StressTop


def generate_definition(
    log: logging.Logger, riscv_data: RISCVDataset, seed: int
) -> PuppetReadout:
    """
    Run one real test to capture the complete coverage definition structure.

    Args:
        log: Logger instance
        riscv_data: RISC-V dataset
        seed: Random seed for the test

    Returns:
        A readout containing the definition structure (points, axes, goals, etc.)
    """
    log.info("Generating definition structure from one real test...")

    rand = random.Random(seed)
    samples = rand.randint(100, 500)

    # Instance the coverage
    with CoverageContext(riscv_data=riscv_data):
        cvg = StressTop(
            source="definition_template",
            source_key=str(rand.randint(1, 1000000)),
        )

    log.info(f"Sampling {samples} traces for definition...")
    for _ in range(samples):
        trace = generate_trace(rand, riscv_data)
        cvg.sample(trace)

    # Create a context specific hash
    # Go up from generate_stress_data.py -> riscv_stress -> examples -> bucket (repo root)
    context_hash = Repo(Path(__file__).parent.parent.parent).head.object.hexsha

    # Create a reader
    point_reader = PointReader(context_hash)

    # Read the coverage to get the definition
    readout = point_reader.read(cvg)

    log.info(
        f"Definition captured: {len(readout.points)} points, {len(readout.bucket_goals)} buckets"
    )
    return readout


def calculate_point_hits(
    definition: PuppetReadout, bucket_hits: list[int]
) -> list[PointHitTuple]:
    """
    Calculate point_hits from bucket_hits by aggregating within each point's bucket range.

    Args:
        definition: Readout containing the definition structure
        bucket_hits: List of hit counts for each bucket

    Returns:
        List of PointHitTuple objects
    """
    point_hits = []
    goal_targets = [goal.target for goal in definition.goals]

    bucket_targets = []
    for bucket_goal in definition.bucket_goals:
        bucket_targets.append(goal_targets[bucket_goal.goal])

    for point in definition.points:
        hits = 0
        hit_buckets = 0
        full_buckets = 0

        # Aggregate bucket hits within this point's range
        for bucket_idx in range(point.bucket_start, point.bucket_end):
            if bucket_idx < len(bucket_hits):
                bucket_hit_count = bucket_hits[bucket_idx]
                target = (
                    bucket_targets[bucket_idx]
                    if bucket_idx < len(bucket_targets)
                    else 0
                )

                if target > 0:
                    bucket_hits_clamped = min(bucket_hit_count, target)
                    if bucket_hit_count > 0:
                        hit_buckets += 1
                        if bucket_hits_clamped == target:
                            full_buckets += 1
                        hits += bucket_hits_clamped

        point_hits.append(
            PointHitTuple(
                start=point.start,
                depth=point.depth,
                hits=hits,
                hit_buckets=hit_buckets,
                full_buckets=full_buckets,
            )
        )

    return point_hits


def generate_synthetic_readout(
    definition: PuppetReadout,
    test_num: int,
    rand: random.Random,
    max_hits: int = 1000,
) -> PuppetReadout:
    """
    Create a synthetic readout with random hit data matching the definition structure.

    Args:
        definition: Readout containing the definition structure
        test_num: Test number for unique naming
        rand: Random number generator
        max_hits: Maximum hit count per bucket (default: 1000)

    Returns:
        A new PuppetReadout with synthetic hit data
    """
    # Create a new readout with the same definition structure
    readout = PuppetReadout()

    # Copy definition data
    readout.def_sha = definition.def_sha
    readout.points = definition.points.copy()
    readout.axes = definition.axes.copy()
    readout.axis_values = definition.axis_values.copy()
    readout.goals = definition.goals.copy()
    readout.bucket_goals = definition.bucket_goals.copy()

    # Generate random bucket hits
    num_buckets = len(definition.bucket_goals)
    bucket_hits_list = [rand.randint(0, max_hits) for _ in range(num_buckets)]
    readout.bucket_hits = [
        BucketHitTuple(start=i, hits=hits) for i, hits in enumerate(bucket_hits_list)
    ]

    # Calculate point hits from bucket hits
    readout.point_hits = calculate_point_hits(definition, bucket_hits_list)

    # Use the same rec_sha as the definition for merge compatibility
    # All synthetic readouts represent the same code/environment context
    readout.rec_sha = definition.rec_sha
    readout.source = f"synthetic_test_{test_num:03d}"
    readout.source_key = str(rand.randint(1, 1000000))

    return readout


def export_readout(
    readout: PuppetReadout,
    test_num: int,
    output_path: Path,
    log: logging.Logger,
    skip_json: bool = False,
    skip_sql: bool = False,
    skip_archive: bool = False,
) -> tuple[Path | None, Path | None, Path | None]:
    """
    Export a readout to JSON, SQL, and Archive formats.

    Args:
        readout: Readout to export
        test_num: Test number for unique naming
        output_path: Base output directory
        log: Logger instance
        skip_json: If True, skip JSON export
        skip_sql: If True, skip SQL export
        skip_archive: If True, skip Archive export

    Returns:
        Tuple of (json_path, sql_path, archive_path). Any can be None if export failed or skipped.
    """
    json_path = None
    sql_path = None
    archive_path = None

    # Export to JSON format
    if not skip_json:
        try:
            json_dir = output_path / "json"
            json_dir.mkdir(parents=True, exist_ok=True)
            json_path = json_dir / f"test_{test_num:03d}.json"
            json_writer = JSONAccessor(json_path).writer()
            json_writer.write(readout)
        except Exception as e:
            log.warning(f"Failed to export test {test_num} to JSON: {e}")

    # Export to SQL format
    if not skip_sql:
        try:
            sql_dir = output_path / "sql"
            sql_dir.mkdir(parents=True, exist_ok=True)
            sql_path = sql_dir / f"test_{test_num:03d}.db"
            sql_writer = SQLAccessor.File(sql_path).writer()
            sql_writer.write(readout)
        except Exception as e:
            log.warning(f"Failed to export test {test_num} to SQL: {e}")

    # Export to Archive format
    if not skip_archive:
        try:
            archive_dir = output_path / "archive"
            archive_dir.mkdir(parents=True, exist_ok=True)
            archive_path = archive_dir / f"test_{test_num:03d}.bktgz"
            archive_writer = ArchiveAccessor(archive_path).writer()
            archive_writer.write(readout)
        except Exception as e:
            log.warning(f"Failed to export test {test_num} to Archive: {e}")

    return json_path, sql_path, archive_path


def merge_json_tests(
    log: logging.Logger,
    test_outputs_dir: Path,
    num_tests: int,
    merged_json_path: Path,
    parallel: bool = True,
    load_batch_size: int = 100,
    merge_batch_size: int = 50,
) -> float:
    """
    Merge all JSON test readouts into a single merged JSON file.

    Args:
        log: Logger instance
        test_outputs_dir: Directory containing test outputs
        num_tests: Number of tests to merge (or max expected)
        merged_json_path: Path for merged JSON output
        parallel: If True, load files in parallel (default: True)
        load_batch_size: Number of files to load+merge per batch (default: 100)
        merge_batch_size: Size of intermediate merge batches (default: 50)

    Returns:
        Elapsed time in seconds
    """
    start_time = time.time()
    log.info("Starting merge of all JSON test readouts...")

    json_dir = test_outputs_dir / "json"

    # Scan for all JSON files and merge them
    json_files = sorted(json_dir.glob("test_*.json"))
    if not json_files:
        log.error(f"No JSON files found in {json_dir}")
        return 0.0

    log.info(f"Found {len(json_files)} JSON files to merge")

    def load_json_file(json_path):
        """Load a single JSON file"""
        try:
            accessor = JSONAccessor(json_path)
            json_reader = accessor.reader()
            readout = next(json_reader.read_all())
            del json_reader
            del accessor
            return readout
        except Exception as e:
            log.warning(f"Failed to load {json_path}: {e}, skipping")
            return None

    # Interleaved load+merge: load batches and merge them incrementally to reduce memory
    batch_results = []
    if len(json_files) > load_batch_size:
        log.info(f"Using interleaved load+merge with batch size {load_batch_size}...")

        for batch_idx in range(0, len(json_files), load_batch_size):
            batch_files = json_files[batch_idx : batch_idx + load_batch_size]
            log.info(
                f"Loading and merging batch {batch_idx // load_batch_size + 1}/{(len(json_files) + load_batch_size - 1) // load_batch_size} ({len(batch_files)} files)"
            )

            # Load this batch in parallel
            if parallel:
                import concurrent.futures
                import os

                max_workers = min(os.cpu_count() or 1, 8)
                with concurrent.futures.ThreadPoolExecutor(
                    max_workers=max_workers
                ) as executor:
                    results = list(executor.map(load_json_file, batch_files))
                    readouts = [r for r in results if r is not None]
            else:
                readouts = [load_json_file(f) for f in batch_files if load_json_file(f)]

            # Merge this batch immediately
            if len(readouts) > 0:
                batch_merged = (
                    MergeReadout(readouts[0], *readouts[1:])
                    if len(readouts) > 1
                    else readouts[0]
                )
                batch_results.append(batch_merged)
                del readouts  # Free memory

        # Final merge of all batch results
        if len(batch_results) == 0:
            log.error("No JSON readouts to merge!")
            return 0.0

        log.info(f"Merging {len(batch_results)} batch results...")
        merged_readout = (
            MergeReadout(batch_results[0], *batch_results[1:])
            if len(batch_results) > 1
            else batch_results[0]
        )
    else:
        # Small number of files - load all then merge
        if parallel:
            import concurrent.futures
            import os

            max_workers = min(os.cpu_count() or 1, 8)
            log.info(f"Loading {len(json_files)} JSON files in parallel...")
            with concurrent.futures.ThreadPoolExecutor(
                max_workers=max_workers
            ) as executor:
                results = list(executor.map(load_json_file, json_files))
                readouts = [r for r in results if r is not None]
        else:
            readouts = [load_json_file(f) for f in json_files if load_json_file(f)]

        if len(readouts) == 0:
            log.error("No JSON readouts to merge!")
            return 0.0

        merged_readout = (
            MergeReadout(readouts[0], *readouts[1:])
            if len(readouts) > 1
            else readouts[0]
        )

    # Export merged coverage to JSON format
    json_writer = JSONAccessor(merged_json_path).writer()
    json_writer.write(merged_readout)
    elapsed_time = time.time() - start_time
    log.info(
        f"Merged JSON coverage exported to: {merged_json_path} (took {elapsed_time:.2f}s)"
    )

    return elapsed_time


def merge_sql_tests(
    log: logging.Logger,
    test_outputs_dir: Path,
    num_tests: int,
    merged_sql_path: Path,
    use_direct_merge: bool = True,
    load_batch_size: int = 100,
    merge_batch_size: int = 50,
    sql_paths: list[Path] | None = None,
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
        load_batch_size: Number of files to load+merge per batch (default: 100)
        merge_batch_size: Size of intermediate merge batches (default: 50)

    Returns:
        Elapsed time in seconds
    """
    start_time = time.time()

    sql_dir = test_outputs_dir / "sql"

    # Collect SQL paths from parameter if provided, otherwise scan directory
    if sql_paths is None:
        sql_paths = sorted(sql_dir.glob("test_*.db"))

    if use_direct_merge:
        log.info("Starting direct SQL merge of all test databases...")

        if len(sql_paths) == 0:
            log.error("No SQL databases found!")
            return 0.0

        log.info(
            f"Found {len(sql_paths)} SQL databases to merge using direct SQL merge..."
        )

        # Use direct SQL merge - much faster and uses less memory
        merge_sql_direct(
            merged_sql_path,
            *sql_paths,
            source=f"riscv_stress_generated_{num_tests}tests",
            source_key="direct_sql_merge",
        )

        elapsed_time = time.time() - start_time
        log.info(
            f"Direct SQL merge completed: {merged_sql_path} (took {elapsed_time:.2f}s)"
        )

    else:
        log.info("Starting Python merge of all SQL test readouts...")

        # Scan for all SQL files
        sql_files = sorted(sql_dir.glob("test_*.db"))
        if not sql_files:
            log.error(f"No SQL files found in {sql_dir}")
            return 0.0

        log.info(f"Found {len(sql_files)} SQL files to merge")

        def load_sql_file(sql_path):
            """Load a single SQL file"""
            try:
                accessor = SQLAccessor.File(sql_path)
                sql_reader = accessor.reader()
                readout = next(sql_reader.read_all())
                # Explicitly close the database connection
                accessor.engine.dispose()
                return readout
            except Exception as e:
                log.warning(f"Failed to load {sql_path}: {e}, skipping")
                return None

        # Interleaved load+merge: load batches and merge them incrementally to reduce memory
        batch_results = []
        if len(sql_files) > load_batch_size:
            log.info(
                f"Using interleaved load+merge with batch size {load_batch_size}..."
            )

            for batch_idx in range(0, len(sql_files), load_batch_size):
                batch_files = sql_files[batch_idx : batch_idx + load_batch_size]
                log.info(
                    f"Loading and merging batch {batch_idx // load_batch_size + 1}/{(len(sql_files) + load_batch_size - 1) // load_batch_size} ({len(batch_files)} files)"
                )

                # Load this batch in parallel
                import concurrent.futures
                import os

                max_workers = min(os.cpu_count() or 1, 8)
                with concurrent.futures.ThreadPoolExecutor(
                    max_workers=max_workers
                ) as executor:
                    results = list(executor.map(load_sql_file, batch_files))
                    readouts = [r for r in results if r is not None]

                # Merge this batch immediately
                if len(readouts) > 0:
                    batch_merged = (
                        MergeReadout(readouts[0], *readouts[1:])
                        if len(readouts) > 1
                        else readouts[0]
                    )
                    batch_results.append(batch_merged)
                    del readouts  # Free memory

            # Final merge of all batch results
            if len(batch_results) == 0:
                log.error("No SQL readouts to merge!")
                return 0.0

            log.info(f"Merging {len(batch_results)} batch results...")
            merged_readout = (
                MergeReadout(batch_results[0], *batch_results[1:])
                if len(batch_results) > 1
                else batch_results[0]
            )
        else:
            # Small number of files - load all then merge
            import concurrent.futures
            import os

            max_workers = min(os.cpu_count() or 1, 8)
            log.info(f"Loading {len(sql_files)} SQL files in parallel...")
            with concurrent.futures.ThreadPoolExecutor(
                max_workers=max_workers
            ) as executor:
                results = list(executor.map(load_sql_file, sql_files))
                readouts = [r for r in results if r is not None]

            if len(readouts) == 0:
                log.error("No SQL readouts to merge!")
                return 0.0

            merged_readout = (
                MergeReadout(readouts[0], *readouts[1:])
                if len(readouts) > 1
                else readouts[0]
            )

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
    use_direct_merge: bool = True,
    batch_size: int | None = None,
    archive_paths: list[Path] | None = None,
) -> float:
    """
    Merge all Archive test readouts into a single merged archive.

    Args:
        log: Logger instance
        test_outputs_dir: Directory containing test outputs
        num_tests: Number of tests to merge (or max expected)
        merged_archive_path: Path for merged Archive output
        use_direct_merge: If True, use direct archive merge (faster, less memory).
                         If False, use Python MergeReadout (legacy).

    Returns:
        Elapsed time in seconds
    """
    start_time = time.time()

    archive_dir = test_outputs_dir / "archive"

    # Use provided paths if available, otherwise scan directory
    if archive_paths is None:
        archive_files = sorted(archive_dir.glob("test_*.bktgz"))
    else:
        archive_files = archive_paths

    if not archive_files:
        log.error("No Archive files found!")
        return 0.0

    log.info(f"Found {len(archive_files)} Archive files to merge")

    if use_direct_merge:
        log.info("Using direct archive merge (fast path)...")

        # Use direct archive merge - much faster and uses less memory
        from bucket.rw.archive import merge_archive_direct

        merge_archive_direct(
            merged_archive_path,
            *archive_files,
            source=f"riscv_stress_generated_{num_tests}tests",
            source_key="direct_archive_merge",
            parallel=True,
            batch_size=batch_size,
        )

        elapsed_time = time.time() - start_time
        log.info(
            f"Direct archive merge completed: {merged_archive_path} (took {elapsed_time:.2f}s)"
        )
    else:
        log.info("Using Python merge (legacy path)...")

        def load_archive_file(archive_path):
            """Load a single Archive file"""
            try:
                accessor = ArchiveAccessor(archive_path)
                archive_reader = accessor.reader()
                readout = next(archive_reader.read_all())
                del archive_reader
                del accessor
                return readout
            except Exception as e:
                log.warning(f"Failed to load {archive_path}: {e}, skipping")
                return None

        # Load all archives in parallel
        import concurrent.futures
        import os

        max_workers = min(os.cpu_count() or 1, 8)
        log.info(f"Loading {len(archive_files)} Archive files in parallel...")

        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            results = list(executor.map(load_archive_file, archive_files))
            readouts = [r for r in results if r is not None]

        if len(readouts) == 0:
            log.error("No Archive readouts to merge!")
            return 0.0

        log.info(
            f"Merging {len(readouts)} Archive readouts using Python MergeReadout..."
        )
        merged_readout = (
            MergeReadout(readouts[0], *readouts[1:])
            if len(readouts) > 1
            else readouts[0]
        )

        # Export merged coverage
        archive_writer = ArchiveAccessor(merged_archive_path).writer()
        archive_writer.write(merged_readout)
        elapsed_time = time.time() - start_time
        log.info(
            f"Python merge completed: {merged_archive_path} (took {elapsed_time:.2f}s)"
        )

    return elapsed_time


def generate(
    output_dir: Path = Path("."),
    num_tests: int = 1000,
    seed: int = 42,
    skip_generation: bool = False,
    skip_json: bool = False,
    skip_sql_direct: bool = False,
    skip_sql_python: bool = False,
    skip_archive: bool = False,
    skip_merge: bool = False,
    rapid: int = 0,
    test_batch_sizes: bool = False,
    batch_size: int | None = None,
):
    """
    Generate synthetic coverage data for stress testing merge operations.

    Args:
        output_dir: Directory where outputs will be written
        num_tests: Number of synthetic readouts to generate (default: 1000)
        seed: Random seed for reproducibility (default: 42)
        skip_generation: If True, skip generating synthetic readouts (only merge existing files)
        skip_json: If True, skip JSON generation and merging
        skip_sql_direct: If True, skip direct SQL generation and merging
        skip_sql_python: If True, skip Python SQL generation and merging
        skip_archive: If True, skip Archive generation and merging
        skip_merge: If True, skip merging (only generate individual files)
        rapid: If > 0, generate this many tests then copy to reach num_tests (default: 0, disabled)
    """
    logging.basicConfig(level=logging.INFO)
    log = logging.getLogger("stress_data_generator")
    log.setLevel(logging.INFO)

    riscv_data = RISCVDataset()

    # Create output directory structure
    stress_output_dir = output_dir / "riscv_stress"
    test_outputs_dir = stress_output_dir / "test_outputs"
    test_outputs_dir.mkdir(parents=True, exist_ok=True)

    log.info("=" * 60)
    log.info("Stress Test Data Generator")
    log.info("=" * 60)

    if skip_generation:
        log.info("Skipping generation - will only merge existing files")
    else:
        if rapid > 0:
            log.info(
                f"Rapid mode: Generating up to {rapid} tests, then copying to reach {num_tests} total"
            )
        else:
            log.info(f"Generating {num_tests} synthetic readouts")
        log.info(f"Random seed: {seed}")

    log.info(f"Output directory: {stress_output_dir}")

    formats_enabled = []
    if not skip_json:
        formats_enabled.append("JSON")
    if not skip_sql_direct:
        formats_enabled.append("SQL Direct")
    if not skip_sql_python:
        formats_enabled.append("SQL Python")
    if not skip_archive:
        formats_enabled.append("Archive")

    if formats_enabled:
        log.info(f"Formats enabled: {', '.join(formats_enabled)}")
    else:
        log.warning("All formats are disabled - nothing to do!")
        return

    json_paths = []
    sql_paths = []
    archive_paths = []

    if not skip_generation:
        # Step 1: Generate definition structure from one real test
        definition = generate_definition(log, riscv_data, seed)

        # Step 2: Generate synthetic readouts
        # In rapid mode, only generate up to specified number of tests
        tests_to_generate = min(num_tests, rapid) if rapid > 0 else num_tests
        log.info(f"\nGenerating {tests_to_generate} synthetic readouts...")

        for test_num in range(tests_to_generate):
            try:
                # Use unique seed per test: base_seed + test_num + 1
                test_rand = random.Random(seed + test_num + 1)
                synthetic_readout = generate_synthetic_readout(
                    definition, test_num, test_rand
                )

                # Export to enabled formats
                # Note: We only need to export SQL once - both merge methods use the same files
                json_path, sql_path, archive_path = export_readout(
                    synthetic_readout,
                    test_num,
                    test_outputs_dir,
                    log,
                    skip_json=skip_json,
                    skip_sql=(skip_sql_direct and skip_sql_python),
                    skip_archive=skip_archive,
                )

                if json_path:
                    json_paths.append(json_path)
                if sql_path:
                    sql_paths.append(sql_path)
                if archive_path:
                    archive_paths.append(archive_path)

                if (test_num + 1) % 50 == 0:
                    log.info(
                        f"Generated {test_num + 1}/{tests_to_generate} synthetic readouts..."
                    )
            except Exception as e:
                log.error(f"Failed to generate test {test_num}: {e}")
                continue

        log.info(
            f"\nGenerated {len(json_paths)} JSON, {len(sql_paths)} SQL, {len(archive_paths)} Archive files"
        )

        # Step 3: In rapid mode, copy files to reach desired total
        if rapid > 0 and num_tests > tests_to_generate:
            import shutil

            log.info(
                f"\nRapid mode: Copying {tests_to_generate} files to reach {num_tests} total..."
            )

            copy_count = 0
            for test_num in range(tests_to_generate, num_tests):
                # Use modulo to cycle through source files
                source_idx = test_num % tests_to_generate

                try:
                    # Copy JSON files
                    if not skip_json and source_idx < len(json_paths):
                        source_json = json_paths[source_idx]
                        dest_json = source_json.parent / f"test_{test_num:03d}.json"
                        shutil.copy2(source_json, dest_json)
                        json_paths.append(dest_json)

                    # Copy SQL files
                    if not (skip_sql_direct and skip_sql_python) and source_idx < len(
                        sql_paths
                    ):
                        source_sql = sql_paths[source_idx]
                        dest_sql = source_sql.parent / f"test_{test_num:03d}.db"
                        shutil.copy2(source_sql, dest_sql)
                        sql_paths.append(dest_sql)

                    # Copy Archive files
                    if not skip_archive and source_idx < len(archive_paths):
                        source_archive = archive_paths[source_idx]
                        dest_archive = (
                            source_archive.parent / f"test_{test_num:03d}.bktgz"
                        )
                        shutil.copy2(source_archive, dest_archive)
                        archive_paths.append(dest_archive)

                    copy_count += 1
                    if (test_num + 1) % 100 == 0:
                        log.info(
                            f"Copied {copy_count}/{num_tests - tests_to_generate} files..."
                        )

                except Exception as e:
                    log.error(f"Failed to copy test {test_num}: {e}")
                    continue

            log.info(
                f"Copied {copy_count} files. Total: {len(json_paths)} JSON, {len(sql_paths)} SQL, {len(archive_paths)} Archive files"
            )
    else:
        # Collect existing file paths
        log.info(f"\nCollecting existing files from {test_outputs_dir}...")

        if not test_outputs_dir.exists():
            log.error(f"Test outputs directory does not exist: {test_outputs_dir}")
            log.error(
                "Cannot skip generation without existing files. Run without --skip-generation first."
            )
            return

        if not skip_json:
            json_dir = test_outputs_dir / "json"
            if json_dir.exists():
                # Scan for all matching JSON files
                for json_path in sorted(json_dir.glob("test_*.json")):
                    json_paths.append(json_path)
                log.info(f"Found {len(json_paths)} existing JSON files in {json_dir}")
            else:
                log.warning(f"JSON directory does not exist: {json_dir}")

        if not (skip_sql_direct and skip_sql_python):
            sql_dir = test_outputs_dir / "sql"
            if sql_dir.exists():
                # Scan for all matching SQL files
                for sql_path in sorted(sql_dir.glob("test_*.db")):
                    sql_paths.append(sql_path)
                log.info(f"Found {len(sql_paths)} existing SQL files in {sql_dir}")
            else:
                log.warning(f"SQL directory does not exist: {sql_dir}")

        if not skip_archive:
            archive_dir = test_outputs_dir / "archive"
            if archive_dir.exists():
                # Scan for all matching Archive files
                for archive_path in sorted(archive_dir.glob("test_*.bktgz")):
                    archive_paths.append(archive_path)
                log.info(
                    f"Found {len(archive_paths)} existing Archive files in {archive_dir}"
                )
            else:
                log.warning(f"Archive directory does not exist: {archive_dir}")

        # Limit to requested num_tests if specified
        max_files = max(len(json_paths), len(sql_paths), len(archive_paths))
        if max_files > num_tests:
            log.info(
                f"Found {max_files} files, but only using first {num_tests} as requested"
            )
            json_paths = json_paths[:num_tests]
            sql_paths = sql_paths[:num_tests]
            archive_paths = archive_paths[:num_tests]

    # Step 3: Merge and time all formats
    if not skip_merge:
        log.info("\n" + "=" * 60)
        log.info("Merging and timing all formats...")
        log.info("=" * 60)

        json_merge_time = None
        archive_merge_time = None
        direct_merge_time = None
        python_merge_time = None

        if not skip_json and json_paths:
            merged_json_path = stress_output_dir / "riscv_stress_merged.json"
            # Use actual file count instead of num_tests
            json_merge_time = merge_json_tests(
                log, test_outputs_dir, len(json_paths), merged_json_path
            )

        if sql_paths:
            if not skip_sql_direct:
                # Method 1: Direct SQL merge
                merged_sql_direct_path = (
                    stress_output_dir / "riscv_stress_merged_sql_direct.db"
                )
                direct_merge_time = merge_sql_tests(
                    log,
                    test_outputs_dir,
                    len(sql_paths),
                    merged_sql_direct_path,
                    use_direct_merge=True,
                    sql_paths=sql_paths,
                )

            if not skip_sql_python:
                # Method 2: Python MergeReadout
                merged_sql_python_path = (
                    stress_output_dir / "riscv_stress_merged_sql_python.db"
                )
                python_merge_time = merge_sql_tests(
                    log,
                    test_outputs_dir,
                    len(sql_paths),
                    merged_sql_python_path,
                    use_direct_merge=False,
                    sql_paths=sql_paths,
                )

            # Show comparison if both methods were run
            if direct_merge_time is not None and python_merge_time is not None:
                log.info("\nSQL Merge Method Comparison:")
                log.info(f"  Direct SQL merge: {direct_merge_time:.2f}s")
                log.info(f"  Python MergeReadout: {python_merge_time:.2f}s")
                if direct_merge_time > 0:
                    speedup = python_merge_time / direct_merge_time
                    log.info(
                        f"  Direct merge is {speedup:.2f}x faster than Python merge"
                    )

        if not skip_archive and archive_paths:
            merged_archive_path = (
                stress_output_dir / "riscv_stress_merged_archive.bktgz"
            )
            # Use actual file count instead of num_tests
            if test_batch_sizes:
                # Test different batch sizes
                batch_sizes_to_test = [
                    50,
                    100,
                    200,
                    500,
                    1000,
                    None,
                ]  # None = no batching
                log.info("\nTesting different batch sizes for Archive merge...")
                batch_times = {}
                for bs in batch_sizes_to_test:
                    bs_label = f"batch={bs}" if bs else "no_batching"
                    log.info(f"  Testing {bs_label}...")
                    test_merged_path = (
                        stress_output_dir
                        / f"riscv_stress_merged_archive_{bs_label}.bktgz"
                    )
                    bs_time = merge_archive_tests(
                        log,
                        test_outputs_dir,
                        len(archive_paths),
                        test_merged_path,
                        batch_size=bs,
                        archive_paths=archive_paths,
                    )
                    batch_times[bs_label] = bs_time
                    log.info(f"    Completed in {bs_time:.2f}s")

                # Report batch size results
                log.info("\n" + "=" * 60)
                log.info("Batch Size Test Results")
                log.info("=" * 60)
                sorted_times = sorted(batch_times.items(), key=lambda x: x[1])
                for label, elapsed in sorted_times:
                    log.info(f"  {label}: {elapsed:.2f}s")
                log.info(
                    f"\nFastest batch size: {sorted_times[0][0]} ({sorted_times[0][1]:.2f}s)"
                )

                # Use fastest for comparison
                archive_merge_time = sorted_times[0][1]
            else:
                archive_merge_time = merge_archive_tests(
                    log,
                    test_outputs_dir,
                    len(archive_paths),
                    merged_archive_path,
                    batch_size=batch_size,
                    archive_paths=archive_paths,
                )
    else:
        log.info("\nSkipping merge - individual files generated only")
        json_merge_time = None
        archive_merge_time = None

    # Report timing comparison
    if not skip_merge:
        log.info("\n" + "=" * 60)
        log.info("Merge Performance Summary")
        log.info("=" * 60)
        log.info(f"Individual test outputs: {test_outputs_dir}")

        if json_merge_time is not None:
            log.info(f"Merged JSON: {stress_output_dir / 'riscv_stress_merged.json'}")
            log.info(f"  JSON merge time: {json_merge_time:.2f}s")

        if direct_merge_time is not None:
            log.info(
                f"Merged SQL (Direct): {stress_output_dir / 'riscv_stress_merged_sql_direct.db'}"
            )
            log.info(f"  Direct SQL merge time: {direct_merge_time:.2f}s")

        if python_merge_time is not None:
            log.info(
                f"Merged SQL (Python): {stress_output_dir / 'riscv_stress_merged_sql_python.db'}"
            )
            log.info(f"  Python SQL merge time: {python_merge_time:.2f}s")

        if archive_merge_time is not None:
            log.info(
                f"Merged Archive: {stress_output_dir / 'riscv_stress_merged_archive.bktgz'}"
            )
            log.info(f"  Archive merge time: {archive_merge_time:.2f}s")

        # Compare all formats
        times = []
        if json_merge_time is not None:
            times.append(("JSON", json_merge_time))
        if direct_merge_time is not None:
            times.append(("SQL Direct", direct_merge_time))
        if python_merge_time is not None:
            times.append(("SQL Python", python_merge_time))
        if archive_merge_time is not None:
            times.append(("Archive", archive_merge_time))

        if len(times) > 1:
            times.sort(key=lambda x: x[1])
            fastest = times[0]
            log.info(f"\nFastest format: {fastest[0]} ({fastest[1]:.2f}s)")
            for name, time_val in times[1:]:
                speedup = time_val / fastest[1]
                log.info(f"  {name} was {speedup:.2f}x slower than {fastest[0]}")

        log.info("\nTo view coverage, open the merged files in the Bucket viewer")
    else:
        log.info("\n" + "=" * 60)
        log.info("Generation Complete")
        log.info("=" * 60)
        log.info(f"Individual test outputs: {test_outputs_dir}")
        log.info(f"  - {len(json_paths)} JSON files")
        log.info(f"  - {len(sql_paths)} SQL files")
        log.info(f"  - {len(archive_paths)} Archive files")
        log.info("\nRun again without --skip-merge to merge and time the operations")

    log.info("=" * 60)


def main():
    """Command-line interface for the stress data generator."""
    parser = argparse.ArgumentParser(
        description="Generate synthetic coverage data for stress testing merge operations"
    )
    parser.add_argument(
        "--num-tests",
        type=int,
        default=1000,
        help="Number of synthetic readouts to generate (default: 1000)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducibility (default: 42)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=".",
        help="Output directory path (default: current directory)",
    )
    parser.add_argument(
        "--skip-generation",
        action="store_true",
        help="Skip generating synthetic readouts (only merge existing files)",
    )
    parser.add_argument(
        "--skip-json",
        default=True,
        action="store_true",
        help="Skip JSON generation and merging",
    )
    parser.add_argument(
        "--skip-sql-direct",
        action="store_true",
        help="Skip direct SQL generation and merging",
    )
    parser.add_argument(
        "--skip-sql-python",
        default=True,
        action="store_true",
        help="Skip Python SQL generation and merging",
    )
    parser.add_argument(
        "--skip-archive",
        action="store_true",
        help="Skip Archive generation and merging",
    )
    parser.add_argument(
        "--test-batch-sizes",
        action="store_true",
        help="Test different batch sizes for archive merging (50, 100, 200, 500, 1000, None)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=None,
        help="Batch size for archive merging (hierarchical merging, default: None = no batching)",
    )
    parser.add_argument(
        "--skip-merge",
        action="store_true",
        help="Skip merging (only generate individual files)",
    )
    parser.add_argument(
        "--rapid",
        type=int,
        nargs="?",
        const=100,
        default=0,
        help="Rapid mode: Generate this many tests, then copy to reach total (default: 100 if flag used, 0/disabled otherwise)",
    )

    args = parser.parse_args()

    generate(
        output_dir=Path(args.output_dir),
        num_tests=args.num_tests,
        seed=args.seed,
        skip_generation=args.skip_generation,
        skip_json=args.skip_json,
        skip_sql_direct=args.skip_sql_direct,
        skip_sql_python=args.skip_sql_python,
        skip_archive=args.skip_archive,
        skip_merge=args.skip_merge,
        rapid=args.rapid,
        test_batch_sizes=args.test_batch_sizes,
        batch_size=args.batch_size,
    )


if __name__ == "__main__":
    main()
