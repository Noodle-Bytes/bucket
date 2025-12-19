#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

"""
Benchmark suite for comparing SQL Direct vs Archive Direct merge performance
Generates data from 10 to 100,000 tests with incremental steps and graphs results.
"""

import json
import logging
import subprocess
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
log = logging.getLogger("benchmark_suite")


def generate_test_counts():
    """Generate test count sequence: 10-100 by 10s, 100-1000 by 100s, 1000-10000 by 1000s, 10000-100000 by 10000s"""
    counts = []

    # 10, 20, 30, ..., 100
    for i in range(10, 101, 10):
        counts.append(i)

    # 200, 300, ..., 1000
    for i in range(200, 1001, 100):
        counts.append(i)

    # 2000, 3000, ..., 10000
    for i in range(2000, 10001, 1000):
        counts.append(i)

    # 20000, 30000, ..., 100000
    for i in range(20000, 100001, 10000):
        counts.append(i)

    return counts


def run_benchmark(
    num_tests: int, output_dir: Path, skip_generation: bool = False
) -> dict:
    """
    Run benchmark for specified number of tests.
    Returns dict with timing results.
    """
    log.info(f"\n{'='*80}")
    log.info(f"Running benchmark for {num_tests} tests...")
    log.info(f"{'='*80}")

    cmd = [
        "python",
        "-m",
        "examples.riscv_stress.generate_stress_data",
        "--num-tests",
        str(num_tests),
        "--output-dir",
        str(output_dir),
        "--skip-json",
        "--skip-sql-python",
        "--skip-merge",  # We'll do merge timing separately
        "--rapid",
        "10",  # Fast generation - we only care about merge times
    ]

    if skip_generation:
        cmd.append("--skip-generation")

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        log.error(f"Benchmark failed for {num_tests} tests!")
        log.error(result.stderr)
        return None

    # Now run merges separately to get timing
    results = {"num_tests": num_tests}

    # SQL Direct merge
    log.info(f"  Merging SQL Direct ({num_tests} files)...")
    cmd_sql = [
        "python",
        "-m",
        "examples.riscv_stress.generate_stress_data",
        "--num-tests",
        str(num_tests),
        "--output-dir",
        str(output_dir),
        "--skip-generation",
        "--skip-json",
        "--skip-sql-python",
        "--skip-archive",
    ]

    result_sql = subprocess.run(cmd_sql, capture_output=True, text=True)

    # Parse SQL timing from output (logging goes to stderr)
    output_sql = result_sql.stdout + result_sql.stderr
    for line in output_sql.split("\n"):
        if "Direct SQL merge time:" in line or "SQL direct merge time:" in line:
            # Extract time value
            time_str = line.split(":")[-1].strip().rstrip("s")
            try:
                results["sql_time"] = float(time_str)
                log.info(f"    SQL Direct: {results['sql_time']:.2f}s")
            except ValueError:
                log.warning(f"Failed to parse SQL time from: {line}")
            break

    # Archive Direct merge
    log.info(f"  Merging Archive Direct ({num_tests} files)...")
    cmd_archive = [
        "python",
        "-m",
        "examples.riscv_stress.generate_stress_data",
        "--num-tests",
        str(num_tests),
        "--output-dir",
        str(output_dir),
        "--skip-generation",
        "--skip-json",
        "--skip-sql-direct",
        "--skip-sql-python",
    ]

    result_archive = subprocess.run(cmd_archive, capture_output=True, text=True)

    # Parse Archive timing from output (logging goes to stderr)
    output_archive = result_archive.stdout + result_archive.stderr
    for line in output_archive.split("\n"):
        if "Archive merge time:" in line:
            # Extract time value
            time_str = line.split(":")[-1].strip().rstrip("s")
            try:
                results["archive_time"] = float(time_str)
                log.info(f"    Archive Direct: {results['archive_time']:.2f}s")
            except ValueError:
                log.warning(f"Failed to parse Archive time from: {line}")
            break

    if "sql_time" in results and "archive_time" in results:
        ratio = results["sql_time"] / results["archive_time"]
        log.info(f"    Ratio (SQL/Archive): {ratio:.2f}x")
        results["ratio"] = ratio

    return results


