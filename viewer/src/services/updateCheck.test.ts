/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { afterEach, describe, expect, test, vi } from "vitest";

import { checkForNewerRelease } from "./updateCheck";

function stubRelease(body: unknown, ok = true, status = 200) {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
            ok,
            status,
            json: async () => body,
        })),
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("checkForNewerRelease", () => {
    test("newer release tag returns update info", async () => {
        stubRelease({
            tag_name: "v2.5.0",
            html_url: "https://github.com/Noodle-Bytes/bucket/releases/tag/v2.5.0",
        });
        const update = await checkForNewerRelease("2.4.2");
        expect(update).toEqual({
            latestVersion: "2.5.0",
            releaseUrl:
                "https://github.com/Noodle-Bytes/bucket/releases/tag/v2.5.0",
        });
    });

    test("matching release returns null", async () => {
        stubRelease({ tag_name: "v2.4.2" });
        expect(await checkForNewerRelease("2.4.2")).toBeNull();
    });

    test("older remote release returns null", async () => {
        stubRelease({ tag_name: "v2.4.0" });
        expect(await checkForNewerRelease("2.4.2")).toBeNull();
    });

    test("missing html_url falls back to the releases page", async () => {
        stubRelease({ tag_name: "v9.0.0" });
        const update = await checkForNewerRelease("2.4.2");
        expect(update?.releaseUrl).toBe(
            "https://github.com/Noodle-Bytes/bucket/releases/latest",
        );
    });

    test("non-version tags return null", async () => {
        stubRelease({ tag_name: "nightly-2026-07-08" });
        expect(await checkForNewerRelease("2.4.2")).toBeNull();
    });

    test("missing tag_name returns null", async () => {
        stubRelease({});
        expect(await checkForNewerRelease("2.4.2")).toBeNull();
    });

    test("non-ok response returns null quietly", async () => {
        stubRelease({ tag_name: "v9.0.0" }, false, 403);
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
