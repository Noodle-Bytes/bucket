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
 * Compare major.minor only (patch is ignored).
 * Used for viewer/file compatibility warnings so patch drift does not alert.
 */
function compareMajorMinor(a: string, b: string): -1 | 0 | 1 {
    const parseTwo = (v: string) => {
        const parts = v.split(".").slice(0, 2);
        const maj = parseInt(parts[0] ?? "", 10) || 0;
        const min = parseInt(parts[1] ?? "", 10) || 0;
        return [maj, min] as const;
    };

    const [aMaj, aMin] = parseTwo(a);
    const [bMaj, bMin] = parseTwo(b);

    if (aMaj !== bMaj) return aMaj > bMaj ? 1 : -1;
    if (aMin !== bMin) return aMin > bMin ? 1 : -1;
    return 0;
}

export type VersionCompatResult =
    | { status: "unknown" }
    | { status: "match" }
    | { status: "file_older"; fileVersion: string; viewerVersion: string }
    | { status: "file_newer"; fileVersion: string; viewerVersion: string };

/** Trimmed value missing or a placeholder — treat as unknown embedding (warn like compat gap). */
function isUnsetTrimmedBucketVersion(t: string): boolean {
    if (!t) {
        return true;
    }
    return /^(unknown|unversioned|n\/a|na|none)$/i.test(t);
}

/**
 * Determine compatibility between the version embedded in a coverage file
 * and the version of the viewer.
 *
 * Only **major** and **minor** are compared for mismatch warnings; differing
 * **patch** alone is treated as compatible (no banner).
 */
export function checkVersionCompat(
    fileVersion: string | null | undefined,
    viewerVersion: string,
): VersionCompatResult {
    const raw =
        typeof fileVersion === "string" ? fileVersion.trim() : "";
    if (isUnsetTrimmedBucketVersion(raw)) {
        return { status: "unknown" };
    }
    const cmp = compareMajorMinor(raw, viewerVersion);
    if (cmp === 0) {
        return { status: "match" };
    }
    if (cmp < 0) {
        return { status: "file_older", fileVersion: raw, viewerVersion };
    }
    return { status: "file_newer", fileVersion: raw, viewerVersion };
}
