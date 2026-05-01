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

export type VersionCompatResult =
    | { status: "unknown" }
    | { status: "match" }
    | { status: "file_older"; fileVersion: string; viewerVersion: string }
    | { status: "file_newer"; fileVersion: string; viewerVersion: string };

/**
 * Determine compatibility between the version embedded in a coverage file
 * and the version of the viewer.
 */
export function checkVersionCompat(
    fileVersion: string | null,
    viewerVersion: string,
): VersionCompatResult {
    if (!fileVersion) {
        return { status: "unknown" };
    }
    const cmp = compareVersions(fileVersion, viewerVersion);
    if (cmp === 0) {
        return { status: "match" };
    }
    if (cmp < 0) {
        return { status: "file_older", fileVersion, viewerVersion };
    }
    return { status: "file_newer", fileVersion, viewerVersion };
}
