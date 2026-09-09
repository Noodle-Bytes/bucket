/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";

import {
    ArchiveReader,
    ParsedArchiveTables,
    PartialParsedArchiveTables,
    parseCsvTable,
    parseCsvTableBytes,
    readJsonBytes,
} from "./readers";
import {
    BASE_POINT_COLUMNS,
    JsonPayload,
    createBaseDefinition,
    createBaseRecord,
    createCommonTables,
} from "../test/mocks/jsonPayload";


async function readSingle(payload: JsonPayload): Promise<Readout> {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const readouts: Readout[] = [];
    for await (const readout of readJsonBytes(bytes).read_all()) {
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

describe("archive record format version", () => {
    const emptyTable = () => ({ rows: [], offsets: [] });

    function buildTables(recordRows: (string | number)[][]): ParsedArchiveTables {
        return {
            definition: {
                rows: [["defsha", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
                offsets: [0],
            },
            record: {
                rows: recordRows,
                offsets: recordRows.map((_, idx) => idx),
            },
            point: emptyTable(),
            axis: emptyTable(),
            axis_value: emptyTable(),
            goal: emptyTable(),
            bucket_goal: emptyTable(),
            point_hit: emptyTable(),
            bucket_hit: emptyTable(),
            bucket_waiver: emptyTable(),
        };
    }

    test("reads the format version column when present", async () => {
        const reader = ArchiveReader.fromParsedTables(
            buildTables([["recsha", 0, 0, 0, 0, 0, "", "", "1.2.3", 2]]),
        );
        const readout = await reader.read(0);
        expect(readout.get_format_version?.()).toBe(2);
        expect(readout.get_bucket_version()).toBe("1.2.3");
    });

    test("legacy rows without the column default to format 1", async () => {
        const legacyRows = [
            // pre-bucket_version row
            ["recsha", 0, 0, 0, 0, 0, "", ""],
            // bucket_version but no format_version
            ["recsha", 0, 0, 0, 0, 0, "", "", "0.9.0"],
        ];
        const reader = ArchiveReader.fromParsedTables(buildTables(legacyRows));
        const first = await reader.read(0);
        const second = await reader.read(1);
        expect(first.get_format_version?.()).toBe(1);
        expect(second.get_format_version?.()).toBe(1);
    });
});

describe("json record format version", () => {
    test("reads the version keys when present", async () => {
        const payload: JsonPayload = {
            tables: createCommonTables(BASE_POINT_COLUMNS),
            definitions: [createBaseDefinition([
                0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, "root", "point",
            ])],
            records: [createBaseRecord({ bucket_version: "1.2.3", format_version: 2 })],
        };
        const readout = await readSingle(payload);
        expect(readout.get_format_version?.()).toBe(2);
        expect(readout.get_bucket_version()).toBe("1.2.3");
    });

    test("legacy records without version keys default to format 1", async () => {
        const payload: JsonPayload = {
            tables: createCommonTables(BASE_POINT_COLUMNS),
            definitions: [createBaseDefinition([
                0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, "root", "point",
            ])],
            records: [createBaseRecord()],
        };
        const readout = await readSingle(payload);
        expect(readout.get_format_version?.()).toBe(1);
        expect(readout.get_bucket_version()).toBe("");
    });
});

describe("bucket waivers (storage format 3)", () => {
    const emptyTable = () => ({ rows: [], offsets: [] });

    /**
     * One record whose point covers buckets 0..3. The bucket_waiver table
     * holds two records' worth of rows so the byte range on the record row
     * is load-bearing: record 0 owns bytes [0, 22), record 1 the rest.
     */
    function buildWaiverTables(recordRow: (string | number)[], pointHitRow: (string | number)[]): ParsedArchiveTables {
        return {
            definition: {
                rows: [["defsha", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
                offsets: [0],
            },
            record: { rows: [recordRow], offsets: [0] },
            point: emptyTable(),
            axis: emptyTable(),
            axis_value: emptyTable(),
            goal: emptyTable(),
            bucket_goal: emptyTable(),
            point_hit: { rows: [pointHitRow], offsets: [0] },
            bucket_hit: emptyTable(),
            bucket_waiver: {
                // "1","first"\n  (12 bytes)  "3","third"\n (12 bytes) | "7","other"\n
                rows: [
                    [1, "first"],
                    [3, "third"],
                    [7, "other record"],
                ],
                offsets: [0, 12, 24],
            },
        };
    }

    test("archive: reads the waiver range and the trailing point_hit columns", async () => {
        const reader = ArchiveReader.fromParsedTables(
            buildWaiverTables(
                // ..., bucket_version, format_version, bucket_waiver_offset, bucket_waiver_end
                ["recsha", 0, 0, 1, 0, 0, "", "", "2.0.0", 3, 0, 24],
                [0, 0, 5, 1, 1, 2, 10],
            ),
        );
        const readout = await reader.read(0);
        expect(readout.get_format_version?.()).toBe(3);
        expect(Array.from(readout.iter_bucket_waivers(0, null))).toEqual([
            { start: 1, reason: "first" },
            { start: 3, reason: "third" },
        ]);
        // The range filters by bucket index, not row position.
        expect(Array.from(readout.iter_bucket_waivers(2, 4))).toEqual([
            { start: 3, reason: "third" },
        ]);
        expect(Array.from(readout.iter_bucket_waivers(4, null))).toEqual([]);
        expect(Array.from(readout.iter_point_hits())).toEqual([
            {
                start: 0,
                depth: 0,
                hits: 5,
                hit_buckets: 1,
                full_buckets: 1,
                waived_buckets: 2,
                waived_target: 10,
            },
        ]);
    });

    test("archive: format 2 rows without the columns read as no waivers", async () => {
        const reader = ArchiveReader.fromParsedTables(
            buildWaiverTables(
                ["recsha", 0, 0, 1, 0, 0, "", "", "1.9.0", 2],
                [0, 0, 5, 1, 1],
            ),
        );
        const readout = await reader.read(0);
        expect(Array.from(readout.iter_bucket_waivers(0, null))).toEqual([]);
        const [pointHit] = Array.from(readout.iter_point_hits());
        expect(pointHit.waived_buckets).toBe(0);
        expect(pointHit.waived_target).toBe(0);
    });

    test("archive: a parsed table set without bucket_waiver still loads", async () => {
        const tables = buildWaiverTables(
            ["recsha", 0, 0, 1, 0, 0, "", "", "1.9.0", 2],
            [0, 0, 5, 1, 1],
        );
        const withoutWaivers: PartialParsedArchiveTables = { ...tables };
        delete withoutWaivers.bucket_waiver;
        const reader = ArchiveReader.fromParsedTables(withoutWaivers);
        const readout = await reader.read(0);
        expect(Array.from(readout.iter_bucket_waivers(0, null))).toEqual([]);
    });

    test("json: reads bucket_waiver rows and the extra point_hit fields", async () => {
        const tables = createCommonTables(BASE_POINT_COLUMNS);
        tables.point_hit = [...tables.point_hit, "waived_buckets", "waived_target"];
        tables.bucket_waiver = ["start", "reason"];
        const payload: JsonPayload = {
            tables,
            definitions: [createBaseDefinition([
                0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, "root", "point",
            ])],
            records: [
                createBaseRecord({
                    format_version: 3,
                    point_hit: [[0, 0, 0, 0, 0, 1, 1]],
                    bucket_waiver: [[0, "known gap"]],
                }),
            ],
        };
        const readout = await readSingle(payload);
        expect(Array.from(readout.iter_bucket_waivers(0, null))).toEqual([
            { start: 0, reason: "known gap" },
        ]);
        expect(Array.from(readout.iter_bucket_waivers(1, null))).toEqual([]);
        expect(Array.from(readout.iter_point_hits())[0]).toMatchObject({
            waived_buckets: 1,
            waived_target: 1,
        });
    });

    test("json: format 2 records without the table or fields default to none", async () => {
        const payload: JsonPayload = {
            tables: createCommonTables(BASE_POINT_COLUMNS),
            definitions: [createBaseDefinition([
                0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, "root", "point",
            ])],
            records: [createBaseRecord({ format_version: 2 })],
        };
        const readout = await readSingle(payload);
        expect(Array.from(readout.iter_bucket_waivers(0, null))).toEqual([]);
        expect(Array.from(readout.iter_point_hits())[0]).toMatchObject({
            waived_buckets: 0,
            waived_target: 0,
        });
    });

    test("json: short point_hit rows under a format 3 table read waived counts as 0", async () => {
        const tables = createCommonTables(BASE_POINT_COLUMNS);
        tables.point_hit = [...tables.point_hit, "waived_buckets", "waived_target"];
        const payload: JsonPayload = {
            tables,
            definitions: [createBaseDefinition([
                0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, "root", "point",
            ])],
            records: [createBaseRecord({ point_hit: [[0, 0, 1, 1, 1]] })],
        };
        const readout = await readSingle(payload);
        expect(Array.from(readout.iter_point_hits())[0]).toMatchObject({
            hits: 1,
            waived_buckets: 0,
            waived_target: 0,
        });
    });
});
