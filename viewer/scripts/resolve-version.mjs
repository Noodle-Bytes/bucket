/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * Resolve the viewer version for build-time injection.
 *
 * The viewer (and the Electron app that wraps it) is versioned independently
 * of the bucket Python package: viewer releases are `viewer-v*` git tags,
 * bucket releases are `v*` tags, and neither moves the other. Git tags are
 * the single source of truth (package.json holds a `0.0.0` placeholder).
 * Resolution order:
 *   1. VIEWER_VERSION env var (set by CI and electron/build.mjs); a leading
 *      "viewer-v" or "v" is stripped
 *   2. `git describe` against the latest viewer-v* tag, normalized to semver:
 *      exact tag        -> "2.4.3"
 *      2 commits past   -> "2.4.4-dev.2+gcf775b8"
 *      uncommitted work -> trailing ".dirty"
 *   3. "0.0.0" (no git metadata available; update checks are skipped)
 */
export function resolveViewerVersion() {
    const fromEnv = process.env.VIEWER_VERSION?.trim();
    if (fromEnv) {
        return stripTagPrefix(fromEnv);
    }

    try {
        const described = execSync(
            'git describe --tags --long --dirty --match "viewer-v[0-9]*"',
            { stdio: ["ignore", "pipe", "ignore"] },
        )
            .toString()
            .trim();
        const version = normalizeDescribe(described);
        if (version) {
            return version;
        }
    } catch {
        // No git repo, no viewer-v* tags, or git not installed — fall through.
    }

    console.warn(
        "[bucket] Could not resolve a viewer version from VIEWER_VERSION or " +
            "viewer-v* git tags; building as 0.0.0",
    );
    return "0.0.0";
}

/** "viewer-v2.4.3" or "v2.4.3" -> "2.4.3"; anything else is returned as is. */
export function stripTagPrefix(tag) {
    return tag.replace(/^viewer-v/, "").replace(/^v/, "");
}

/** Normalize `git describe --long --dirty` output to a semver string. */
function normalizeDescribe(described) {
    const match = described.match(
        /^viewer-v(\d+)\.(\d+)\.(\d+)-(\d+)-g([0-9a-f]+)(-dirty)?$/,
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

// Allow `node scripts/resolve-version.mjs` (used by electron/build.mjs and CI).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    console.log(resolveViewerVersion());
}
