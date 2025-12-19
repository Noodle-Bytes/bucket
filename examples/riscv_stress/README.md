<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved
  -->

# RISC-V Stress Test

This stress test example demonstrates large-scale coverage collection, export, and merging with the Bucket coverage system. It generates extensive coverage data across multiple RISC-V instruction categories and tests the performance of merging many coverage runs.

## Overview

The stress test creates a comprehensive coverage tree covering various aspects of RISC-V instruction execution:

- **10 Coverage Modules**: Each module focuses on different aspects of RISC-V instruction processing
- **Deep Nesting**: Coverage groups and coverpoints are organized in a hierarchical tree structure
- **Large Bucket Space**: Thousands of coverage buckets across multiple dimensions
- **Multiple Export Formats**: Supports both SQL and Archive (.bktgz) export formats
- **Merge Performance Testing**: Compares merge speeds between SQL and Archive formats

## How It Works

### Coverage Generation

1. **Coverage Tree Structure**: The `StressTop` class creates a top-level coverage tree containing 10 modules:
   - Module 0: Instruction formats (R-type, I-type, B-type)
   - Module 1: Memory operations
   - Module 2: Pipeline stages
   - Module 3: Exceptions
   - Module 4: Register file
   - Module 5: Control flow
   - Module 6: Arithmetic operations
   - Module 7: Logical operations
   - Module 8: System instructions
   - Module 9: Compare operations

2. **Sampling Process**: For each test run:
   - A `StressTop` coverage instance is created
   - Random instruction traces are generated using `generate_trace()`
   - Each trace contains instruction properties (opcode, format, registers, etc.)
   - Coverage is sampled by calling `cvg.sample(trace)` for each generated trace
   - The number of samples per test varies (100-500) to create diverse coverage patterns

3. **Data Generation**: Each test run uses a unique random seed (base_seed + test_num) to ensure:
   - Different instruction traces across runs
   - Varied coverage patterns
   - Reproducible results when using the same base seed

### Export Formats

The stress test supports exporting coverage data in two formats:

#### SQL Format (`.db`)
- Uses SQLite database for storage
- Efficient for querying and analysis
- Good for large-scale data management
- Access via `SQLAccessor.File(path)`

#### Archive Format (`.bktgz`)
- Compressed tar archive format
- Self-contained and portable
- Optimized for viewer loading
- Access via `ArchiveAccessor(path)`

Both formats can be exported simultaneously for each test run, allowing performance comparison of merge operations.

### Merge Operations

Coverage from multiple test runs can be merged into a single readout:

1. **Loading Readouts**: All individual test files are loaded from their respective directories
2. **Merging**: `MergeReadout` combines hit counts across all readouts
3. **Export**: The merged readout is exported to the chosen format
4. **Timing**: Merge operations are timed to compare SQL vs Archive performance

**Important**: All readouts being merged must have:
- The same `def_sha` (definition structure)
- The same `rec_sha` (record/context hash)

This ensures the coverage structure is identical across all runs.

## Usage

### Basic Usage

Run 1000 tests with both SQL and Archive export:

```python
from examples.riscv_stress.stress_example import run
from pathlib import Path

run(
    output_dir=Path("./output"),
    num_tests=1000,
    seed=42,
    export_formats=["both"]
)
```

### Export Only SQL

```python
run(
    output_dir=Path("./output"),
    num_tests=1000,
    seed=42,
    export_formats=["sql"]
)
```

### Export Only Archive

```python
run(
    output_dir=Path("./output"),
    num_tests=1000,
    seed=42,
    export_formats=["archive"]
)
```

### Command Line

```bash
cd examples/riscv_stress
python -m stress_example
```

## Synthetic Data Generator

For testing merge operations without running the full 1000 tests, use the `generate_stress_data.py` tool. This tool:

1. **Generates one real test** to capture the complete coverage definition structure
2. **Creates synthetic readouts** with random hit data matching the definition
3. **Exports to all three formats** (JSON, SQL, Archive) simultaneously
4. **Merges and times** all three formats for performance comparison

### Quick Start

Generate 1000 synthetic readouts (default):

```bash
cd examples/riscv_stress
python -m generate_stress_data
```

### Custom Options

```bash
# Generate 500 synthetic readouts
python -m generate_stress_data --num-tests 500

# Use a custom seed
python -m generate_stress_data --num-tests 1000 --seed 123

# Specify output directory
python -m generate_stress_data --num-tests 2000 --output-dir ./my_output

# Skip generation, only merge existing files
python -m generate_stress_data --skip-generation --num-tests 1000

# Skip specific formats
python -m generate_stress_data --skip-json --skip-archive  # Only generate SQL

# Skip merging (only generate individual files)
python -m generate_stress_data --skip-merge

# Combine options: only merge existing SQL files
python -m generate_stress_data --skip-generation --skip-json --skip-archive --num-tests 1000
```

### Python API

