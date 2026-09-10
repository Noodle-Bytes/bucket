/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

/**
 * Compare two semver-like version strings (major.minor.patch).
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 * Non-numeric or missing parts are treated as 0.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
    const parse = (v: string) =>
        v
            .split(".")
            .slice(0, 3)
            .map((p) => parseInt(p, 10) || 0);

    const [aMaj, aMin, aPat] = parse(a);
    const [bMaj, bMin, bPat] = parse(b);

    if (aMaj !== bMaj) return aMaj > bMaj ? 1 : -1;
    if (aMin !== bMin) return aMin > bMin ? 1 : -1;
    if (aPat !== bPat) return aPat > bPat ? 1 : -1;
    return 0;
}

/**
 * Storage format versions the viewer understands. The format version is
 * independent of the bucket/viewer release version and is only bumped when
 * the on-disk layout of coverage files actually changes.
 *
 * The archive (.bktgz) and JSON formats each carry their own version field,
 * but by policy their counters always bump in lockstep (see the format
 * history in bucket/rw/common.py), so a single supported range covers both.
 *
 * Keep in sync with FORMAT_VERSION / MIN_FORMAT_VERSION in
 * bucket/rw/common.py. Every version in the supported range has a frozen
 * fixture under tests/format_fixtures/ (repo root) that the compat tests
 * open and fully process — see tests/format_fixtures/README.md for the
 * bump / drop-support workflow.
 */
export const SUPPORTED_FORMAT_VERSION = 2;
export const MIN_SUPPORTED_FORMAT_VERSION = 1;

/** Files written before format versioning are format 1. */
export const LEGACY_FORMAT_VERSION = 1;

export type FormatCompatResult =
    | { status: "match" }
    | { status: "file_newer"; fileFormat: number; supportedFormat: number }
    | { status: "file_older"; fileFormat: number; minSupportedFormat: number };

/**
 * Determine compatibility between the storage format of a coverage file and
 * the range of formats this viewer supports. A missing format version means
 * the file predates format versioning and is treated as the legacy format.
 */
export function checkFormatCompat(
    fileFormat: number | null | undefined,
): FormatCompatResult {
    const format =
        typeof fileFormat === "number" && Number.isFinite(fileFormat)
            ? fileFormat
            : LEGACY_FORMAT_VERSION;
    if (format > SUPPORTED_FORMAT_VERSION) {
        return {
            status: "file_newer",
            fileFormat: format,
            supportedFormat: SUPPORTED_FORMAT_VERSION,
        };
    }
    if (format < MIN_SUPPORTED_FORMAT_VERSION) {
        return {
            status: "file_older",
            fileFormat: format,
            minSupportedFormat: MIN_SUPPORTED_FORMAT_VERSION,
        };
    }
    return { status: "match" };
}