def main():
    """Main benchmark suite execution"""
    output_dir = Path("riscv_stress_benchmark")
    results_file = output_dir / "benchmark_results.json"

    # Generate test sequence
    test_counts = generate_test_counts()
    log.info(f"Test sequence: {len(test_counts)} data points")
    log.info(f"Range: {test_counts[0]} to {test_counts[-1]} tests")
    log.info(f"Output directory: {output_dir}")

    # Start from highest count and work backwards (generate once, reuse)
    log.info("\nGenerating test data from largest to smallest...")

    results = []

    # Generate 100,000 tests first
    largest_count = test_counts[-1]
    log.info(f"\nStep 1: Generating {largest_count} test files...")
    result = run_benchmark(largest_count, output_dir, skip_generation=False)
    if result:
        results.append(result)

    # Now work backwards through remaining counts
    for num_tests in reversed(test_counts[:-1]):
        result = run_benchmark(num_tests, output_dir, skip_generation=True)
        if result:
            results.insert(0, result)  # Insert at beginning to maintain order

        # Save intermediate results
        with open(results_file, "w") as f:
            json.dump(results, f, indent=2)

    # Final save
    with open(results_file, "w") as f:
        json.dump(results, f, indent=2)

    log.info(f"\n{'='*80}")
    log.info("Benchmark suite complete!")
    log.info(f"Results saved to: {results_file}")
    log.info(f"{'='*80}")

    # Print summary table
    print("\n\nSummary Table:")
    print(f"{'Tests':<12} {'SQL (s)':<12} {'Archive (s)':<12} {'Ratio':<12}")
    print("-" * 48)
    for r in results:
        sql_time = r.get("sql_time", 0)
        archive_time = r.get("archive_time", 0)
        ratio = r.get("ratio", 0)
        print(
            f"{r['num_tests']:<12} {sql_time:<12.2f} {archive_time:<12.2f} {ratio:<12.2f}"
        )

    # Now create the graph
    try:
        create_graph(results, output_dir / "benchmark_graph.png")
    except ImportError:
        log.warning("matplotlib not installed - skipping graph generation")
        log.info("Install with: pip install matplotlib")


def create_graph(results: list, output_path: Path):
    """Create performance comparison graph"""
    import matplotlib.pyplot as plt

    log.info(f"\nGenerating graph: {output_path}")

    test_counts = [r["num_tests"] for r in results]
    sql_times = [r.get("sql_time", 0) for r in results]
    archive_times = [r.get("archive_time", 0) for r in results]

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))

    # Plot 1: Absolute times
    ax1.plot(test_counts, sql_times, marker="o", label="SQL Direct", linewidth=2)
    ax1.plot(
        test_counts, archive_times, marker="s", label="Archive Direct", linewidth=2
    )
    ax1.set_xlabel("Number of Tests")
    ax1.set_ylabel("Merge Time (seconds)")
    ax1.set_title("SQL Direct vs Archive Direct Merge Performance")
    ax1.legend()
    ax1.grid(True, alpha=0.3)
    ax1.set_xscale("log")
    ax1.set_yscale("log")

    # Plot 2: Ratio (SQL/Archive)
    ratios = [r.get("ratio", 1) for r in results]
    ax2.plot(test_counts, ratios, marker="o", color="purple", linewidth=2)
    ax2.axhline(y=1, color="red", linestyle="--", label="Equal Performance")
    ax2.set_xlabel("Number of Tests")
    ax2.set_ylabel("Speed Ratio (SQL Time / Archive Time)")
    ax2.set_title("Performance Ratio: SQL Direct vs Archive Direct")
    ax2.legend()
    ax2.grid(True, alpha=0.3)
    ax2.set_xscale("log")

    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    log.info(f"Graph saved to: {output_path}")


if __name__ == "__main__":
    main()
