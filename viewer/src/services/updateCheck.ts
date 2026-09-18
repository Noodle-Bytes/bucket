/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { compareVersions } from "@/utils/versionCompat";

export type UpdateInfo = {
    latestVersion: string;
    releaseUrl: string;
};

// The viewer is released on its own viewer-v<major>.<minor>.<patch> tags,
// independently of the bucket Python package (v* tags). Both lines share the
// repository's releases list and viewer releases are never marked "Latest",
// so this lists recent releases and picks the highest viewer tag rather than
// asking /releases/latest.
const RELEASES_API =
    "https://api.github.com/repos/Noodle-Bytes/bucket/releases?per_page=100";
const RELEASES_PAGE = "https://github.com/Noodle-Bytes/bucket/releases";
const VIEWER_RELEASE_TAG = /^viewer-v(\d+(?:\.\d+){0,2})$/;

type ReleaseSummary = {
    tag_name?: unknown;
    html_url?: unknown;
    draft?: unknown;
    prerelease?: unknown;
};

type ViewerRelease = { version: string; url: string };

/**
 * Ask GitHub for recent releases and compare the newest viewer release
 * against the running version. Resolves with update info when a newer viewer
 * release exists, and null otherwise — including on any network or API
 * failure, so offline or firewalled environments stay quiet and callers never
 * handle errors.
 */
export async function checkForNewerRelease(
    currentVersion: string,
    timeoutMs = 5000,
): Promise<UpdateInfo | null> {
    // 0.0.0 is the build-time placeholder used when no version could be
    // resolved (no git metadata) — every release would look newer.
    if (currentVersion.trim() === "0.0.0") {
        return null;
    }
    try {
        const response = await fetch(RELEASES_API, {
            headers: { Accept: "application/vnd.github+json" },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
            return null;
        }
        const body: unknown = await response.json();
        const latest = newestViewerRelease(Array.isArray(body) ? body : []);
        if (!latest || compareVersions(latest.version, currentVersion) <= 0) {
            return null;
        }
        return { latestVersion: latest.version, releaseUrl: latest.url };
    } catch {
        return null;
    }
}

/**
 * The highest published (non-draft, non-prerelease) viewer-v* release in a
 * GitHub releases listing, or null when there is none. Bucket (v*) releases
 * and anything that is not a plain x[.y[.z]] viewer tag are ignored.
 */
export function newestViewerRelease(releases: unknown[]): ViewerRelease | null {
    let best: ViewerRelease | null = null;
    for (const entry of releases) {
        const release = (entry ?? {}) as ReleaseSummary;
        if (release.draft === true || release.prerelease === true) {
            continue;
        }
        const tag =
            typeof release.tag_name === "string" ? release.tag_name.trim() : "";
        const match = VIEWER_RELEASE_TAG.exec(tag);
        if (!match) {
            continue;
        }
        const version = match[1];
        if (best && compareVersions(version, best.version) <= 0) {
            continue;
        }
        const url =
            typeof release.html_url === "string" && release.html_url
                ? release.html_url
                : `${RELEASES_PAGE}/tag/${tag}`;
        best = { version, url };
    }
    return best;
}
