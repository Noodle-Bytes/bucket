<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
  -->

# Bucket - AI Coding Agent Instructions

## Project Overview
Bucket is a Python library for functional coverage collection, designed as a vendor-independent alternative to commercial EDA coverage tools. It enables coverage tracking in Python testbenches (e.g., cocotb) without requiring commercial licenses.

## Architecture

### Core Component Hierarchy
Coverage is organized in a tree structure:
- **Covertop**: Root of coverage tree ([../bucket/covertop.py](../bucket/covertop.py))
  - **Covergroups**: Organizational containers ([../bucket/covergroup.py](../bucket/covergroup.py))
    - **Coverpoints**: Individual coverage items with axes and buckets ([../bucket/coverpoint.py](../bucket/coverpoint.py))
      - **Axes**: Coverage dimensions ([../bucket/axis.py](../bucket/axis.py))
      - **Buckets**: Cross-product of axis values with hit tracking ([../bucket/bucket.py](../bucket/bucket.py))

### Data Flow Pattern
1. **Setup Phase**: Define coverage tree within `CoverageContext` ([../bucket/context.py](../bucket/context.py))
   - Context provides shared data (e.g., ISA constants) to coverpoints during `setup()`
   - Use context manager: `with CoverageContext(pet_info=info): cvg = TopCoverage(...)`
2. **Sampling**: Pass trace objects to `Covertop.sample(trace)` which recursively propagates to children
3. **Export**: Write coverage data via readers/writers in [../bucket/rw/](../bucket/rw/)

### Key Design Patterns

**Coverpoint Definition Pattern** (see [../examples/pets/cats.py](../examples/pets/cats.py)):
```python
class MyCoverpoint(Coverpoint):
    DESCRIPTION = "What is being covered"
    MOTIVATION = "Why we're covering this"
    TIER = 0  # 0 = highest priority
    TAGS = ["tag1", "tag2"]

    def setup(self, ctx):
        # Access shared data from CoverageContext
        names = ctx.pet_info.pet_names

        # Add axes (dimensions of coverage)
        self.add_axis(name="age", values=[0, 1, [2, 5], 6])  # Ranges: [min, max]
        self.add_axis(name="name", values=names)

        # Define bucket goals (optional)
        self.add_goal("ILLEGAL_COMBO", illegal=True, description="...")

    def apply_goals(self, bucket, goals):
        # Map buckets to goals based on axis combinations
        if bucket.age < 3 and bucket.name == "invalid":
            return goals.ILLEGAL_COMBO
```

**Bucket Sampling Pattern** (in `_sample()` method):
```python
# Pattern 1: Set all axes at once
self.bucket.hit(name=trace.name, age=trace.age)

# Pattern 2: Iterative sampling with partial axis setting
self.bucket.clear()
self.bucket.set_axes(name=trace.name)
for toy in trace.toys:
    self.bucket.set_axes(toy=toy)
    self.bucket.hit()

# Pattern 3: Using context manager
with self.bucket as bucket:
    bucket.set_axes(name=trace.name, age=trace.age)
    bucket.hit()
```

### Storage & Export System
Located in [../bucket/rw/](../bucket/rw/):
- **Accessors**: File format handlers (SQL, JSON, Archive/tarball)
- **Common**: Base classes `Reader`, `Writer`, `Accessor`, `Readout`
- **Archive**: Tarball format (`.bktgz`) with CSV files - preferred for merging multiple test runs
- **SQL**: SQLAlchemy-based storage
- **HTML**: Browser-based viewer output (uses [../viewer/](../viewer/) React/TypeScript app)
- **Console**: Text output via `rich` library

### CLI Commands
Entry point: [../bucket/__main__.py](../bucket/__main__.py) using `click` framework

```bash
# Write coverage to different formats
bucket write [json|sql|archive|html|console] -r <input> -o <output>

# Merge multiple coverage sources
bucket write json --merge -r sql:file1.db -r archive:file2.bktgz -o merged.json

# Read format: [record@][type:]URI
# Examples:
#   archive:example.bktgz          # All records from archive
#   0@sql:coverage.db              # Record 0 from SQL DB
#   example.json                   # Type inferred from extension
```

## Development Workflows

### Running Examples
```bash
./bin/shell  # Activates virtual environment with correct setup
python -m examples.pets.example  # Main example demonstrating coverage tree
python -m examples.riscv_stress.stress_example  # Larger RISC-V example
```

### Testing
Uses pytest ([../tests/](../tests/)):
```bash
pytest                          # Run all tests
pytest tests/test_basic.py     # Run specific test
pytest --cov=bucket            # With coverage report
```

### Viewer Development
Browser-based coverage viewer ([../viewer/](../viewer/)) built with Vite + React + TypeScript:
```bash
cd viewer
npm install
npm run dev  # Development server
npm run build  # Production build
```

### Package Management
Uses `uv` (modern Python package manager) and `hatchling`:
```bash
uv sync              # Install dependencies from uv.lock
uv run python -m examples.pets.example  # Run with uv environment
```

## Critical Conventions

### Filtering System
Coverage can be filtered without breaking merge compatibility:
- `include_by_name()`, `exclude_by_name()`, `restrict_by_name()`: Filter by name patterns
- `include_by_function()`, `exclude_by_function()`: Filter using custom functions
- `include_by_tier()`: Filter by tier level
- `include_by_tags()`, `exclude_by_tags()`: Filter by tags
- SHA validation ensures filtered coverage merges only with compatible definitions

### Source Tracking
`Covertop` accepts `source` and `source_key` parameters:
- **source**: Test/run identifier (e.g., test name)
- **source_key**: Additional metadata (e.g., seed value)
- Stored as strings, always default to `""` (empty string), never `None`
- See [../bucket/rw/archive.py](../bucket/rw/archive.py) CSV handling for storage details

### Axis Value Specification
Axes support multiple value formats:
- **List/tuple/set**: Auto-named values `[0, 1, 2, 3]`
- **Dict**: Named values `{"small": 0, "medium": [1, 5], "large": [6, 10]}`
- **Ranges**: Two-element lists `[min, max]` (inclusive)
- **enable_other**: Catch-all bucket for unspecified values

### SHA-based Validation
Coverage definitions generate SHA256 hashes from:
- Coverpoint/group names and descriptions
- Axis names, descriptions, and values
- Goal configurations
Used to validate merge compatibility across test runs

## File Structure Notes

- [../bucket/common/](../bucket/common/): Shared types, exceptions, chain/link pattern for SHA validation
- [../bucket/axisutils.py](../bucket/axisutils.py): Helper functions to generate common axis patterns (bit ranges, power-of-2, etc.)
- [../examples/](../examples/): Full working examples - start here for patterns
- [../docs/](../docs/): Detailed documentation of coverpoints, covergroups, goals, filtering
- [../bin/shell](../bin/shell): Environment setup script
- [../electron/](../electron/): Electron app wrapper for viewer (desktop application)

## Common Gotchas

1. **Context Requirement**: Always wrap `Covertop` instantiation in `CoverageContext` when coverpoints need shared data
2. **Setup Method**: Coverpoints must implement `setup(self, ctx)` - raises `NotImplementedError` if missing
3. **Bucket Clearing**: Call `bucket.clear()` when reusing bucket with different axis values across iterations
4. **Source as Strings**: `source` and `source_key` are always strings, stored as `""` not `None`
5. **Range Syntax**: Ranges are `[min, max]` not `range(min, max+1)`
6. **Merge Compatibility**: SHA mismatches prevent merging - ensure consistent coverage definitions
