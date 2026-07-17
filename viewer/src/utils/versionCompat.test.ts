/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";

import {
    MIN_SUPPORTED_FORMAT_VERSION,
    SUPPORTED_FORMAT_VERSION,
    checkFormatCompat,
    compareVersions,
} from "./versionCompat";

describe("checkFormatCompat", () => {
    test("supported formats match silently", () => {
        for (
            let format = MIN_SUPPORTED_FORMAT_VERSION;
            format <= SUPPORTED_FORMAT_VERSION;
            format += 1
        ) {
            expect(checkFormatCompat(format)).toEqual({ status: "match" });
        }
    });

    test("missing format version is treated as legacy and matches", () => {
        expect(checkFormatCompat(null)).toEqual({ status: "match" });
        expect(checkFormatCompat(undefined)).toEqual({ status: "match" });
        expect(checkFormatCompat(Number.NaN)).toEqual({ status: "match" });
    });

    test("newer format than supported is flagged", () => {
        expect(checkFormatCompat(SUPPORTED_FORMAT_VERSION + 1)).toEqual({
            status: "file_newer",
            fileFormat: SUPPORTED_FORMAT_VERSION + 1,
            supportedFormat: SUPPORTED_FORMAT_VERSION,
        });
    });

    test("format below the supported minimum is flagged", () => {
        expect(checkFormatCompat(MIN_SUPPORTED_FORMAT_VERSION - 1)).toEqual({
            status: "file_older",
            fileFormat: MIN_SUPPORTED_FORMAT_VERSION - 1,
            minSupportedFormat: MIN_SUPPORTED_FORMAT_VERSION,
        });
    });
});

describe("compareVersions", () => {
    test("orders semver-like strings", () => {
        expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
        expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
        expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    });
});
