/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";

import {
    parseCsvTable,
    parseCsvTableBytes,
    readElectronFile,
} from "./readers";

type JsonPayload = {
    tables: Record<string, string[]>;
    definitions: Record<string, unknown>[];
    records: Record<string, unknown>[];
};

function createCommonTables(pointColumns: string[]): Record<string, string[]> {
    return {
        point: pointColumns,
        axis: ["start", "value_start", "value_end", "name", "description"],
        axis_value: ["start", "value"],
        goal: ["start", "target", "name", "description"],
        bucket_goal: ["start", "goal"],
        point_hit: ["start", "depth", "hits", "hit_buckets", "full_buckets"],
        bucket_hit: ["start", "hits"],
    };
}

function createBaseDefinition(pointRow: unknown[]): Record<string, unknown> {
    return {
        sha: "def-a",
        point: [pointRow],
        axis: [[0, 0, 1, "axis", "axis description"]],
        axis_value: [[0, "A"]],
        goal: [[0, 1, "goal", "goal description"]],
        bucket_goal: [[0, 0]],
    };
}

function createBaseRecord(overrides?: Record<string, unknown>): Record<string, unknown> {
    return {
        def: 0,
        sha: "rec-a",
        point_hit: [[0, 0, 1, 1, 1]],
        bucket_hit: [[0, 1]],
        ...overrides,
    };
}

async function readSingle(payload: JsonPayload): Promise<Readout> {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const reader = await readElectronFile(Array.from(bytes));
    const readouts: Readout[] = [];
    for await (const readout of reader.read_all()) {
        readouts.push(readout);
    }
    expect(readouts).toHaveLength(1);
    return readouts[0];
}

describe("readers metadata compatibility", () => {
    test("legacy json point rows without metadata default tier/tags/motivation", async () => {
        const payload: JsonPayload = {
            tables: createCommonTables([
                "start",
                "depth",
                "end",
                "axis_start",
                "axis_end",
                "axis_value_start",
                "axis_value_end",
                "goal_start",
                "goal_end",
                "bucket_start",
                "bucket_end",
                "target",
                "target_buckets",
                "name",
                "description",
            ]),
            definitions: [
                createBaseDefinition([
                    0,
                    0,
                    1,
                    0,
                    1,
                    0,
                    1,
                    0,
                    1,
                    0,
                    1,
                    1,
                    1,
                    "root",
                    "legacy point",
                ]),
            ],
            records: [createBaseRecord()],
        };

        const readout = await readSingle(payload);
        const points = Array.from(readout.iter_points());
        expect(points).toHaveLength(1);
        expect(points[0].tier).toBeNull();
        expect(points[0].tags).toBe("");
        expect(points[0].motivation).toBe("");
        expect(readout.get_source()).toBeNull();
        expect(readout.get_source_key()).toBeNull();
    });

    test("json rows normalize malformed metadata values", async () => {
        const payload: JsonPayload = {
            tables: createCommonTables([
                "start",
                "depth",
                "end",
                "axis_start",
                "axis_end",
                "axis_value_start",
                "axis_value_end",
                "goal_start",
                "goal_end",
                "bucket_start",
                "bucket_end",
                "target",
                "target_buckets",
                "name",
                "description",
                "tier",
                "tags",
                "motivation",
            ]),
            definitions: [
                createBaseDefinition([
                    0,
                    0,
                    1,
                    0,
                    1,
                    0,
                    1,
                    0,
                    1,
                    0,
                    1,
                    1,
                    1,
                    "root",
                    "point",
                    "not-a-number",
                    ["alpha", "beta"],
                    null,
                ]),
            ],
            records: [createBaseRecord({ source: "", source_key: "" })],
        };

        const readout = await readSingle(payload);
        const points = Array.from(readout.iter_points());
        expect(points).toHaveLength(1);
        expect(points[0].tier).toBeNull();
        expect(points[0].tags).toBe("[\"alpha\",\"beta\"]");
        expect(points[0].motivation).toBe("");
        expect(readout.get_source()).toBe("");
        expect(readout.get_source_key()).toBe("");
    });

    test("invalid bytes reject with unsupported file type", async () => {
        await expect(readElectronFile([0, 1, 2, 3])).rejects.toThrow(
            "Unsupported file type - not a valid archive or JSON",
        );
    });
});

