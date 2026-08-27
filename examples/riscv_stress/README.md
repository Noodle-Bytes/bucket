<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
  -->

# RISC-V stress example

This example builds a large, nested coverage tree and uses it in two ways:

1. **Sampling** — call `Covertop.sample()` on the full tree (and optionally on
   replicated copies of it) and measure samples per second.
2. **Merging** — export many compatible records and time
   `ArchiveAccessor.merge_files()` / `SQLAccessor.merge_files()` /
   `JSONAccessor.merge_files()`.

The tree has ten RISC-V-themed modules (instruction formats, memory, pipeline,
exceptions, register file, control flow, arithmetic, logical, system, compare).
Covergroups override `should_sample()` so unrelated traces skip whole subtrees,
the same pattern a real testbench would use.

## Commands

From the repo root, inside `./bin/shell`:

```bash
# Time sampling the full tree (no files written)
python -m examples.riscv_stress sample

# Larger tree: replicate every module 4 times
python -m examples.riscv_stress sample --iters 20000 --copies 4

# Sample, export, and merge a handful of real runs
python -m examples.riscv_stress run --num-tests 10 --formats archive

# Synthesize many compatible records and time merging them
python -m examples.riscv_stress generate --num-tests 200 --formats archive sql
```

`--copies N` repeats the ten-module set with unique names, which is the knob
for “a really large covertree” without editing the modules.

### `sample`

| Flag | Default | Meaning |
| -- | -- | -- |
| `--iters` | 50000 | Number of `cvg.sample(trace)` calls to time |
| `--warmup` | 1000 | Untimed samples first |
| `--copies` | 1 | Module-set replicas |
| `--seed` | 42 | Trace generator seed |

Reports tree build time, coverpoint count, bucket count, samples/sec, and
microseconds per sample.

### `run`

Builds the tree, samples random traces, exports each test, then merges.

| Flag | Default | Meaning |
| -- | -- | -- |
| `--num-tests` | 10 | Independent runs to sample and export |
| `--samples-per-test` | random 100–500 | Traces per run |
| `--formats` | `archive sql` | `archive`, `sql`, `json`, `all`, or `both` |
| `--copies` | 1 | Module-set replicas |
| `--output-dir` | `./output` | Parent of `riscv_stress/` |

### `generate`

Captures the definition from one real tree, then writes synthetic hit data
with the same `def_sha` / `rec_sha` so merge stays legal. Use this when you
want merge-at-scale without waiting on sampling.

| Flag | Default | Meaning |
| -- | -- | -- |
| `--num-tests` | 100 | Synthetic records to write |
| `--hit-rate` | 0.35 | Fraction of buckets given a non-zero count |
| `--formats` | `archive sql json` | Same as `run` |
| `--skip-generation` | off | Merge files that are already on disk |
| `--skip-merge` | off | Write files only |

## Output

```
output/riscv_stress/
  test_outputs/
    archive/test_000.bktgz
    sql/test_000.db
    json/test_000.json
  riscv_stress_merged.bktgz
  riscv_stress_merged.db
  riscv_stress_merged.json
```

Open a merged `.bktgz` in the Bucket viewer.

## Python API

```python
from pathlib import Path
from examples.riscv_stress.stress_example import bench_sample, run
from examples.riscv_stress.generate_stress_data import generate

bench_sample(iters=20_000, copies=2)
run(output_dir=Path("output"), num_tests=5, export_formats=["archive"])
generate(output_dir=Path("output"), num_tests=50, formats=["archive"])
```
