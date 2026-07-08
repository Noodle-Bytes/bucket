/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { loadReadoutsFromBytes } from "./fileLoader";
import {
    BASE_POINT_COLUMNS,
    createBaseDefinition,
    createBaseRecord,
    createCommonTables,
} from "../features/Dashboard/test/mocks/jsonPayload";

const FIXTURE = join(
    __dirname,
    "../features/Dashboard/test/fixtures/two_records.bktgz",
);

describe("loadReadoutsFromBytes", () => {
    test("gzip magic bytes route to the archive reader", async () => {
        const bytes = new Uint8Array(readFileSync(FIXTURE));
        const readouts = await loadReadoutsFromBytes(bytes);
        expect(readouts).toHaveLength(2);
    });

    test("non-gzip bytes are tried as JSON", async () => {
        const payload = {
            tables: createCommonTables(BASE_POINT_COLUMNS),
            definitions: [
                createBaseDefinition([
                    0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, "point", "desc",
                ]),
            ],
            records: [createBaseRecord()],
        };
        const bytes = new TextEncoder().encode(JSON.stringify(payload));
        const readouts = await loadReadoutsFromBytes(bytes);
        expect(readouts).toHaveLength(1);
        expect(readouts[0].get_def_sha()).toBe("def-a");
    });

    test("garbage bytes reject with the unsupported-file-type error", async () => {
        const bytes = new TextEncoder().encode("not a coverage file");
        await expect(loadReadoutsFromBytes(bytes)).rejects.toThrow(
            "Unsupported file type - not a valid archive or JSON",
        );
    });

    test("gzipped non-archive bytes reject with the unsupported-file-type error", async () => {
        // Valid gzip container, invalid archive contents: must not fall
        // through to the JSON path or leak a parse error.
        const { gzipSync } = await import("fflate");
        const bytes = gzipSync(new TextEncoder().encode("not a tar archive"));
        await expect(loadReadoutsFromBytes(bytes)).rejects.toThrow(
            "Unsupported file type - not a valid archive or JSON",
        );
    });
});