describe("parseCsvTable", () => {
    const encode = (csv: string) => new TextEncoder().encode(csv);

    test("quoted fields with commas, newlines and escaped quotes", () => {
        const csv = 'a,"b,c","he said ""hi""",d\n"multi\nline",2\n';
        const { rows, offsets } = parseCsvTable(encode(csv));
        expect(rows).toEqual([
            ["a", "b,c", 'he said "hi"', "d"],
            ["multi\nline", 2],
        ]);
        // Second row starts after the first \n row terminator, and the quoted
        // \n inside the second row must not start a new row.
        expect(Array.from(offsets)).toEqual([0, csv.indexOf('"multi')]);
    });

    test("\\r\\n line endings", () => {
        const csv = "1,2\r\n3,four\r\n";
        const { rows, offsets } = parseCsvTable(encode(csv));
        expect(rows).toEqual([
            [1, 2],
            [3, "four"],
        ]);
        expect(Array.from(offsets)).toEqual([0, 5]);
    });

    test("empty fields and empty trailing fields", () => {
        const csv = "a,,c\n,,\nx,\n";
        const { rows, offsets } = parseCsvTable(encode(csv));
        expect(rows).toEqual([
            ["a", "", "c"],
            ["", "", ""],
            ["x", ""],
        ]);
        expect(Array.from(offsets)).toEqual([0, 5, 8]);
    });

    test("final row without trailing newline", () => {
        const { rows, offsets } = parseCsvTable(encode("a,b\nc,d"));
        expect(rows).toEqual([
            ["a", "b"],
            ["c", "d"],
        ]);
        expect(Array.from(offsets)).toEqual([0, 4]);
    });

    test("non-ASCII input falls back and keeps byte offsets", () => {
        // "héllo,1\n" is 9 BYTES in UTF-8 (é = 2 bytes) but 8 characters, so
        // the fast string-scan path must not be used: offsets are byte
        // offsets into the file.
        const csv = "héllo,1\nwörld,2\n";
        const data = encode(csv);
        expect(data.length).toBeGreaterThan(csv.length);
        const { rows, offsets } = parseCsvTable(data);
        expect(rows).toEqual([
            ["héllo", 1],
            ["wörld", 2],
        ]);
        expect(Array.from(offsets)).toEqual([0, 9]);
        // Must agree exactly with the byte-wise parser
        expect({ rows, offsets }).toEqual(parseCsvTableBytes(data));
    });

    test("offsets point at the first byte of each row", () => {
        const csv = 'aa,bb\n"c\nc",dd\r\nee,"f""f"\n';
        const data = encode(csv);
        const { rows, offsets } = parseCsvTable(data);
        expect(rows).toEqual([
            ["aa", "bb"],
            ["c\nc", "dd"],
            ["ee", 'f"f'],
        ]);
        expect(Array.from(offsets)).toEqual([0, 6, 16]);
        // Each offset must land on the first byte of its row's content
        expect(data[offsets[0] as number]).toBe("a".charCodeAt(0));
        expect(data[offsets[1] as number]).toBe('"'.charCodeAt(0));
        expect(data[offsets[2] as number]).toBe("e".charCodeAt(0));
    });

    test("fast path matches byte-wise parser on tricky ASCII input", () => {
        const csv =
            'name,value\n"quoted,comma",1\n"esc""aped",2.5\n,\r\nplain,-3\nlast,"end"';
        const data = encode(csv);
        const fast = parseCsvTable(data);
        const bytes = parseCsvTableBytes(data);
        expect(fast.rows).toEqual(bytes.rows);
        expect(Array.from(fast.offsets)).toEqual(Array.from(bytes.offsets));
    });
});
