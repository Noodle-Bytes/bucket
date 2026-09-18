/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { afterEach, describe, expect, test, vi } from "vitest";

import { checkForNewerRelease, newestViewerRelease } from "./updateCheck";

type Release = {
    tag_name?: unknown;
    html_url?: unknown;
    draft?: boolean;
    prerelease?: boolean;
};

const tagUrl = (tag: string) =>
    `https://github.com/Noodle-Bytes/bucket/releases/tag/${tag}`;

const release = (tag: string, extra: Partial<Release> = {}): Release => ({
    tag_name: tag,
    html_url: tagUrl(tag),
    ...extra,
});

function stubReleases(body: unknown, ok = true, status = 200) {
    const fetchMock = vi.fn(async () => ({
        ok,
        status,
        json: async () => body,
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("checkForNewerRelease", () => {
    test("newer viewer release returns update info", async () => {
        const fetchMock = stubReleases([
            release("v2.12.0"),
            release("viewer-v2.11.2"),
            release("viewer-v2.11.1"),
        ]);
        const update = await checkForNewerRelease("2.11.0");
        expect(update).toEqual({
            latestVersion: "2.11.2",
            releaseUrl: tagUrl("viewer-v2.11.2"),
        });
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining("/releases?per_page="),
            expect.anything(),
        );
    });

    test("bucket (v*) releases are ignored even when newer", async () => {
        stubReleases([release("v9.0.0"), release("viewer-v2.11.0")]);
        expect(await checkForNewerRelease("2.11.0")).toBeNull();
    });

    test("highest viewer release wins regardless of listing order", async () => {
        stubReleases([
            release("viewer-v2.11.1"),
            release("viewer-v2.12.0"),
            release("viewer-v2.11.9"),
        ]);
        const update = await checkForNewerRelease("2.11.0");
        expect(update?.latestVersion).toBe("2.12.0");
    });

    test("matching viewer release returns null", async () => {
        stubReleases([release("viewer-v2.4.2")]);
        expect(await checkForNewerRelease("2.4.2")).toBeNull();
    });

    test("older remote viewer release returns null", async () => {
        stubReleases([release("viewer-v2.4.0")]);
        expect(await checkForNewerRelease("2.4.2")).toBeNull();
    });

    test("drafts and prereleases are skipped", async () => {
        stubReleases([
            release("viewer-v3.0.0", { draft: true }),
            release("viewer-v2.12.0", { prerelease: true }),
            release("viewer-v2.11.1"),
        ]);
        const update = await checkForNewerRelease("2.11.0");
        expect(update?.latestVersion).toBe("2.11.1");
    });

    test("missing html_url falls back to the tag's release page", async () => {
        stubReleases([{ tag_name: "viewer-v9.0.0" }]);
        const update = await checkForNewerRelease("2.4.2");
        expect(update?.releaseUrl).toBe(tagUrl("viewer-v9.0.0"));
    });

    test("non-version viewer tags return null", async () => {
        stubReleases([
            release("nightly-2026-07-08"),
            release("viewer-v2.11.0-rc1"),
            release("viewer-2.11.0"),
        ]);
        expect(await checkForNewerRelease("2.4.2")).toBeNull();
    });

    test("empty listing returns null", async () => {
        stubReleases([]);
        expect(await checkForNewerRelease("2.4.2")).toBeNull();
    });

    test("non-array body (the old /releases/latest shape) returns null", async () => {
        stubReleases({ tag_name: "viewer-v9.0.0" });
        expect(await checkForNewerRelease("2.4.2")).toBeNull();
    });

    test("placeholder 0.0.0 build never asks GitHub", async () => {
        const fetchMock = stubReleases([release("viewer-v9.0.0")]);
        expect(await checkForNewerRelease("0.0.0")).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test("non-ok response returns null quietly", async () => {
        stubReleases([release("viewer-v9.0.0")], false, 403);
        expect(await checkForNewerRelease("2.4.2")).toBeNull();
    });

    test("network failure returns null quietly", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new TypeError("fetch failed");
            }),
        );
        expect(await checkForNewerRelease("2.4.2")).toBeNull();
    });

    test("invalid JSON body returns null quietly", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                status: 200,
                json: async () => {
                    throw new SyntaxError("Unexpected token");
                },
            })),
        );
        expect(await checkForNewerRelease("2.4.2")).toBeNull();
    });
});

describe("newestViewerRelease", () => {
    test("returns null when nothing in the listing is a viewer release", () => {
        expect(
            newestViewerRelease([release("v2.11.0"), {}, null, "junk", 42]),
        ).toBeNull();
    });

    test("tolerates short tags and missing patch numbers", () => {
        expect(
            newestViewerRelease([release("viewer-v2"), release("viewer-v2.1")]),
        ).toEqual({ version: "2.1", url: tagUrl("viewer-v2.1") });
    });
});