```python
from examples.riscv_stress.generate_stress_data import generate
from pathlib import Path

# Default: 1000 tests
generate()

# Custom configuration
generate(
    output_dir=Path("./output"),
    num_tests=500,
    seed=42
)

# Skip generation, only merge existing files
generate(
    output_dir=Path("./output"),
    num_tests=1000,
    skip_generation=True
)

# Skip specific formats
generate(
    output_dir=Path("./output"),
    num_tests=1000,
    skip_json=True,
    skip_archive=True  # Only generate/merge SQL
)

# Skip merging
generate(
    output_dir=Path("./output"),
    num_tests=1000,
    skip_merge=True  # Only generate individual files
)
```

### How It Works

1. **Definition Capture**: Runs one real test with `StressTop` to extract the complete coverage tree structure (points, axes, goals, bucket_goals, def_sha)

2. **Synthetic Generation**: For each synthetic test:
   - Generates random `bucket_hits` (0 to 1000 hits per bucket)
   - Calculates corresponding `point_hits` by aggregating bucket hits within each point's range
   - Creates unique `rec_sha`, `source`, and `source_key` for each readout
   - Uses the same `def_sha` from the template

3. **Multi-Format Export**: Each synthetic readout is exported to:
   - **JSON format**: Individual `.json` files
   - **SQL format**: Individual `.db` files
   - **Archive format**: Individual `.bktgz` files

4. **Merge and Timing**: After generation, merges all readouts for each format and reports:
   - Individual merge times for JSON, SQL, and Archive
   - Relative performance comparison
   - Speedup ratios between formats

### Output Structure

The generator creates the same output structure as `stress_example.py`, plus JSON files:

```
output/
├── riscv_stress/
│   ├── test_outputs/
│   │   ├── json/
│   │   │   ├── test_000.json
│   │   │   ├── test_001.json
│   │   │   └── ...
│   │   ├── sql/
│   │   │   ├── test_000.db
│   │   │   ├── test_001.db
│   │   │   └── ...
│   │   └── archive/
│   │       ├── test_000.bktgz
│   │       ├── test_001.bktgz
│   │       └── ...
│   ├── riscv_stress_merged.json
│   ├── riscv_stress_merged_sql.db
│   └── riscv_stress_merged_archive.bktgz
```

### Benefits

- **Fast**: Generates synthetic data much faster than running real tests
- **Reproducible**: Uses random seeds for consistent results
- **Comprehensive**: Tests all three export formats (JSON, SQL, Archive)
- **Performance Testing**: Directly compares merge performance across formats

### Skip Options

The generator supports several skip options for flexible workflows:

- `--skip-generation`: Skip generating synthetic readouts (only merge existing files)
- `--skip-json`: Skip JSON generation and merging
- `--skip-sql`: Skip SQL generation and merging
- `--skip-archive`: Skip Archive generation and merging
- `--skip-merge`: Skip merging (only generate individual files)

**Examples:**
- Generate only SQL files: `--skip-json --skip-archive`
- Merge existing files without regenerating: `--skip-generation`
- Generate files without merging: `--skip-merge`
- Test merge performance on existing SQL files: `--skip-generation --skip-json --skip-archive`

### Use Cases

- Testing merge operations at scale without waiting for 1000 real tests
- Comparing merge performance between JSON, SQL, and Archive formats
- Validating merge correctness with known synthetic data
- Stress testing the merge infrastructure
- Re-running merges on existing data without regenerating
- Testing individual format performance in isolation

## Output Structure

```
output/
├── riscv_stress/
│   ├── test_outputs/
│   │   ├── sql/
│   │   │   ├── test_000.db
│   │   │   ├── test_001.db
│   │   │   └── ...
│   │   └── archive/
│   │       ├── test_000.bktgz
│   │       ├── test_001.bktgz
│   │       └── ...
│   ├── riscv_stress_merged_sql.db
│   └── riscv_stress_merged_archive.bktgz
```

## Performance Testing

The stress test includes timing measurements for merge operations:

- **SQL Merge**: Times the process of loading all SQL files and merging
- **Archive Merge**: Times the process of loading all Archive files and merging
- **Comparison**: Reports relative performance differences

This helps identify which format is faster for merge operations at scale.

## Module Structure

Each module in `stress_modules/` defines specific coverage points:

- **Covergroups**: Organize related coverpoints hierarchically
- **Coverpoints**: Define the actual coverage buckets with axes and goals
- **Axes**: Define dimensions of coverage (e.g., opcode, register, immediate value)
- **Goals**: Set targets for coverage buckets (target hits, ignore flags)

The modular structure makes it easy to:
- Add new coverage modules
- Modify existing coverage definitions
- Test specific aspects of the coverage system

## Viewing Coverage

After running the stress test and merging, open the merged file in the Bucket viewer:

```bash
# For Archive format
bucket view riscv_stress_merged_archive.bktgz

# For SQL format
bucket view riscv_stress_merged_sql.db
```

The viewer will display the complete coverage tree with hit counts aggregated across all test runs.
