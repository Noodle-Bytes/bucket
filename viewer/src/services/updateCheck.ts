/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { compareVersions } from "@/utils/versionCompat";

export type UpdateInfo = {
    latestVersion: string;
    releaseUrl: string;
};

const LATEST_RELEASE_API =
    "https://api.github.com/repos/Noodle-Bytes/bucket/releases/latest";
const RELEASES_PAGE = "https://github.com/Noodle-Bytes/bucket/releases/latest";

/**
 * Ask GitHub for the latest release and compare it against the running
 * version. Resolves with update info when a newer release exists, and null
 * otherwise — including on any network or API failure, so offline or
 * firewalled environments stay quiet and callers never handle errors.
 */
export async function checkForNewerRelease(
    currentVersion: string,
    timeoutMs = 5000,
): Promise<UpdateInfo | null> {
    try {
        const response = await fetch(LATEST_RELEASE_API, {
            headers: { Accept: "application/vnd.github+json" },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
            return null;
        }
        const release = (await response.json()) as {
            tag_name?: unknown;
            html_url?: unknown;
        };
        const tag =
            typeof release?.tag_name === "string" ? release.tag_name.trim() : "";
        const latestVersion = tag.replace(/^v/, "");
        // Only plain x[.y[.z]] tags are comparable; skip anything else.
        if (!/^\d+(\.\d+){0,2}$/.test(latestVersion)) {
            return null;
        }
        if (compareVersions(latestVersion, currentVersion) <= 0) {
            return null;
        }
        const releaseUrl =
            typeof release?.html_url === "string" && release.html_url
                ? release.html_url
                : RELEASES_PAGE;
        return { latestVersion, releaseUrl };
    } catch {
        return null;
    }
}
