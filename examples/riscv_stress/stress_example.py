# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

from __future__ import annotations

import logging
import random
import time
from pathlib import Path

from bucket.rw import (
    ArchiveAccessor,
    JSONAccessor,
    PointReader,
    SQLAccessor,
)

from .stress_common import (
    RISCVDataset,
    build_coverage,
    context_hash,
    generate_trace,
    tree_stats,
)

FORMAT_ACCESSORS = {
    "archive": (ArchiveAccessor, "bktgz"),
    "sql": (lambda path: SQLAccessor.File(path), "db"),
    "json": (JSONAccessor, "json"),
}

FORMAT_MERGE = {
    "archive": ArchiveAccessor.merge_files,
    "sql": SQLAccessor.merge_files,
    "json": JSONAccessor.merge_files,
}


def parse_formats(formats: list[str] | None) -> list[str]:
    if not formats or "both" in formats:
        return ["archive", "sql"]
    if "all" in formats:
        return ["archive", "sql", "json"]
    known = {"archive", "sql", "json"}
    unknown = [fmt for fmt in formats if fmt not in known]
    if unknown:
        raise ValueError(f"Unknown formats: {unknown}. Choose from {sorted(known)}")
    return list(dict.fromkeys(formats))


def export_readout(
    readout, output_dir: Path, stem: str, formats: list[str]
) -> dict[str, Path]:
    paths = {}
    for fmt in formats:
        accessor_cls, ext = FORMAT_ACCESSORS[fmt]
        fmt_dir = output_dir / fmt
        fmt_dir.mkdir(parents=True, exist_ok=True)
        path = fmt_dir / f"{stem}.{ext}"
        accessor_cls(path).write(readout)
        paths[fmt] = path
    return paths


def merge_format(
    log: logging.Logger,
    paths: list[Path],
    merged_path: Path,
    fmt: str,
) -> float:
    if not paths:
        log.error("No %s files to merge", fmt)
        return 0.0
    log.info("Merging %d %s files into %s", len(paths), fmt, merged_path)
    start = time.perf_counter()
    merged = FORMAT_MERGE[fmt](paths)
    if merged is None:
        log.error("Merge produced no readout for %s", fmt)
        return 0.0
    accessor_cls, _ = FORMAT_ACCESSORS[fmt]
    merged_path.parent.mkdir(parents=True, exist_ok=True)
    accessor_cls(merged_path).write(merged)
    elapsed = time.perf_counter() - start
    log.info("Merged %s in %.2fs -> %s", fmt, elapsed, merged_path)
    return elapsed


def run_one_test(
    *,
    test_num: int,
    rand: random.Random,
    log: logging.Logger,
    riscv_data: RISCVDataset,
    output_dir: Path,
    formats: list[str],
    samples: int,
    copies: int,
) -> dict[str, Path]:
    log.info("Test %d: building tree and sampling %d traces", test_num, samples)
    cvg = build_coverage(
        copies=copies,
        source=f"stress_test_{test_num:03d}",
        source_key=str(rand.randint(1, 1_000_000)),
        riscv_data=riscv_data,
    )
    for _ in range(samples):
        cvg.sample(generate_trace(rand, riscv_data))

    readout = PointReader(context_hash()).read(cvg)
    return export_readout(readout, output_dir, f"test_{test_num:03d}", formats)


