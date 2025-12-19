#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

"""
Small test of benchmark suite with first few data points
"""

import json
import logging
import subprocess
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
log = logging.getLogger("benchmark_test")


def run_benchmark(
    num_tests: int, output_dir: Path, skip_generation: bool = False
) -> dict:
    """Run benchmark for specified number of tests"""
    log.info(f"\nBenchmarking {num_tests} tests...")

    cmd = [
        "./bin/shell",
        "-c",
        f"python -m examples.riscv_stress.generate_stress_data "
        f"--num-tests {num_tests} "
        f"--output-dir {output_dir} "
        f"--skip-json --skip-sql-python "
        f"{'--skip-generation' if skip_generation else ''}",
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        log.error(f"Benchmark failed for {num_tests} tests!")
        log.error(result.stderr)
        return None

    # Parse timing from output
    results = {"num_tests": num_tests}

    # Combine stdout and stderr
    output = result.stdout + result.stderr

    for line in output.split("\n"):
        if "Direct SQL merge time:" in line or "SQL direct merge time:" in line:
            time_str = line.split(":")[-1].strip().rstrip("s")
            try:
                results["sql_time"] = float(time_str)
            except ValueError:
                log.warning(f"Failed to parse SQL time from: {line}")
        elif "Archive merge time:" in line:
            time_str = line.split(":")[-1].strip().rstrip("s")
            try:
                results["archive_time"] = float(time_str)
            except ValueError:
                log.warning(f"Failed to parse Archive time from: {line}")

    if "sql_time" in results and "archive_time" in results:
        ratio = results["sql_time"] / results["archive_time"]
        results["ratio"] = ratio
        log.info(
            f"  SQL: {results['sql_time']:.2f}s, Archive: {results['archive_time']:.2f}s, Ratio: {ratio:.2f}x"
        )

    return results


def main():
    """Test with small sequence"""
    output_dir = Path("riscv_stress_benchmark")
    results_file = output_dir / "benchmark_test_results.json"

    # Small test sequence: 10, 20, 30, 40, 50, 100, 200
    test_counts = [10, 20, 30, 40, 50, 100, 200]
    log.info(f"Test sequence: {test_counts}")

    results = []

    # Generate largest first (200)
    log.info(f"\nGenerating {test_counts[-1]} test files...")
    result = run_benchmark(test_counts[-1], output_dir, skip_generation=False)
    if result:
        results.append(result)

    # Now work backwards
    for num_tests in reversed(test_counts[:-1]):
        result = run_benchmark(num_tests, output_dir, skip_generation=True)
        if result:
            results.insert(0, result)

        # Save intermediate results
        output_dir.mkdir(parents=True, exist_ok=True)
        with open(results_file, "w") as f:
            json.dump(results, f, indent=2)

    log.info(f"\nTest complete! Results saved to: {results_file}")

    # Print summary
    print("\n\nSummary:")
    print(f"{'Tests':<12} {'SQL (s)':<12} {'Archive (s)':<12} {'Ratio':<12}")
    print("-" * 48)
    for r in results:
        sql_time = r.get("sql_time", 0)
        archive_time = r.get("archive_time", 0)
        ratio = r.get("ratio", 0)
        print(
            f"{r['num_tests']:<12} {sql_time:<12.2f} {archive_time:<12.2f} {ratio:<12.2f}"
        )


if __name__ == "__main__":
    main()
