/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * Resolve the Bucket version for build-time injection.
 *
 * Git tags are the single source of truth for versions (package.json holds a
 * `0.0.0` placeholder). Resolution order:
 *   1. BUCKET_VERSION env var (set by CI and electron/build.sh)
 *   2. `git describe` against the latest v* tag, normalized to semver:
 *      exact tag        -> "2.4.3"
 *      2 commits past   -> "2.4.4-dev.2+gcf775b8"
 *      uncommitted work -> trailing ".dirty"
 *   3. "0.0.0" (no git metadata available; update checks are skipped)
 */
export function resolveBucketVersion() {
    const fromEnv = process.env.BUCKET_VERSION?.trim();
    if (fromEnv) {
        return fromEnv.replace(/^v/, "");
    }

    try {
        const described = execSync(
            'git describe --tags --long --dirty --match "v[0-9]*"',
            { stdio: ["ignore", "pipe", "ignore"] },
        )
            .toString()
            .trim();
        const version = normalizeDescribe(described);
        if (version) {
            return version;
        }
    } catch {
        // No git repo, no tags, or git not installed — fall through.
    }

    console.warn(
        "[bucket] Could not resolve a version from BUCKET_VERSION or git tags; " +
            "building as 0.0.0",
    );
    return "0.0.0";
}

/** Normalize `git describe --long --dirty` output to a semver string. */
function normalizeDescribe(described) {
    const match = described.match(
        /^v(\d+)\.(\d+)\.(\d+)-(\d+)-g([0-9a-f]+)(-dirty)?$/,
    );
    if (!match) {
        return null;
    }
    const [, major, minor, patch, distance, sha, dirty] = match;
    if (distance === "0" && !dirty) {
        return `${major}.${minor}.${patch}`;
    }
    // Mirror setuptools-scm's guess-next-dev: a build past (or dirty on) the
    // last tag is a pre-release of the next patch version.
    const dirtySuffix = dirty ? ".dirty" : "";
    return `${major}.${minor}.${Number(patch) + 1}-dev.${distance}+g${sha}${dirtySuffix}`;
}

// Allow `node scripts/resolve-version.mjs` (used by electron/build.sh and CI).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    console.log(resolveBucketVersion());
}