def run(
    output_dir: Path = Path("output"),
    num_tests: int = 10,
    seed: int = 42,
    export_formats: list[str] | None = None,
    samples_per_test: int | None = None,
    copies: int = 1,
):
    """Sample the stress tree, export each run, and merge the results."""
    formats = parse_formats(export_formats)
    logging.basicConfig(level=logging.INFO)
    log = logging.getLogger("stress_test")
    riscv_data = RISCVDataset()

    stress_output_dir = output_dir / "riscv_stress"
    test_outputs_dir = stress_output_dir / "test_outputs"
    test_outputs_dir.mkdir(parents=True, exist_ok=True)

    log.info(
        "Starting stress run: %d tests, formats=%s, copies=%d",
        num_tests,
        formats,
        copies,
    )

    exported: dict[str, list[Path]] = {fmt: [] for fmt in formats}
    for test_num in range(num_tests):
        test_rand = random.Random(seed + test_num)
        samples = (
            samples_per_test
            if samples_per_test is not None
            else test_rand.randint(100, 500)
        )
        try:
            paths = run_one_test(
                test_num=test_num,
                rand=test_rand,
                log=log,
                riscv_data=riscv_data,
                output_dir=test_outputs_dir,
                formats=formats,
                samples=samples,
                copies=copies,
            )
        except Exception:
            log.exception("Test %d failed", test_num)
            continue
        for fmt, path in paths.items():
            exported[fmt].append(path)
        if (test_num + 1) % 10 == 0 or test_num + 1 == num_tests:
            log.info("Completed %d/%d tests", test_num + 1, num_tests)

    times: dict[str, float] = {}
    for fmt, paths in exported.items():
        if not paths:
            continue
        _, ext = FORMAT_ACCESSORS[fmt]
        merged_path = stress_output_dir / f"riscv_stress_merged.{ext}"
        times[fmt] = merge_format(log, paths, merged_path, fmt)

    log.info("=" * 60)
    log.info("Stress run complete")
    log.info("Individual outputs: %s", test_outputs_dir)
    for fmt, elapsed in times.items():
        log.info("  %s merge: %.2fs", fmt, elapsed)
    if len(times) >= 2:
        ordered = sorted(times.items(), key=lambda item: item[1])
        fastest, slowest = ordered[0], ordered[-1]
        if fastest[1] > 0:
            log.info(
                "  %s was %.2fx faster than %s",
                fastest[0],
                slowest[1] / fastest[1],
                slowest[0],
            )
    log.info("=" * 60)


def bench_sample(
    *,
    iters: int = 50_000,
    warmup: int = 1_000,
    copies: int = 1,
    seed: int = 42,
) -> dict[str, float | int]:
    """Time Covertop.sample against the full (optionally replicated) stress tree."""
    logging.basicConfig(level=logging.INFO)
    log = logging.getLogger("stress_sample")
    riscv_data = RISCVDataset()
    rand = random.Random(seed)

    log.info("Building stress tree (copies=%d)...", copies)
    build_start = time.perf_counter()
    cvg = build_coverage(copies=copies, source="sample_bench", riscv_data=riscv_data)
    build_seconds = time.perf_counter() - build_start
    stats = tree_stats(cvg)
    log.info(
        "Tree ready in %.2fs: %d coverpoints, %d covergroups, %d buckets",
        build_seconds,
        stats["coverpoints"],
        stats["covergroups"],
        stats["buckets"],
    )

    traces = [generate_trace(rand, riscv_data) for _ in range(max(iters, warmup))]
    for trace in traces[:warmup]:
        cvg.sample(trace)

    sample_start = time.perf_counter()
    for trace in traces[:iters]:
        cvg.sample(trace)
    sample_seconds = time.perf_counter() - sample_start
    per_sec = iters / sample_seconds if sample_seconds else float("inf")
    us_per_sample = (sample_seconds / iters) * 1e6 if iters else 0.0

    log.info("=" * 60)
    log.info("Sampling stress")
    log.info("  copies:          %d", copies)
    log.info("  coverpoints:     %d", stats["coverpoints"])
    log.info("  buckets:         %d", stats["buckets"])
    log.info("  build:           %.3fs", build_seconds)
    log.info("  warmup:          %d", warmup)
    log.info("  iters:           %d", iters)
    log.info("  sample time:     %.3fs", sample_seconds)
    log.info("  samples/sec:     %.0f", per_sec)
    log.info("  us/sample:       %.2f", us_per_sample)
    log.info("=" * 60)

    return {
        "copies": copies,
        "coverpoints": stats["coverpoints"],
        "covergroups": stats["covergroups"],
        "buckets": stats["buckets"],
        "build_seconds": build_seconds,
        "iters": iters,
        "sample_seconds": sample_seconds,
        "samples_per_sec": per_sec,
        "us_per_sample": us_per_sample,
    }
