/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved
 */

import { gunzipSync } from "fflate";

type JSONDefinition = {
    sha: string,
} & {[key:string]: (string | number)[][]};

type JSONRecord = {
    def: number,
    sha: string,
} & {[key:string]: (string | number)[][]};

type JSONTables = Record<string, string[]>;

type JSONData = {
    tables: JSONTables,
    definitions: JSONDefinition[],
    records: JSONRecord[],
}


export class JSONReadout implements Readout {
    tables: JSONTables;
    definition: JSONDefinition;
    record: JSONRecord;
    constructor(tables: JSONTables, definition: JSONDefinition, record: JSONRecord) {
        this.tables = tables;
        this.definition = definition;
        this.record = record;
    }
    get_def_sha(): string {
        return this.definition.sha;
    }
    get_rec_sha(): string {
        return this.record.sha;
    }
    private *iter_def_table(table: string, start: number=0, end: number | null=null) {
        const keys = this.tables[table];
        const tableDef = this.definition[table];
        for (let idx=start; idx < (end ?? tableDef.length); idx++) {
            const values = tableDef[idx];
            yield Object.fromEntries(keys.map((k,i) => [k, values[i]]))
        }
    }
    private *iter_rec_table(table: string, start: number=0, end: number | null=null) {
        const keys = this.tables[table];
        const tableDef = this.record[table];
        for (let idx=start; idx < (end ?? tableDef.length); idx++) {
            const values = tableDef[idx];
            yield Object.fromEntries(keys.map((k,i) => [k, values[i]]))
        }
    }
    *iter_points(
        start: number=0,
        end: number | null=null,
        depth: number=0,
    ): Generator<PointTuple> {
        const offsetStart = start + depth;
        const offsetEnd = end === null ? null : end + depth;
        yield *this.iter_def_table("point", offsetStart, offsetEnd);
    }
    *iter_bucket_goals(
        start: number=0,
        end: number | null=null,
    ): Generator<BucketGoalTuple> {
        yield *this.iter_def_table("bucket_goal", start, end);
    }
    *iter_axes(start: number, end: number | null): Generator<AxisTuple> {
        yield *this.iter_def_table("axis", start, end);
    }
    *iter_axis_values(
        start: number=0,
        end: number | null=null,
    ): Generator<AxisValueTuple> {
        yield *this.iter_def_table("axis_value", start, end);
    }
    *iter_goals(start: number, end: number | null): Generator<GoalTuple> {
        yield *this.iter_def_table("goal", start, end);
    }
    *iter_point_hits(
        start: number=0,
        end: number | null=null,
        depth: number=0,
    ): Generator<PointHitTuple> {
        const offsetStart = start + depth;
        const offsetEnd = end === null ? null : end + depth;
        yield *this.iter_rec_table("point_hit", offsetStart, offsetEnd);
    }
    *iter_bucket_hits(
        start: number=0,
        end: number | null=null,
    ): Generator<BucketHitTuple> {
        yield *this.iter_rec_table("bucket_hit", start, end);
    }
}
export class JSONReader implements Reader {
    data: JSONData;
    constructor(data: JSONData) {
        this.data = data;
    }
    async read(recordId: number) {
        const record = this.data.records[recordId]
        const definition = this.data.definitions[record.def]
        return new JSONReadout(this.data.tables, definition, record)
    }
    async *read_all() {
        for (const record of this.data.records) {
            const definition = this.data.definitions[record.def]
            yield new JSONReadout(this.data.tables, definition, record)
        }
        return 0;
    }
}

const ARCHIVE_TABLE_FILES = [
    "definition",
    "record",
    "point",
    "axis",
    "axis_value",
    "goal",
    "bucket_goal",
    "point_hit",
    "bucket_hit",
] as const;

type ArchiveTableName = (typeof ARCHIVE_TABLE_FILES)[number];

type ArchiveDefinition = {
    def_sha: string;
    point_offset: number;
    point_end: number;
    axis_offset: number;
    axis_end: number;
    axis_value_offset: number;
    axis_value_end: number;
    goal_offset: number;
    goal_end: number;
    bucket_goal_offset: number;
    bucket_goal_end: number;
};

type ArchiveRecord = {
    rec_sha: string;
    definition_offset: number;
    point_hit_offset: number;
    point_hit_end: number;
    bucket_hit_offset: number;
    bucket_hit_end: number;
};

type ArchiveTableMap = Record<ArchiveTableName, ArchiveTable>;

class ArchiveTable {
    rows: (string | number)[][];
    offsets: number[];

    constructor(data: Uint8Array) {
        const parsed = parseCsvTable(data);
        this.rows = parsed.rows;
        this.offsets = parsed.offsets;
    }

    private findIndex(byteOffset: number): number {
        let low = 0;
        let high = this.offsets.length;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (this.offsets[mid] < byteOffset) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }
        return low;
    }

    slice(
        byteStart: number,
        byteEnd: number,
        lineOffset = 0,
        lineEnd: number | null = null,
    ): (string | number)[][] {
        if (byteEnd - byteStart === 0) {
            return [];
        }
        const startIdx = this.findIndex(byteStart);
        const endIdx =
            byteEnd - byteStart <= 1 ? this.rows.length : this.findIndex(byteEnd);
        const selection = this.rows.slice(startIdx, endIdx);
        const from = Math.min(lineOffset, selection.length);
        const to =
            lineEnd === null ? selection.length : Math.min(selection.length, lineEnd);
        return selection.slice(from, to);
    }

    rowAtOffset(byteOffset: number): (string | number)[] {
        const idx = this.findIndex(byteOffset);
        if (idx >= this.rows.length) {
            throw new Error(`Offset ${byteOffset} is out of bounds for table`);
        }
        return this.rows[idx];
    }

    rowAtIndex(index: number): (string | number)[] | undefined {
        return this.rows[index];
    }

    get length(): number {
        return this.rows.length;
    }
}

export class ArchiveReadout implements Readout {
    private tables: ArchiveTableMap;
    private definition: ArchiveDefinition;
    private record: ArchiveRecord;

    constructor(tables: ArchiveTableMap, definition: ArchiveDefinition, record: ArchiveRecord) {
        this.tables = tables;
        this.definition = definition;
        this.record = record;
    }

    get_def_sha(): string {
        return this.definition.def_sha;
    }

    get_rec_sha(): string {
        return this.record.rec_sha;
    }

    *iter_points(
        start: number = 0,
        end: number | null = null,
        depth: number = 0,
    ): Generator<PointTuple> {
        const offsetStart = start + depth;
        const offsetEnd = end === null ? null : end + depth;
        for (const row of this.tables.point.slice(
            this.definition.point_offset,
            this.definition.point_end,
            offsetStart,
            offsetEnd,
        )) {
            yield rowToPointTuple(row);
        }
    }

    *iter_bucket_goals(
        start: number = 0,
        end: number | null = null,
    ): Generator<BucketGoalTuple> {
        let idx = start;
        for (const row of this.tables.bucket_goal.slice(
            this.definition.bucket_goal_offset,
            this.definition.bucket_goal_end,
            start,
            end,
        )) {
            yield {
                start: idx,
                goal: toNumber(row[0]),
            };
            idx += 1;
        }
    }

    *iter_axes(start: number = 0, end: number | null = null): Generator<AxisTuple> {
        let idx = start;
        for (const row of this.tables.axis.slice(
            this.definition.axis_offset,
            this.definition.axis_end,
            start,
            end,
        )) {
            const [value_start, value_end, name, description] = row;
            yield {
                start: idx,
                value_start: toNumber(value_start),
                value_end: toNumber(value_end),
                name: toString(name),
                description: toString(description),
            };
            idx += 1;
        }
    }

    *iter_axis_values(
        start: number = 0,
        end: number | null = null,
    ): Generator<AxisValueTuple> {
        let idx = start;
        for (const row of this.tables.axis_value.slice(
            this.definition.axis_value_offset,
            this.definition.axis_value_end,
            start,
            end,
        )) {
            yield {
                start: idx,
                value: toString(row[0]),
            };
            idx += 1;
        }
    }

    *iter_goals(start: number = 0, end: number | null = null): Generator<GoalTuple> {
        let idx = start;
        for (const row of this.tables.goal.slice(
            this.definition.goal_offset,
            this.definition.goal_end,
            start,
            end,
        )) {
            const [target, name, description] = row;
            yield {
                start: idx,
                target: toNumber(target),
                name: toString(name),
                description: toString(description),
            };
            idx += 1;
        }
    }

    *iter_point_hits(
        start: number = 0,
        end: number | null = null,
        depth: number = 0,
    ): Generator<PointHitTuple> {
        const offsetStart = start + depth;
        const offsetEnd = end === null ? null : end + depth;
        for (const row of this.tables.point_hit.slice(
            this.record.point_hit_offset,
            this.record.point_hit_end,
            offsetStart,
            offsetEnd,
        )) {
            const [ptStart, ptDepth, hits, hit_buckets, full_buckets] = row;
            yield {
                start: toNumber(ptStart),
                depth: toNumber(ptDepth),
                hits: toNumber(hits),
                hit_buckets: toNumber(hit_buckets),
                full_buckets: toNumber(full_buckets),
            };
        }
    }

    *iter_bucket_hits(
        start: number = 0,
        end: number | null = null,
    ): Generator<BucketHitTuple> {
        let idx = start;
        for (const row of this.tables.bucket_hit.slice(
            this.record.bucket_hit_offset,
            this.record.bucket_hit_end,
            start,
            end,
        )) {
            yield {
                start: idx,
                hits: toNumber(row[0]),
            };
            idx += 1;
        }
    }
}

export class ArchiveReader implements Reader {
    private tables: ArchiveTableMap;
    private records: ArchiveRecord[];
    private definitionsByOffset: Map<number, ArchiveDefinition>;

    constructor(tables: ArchiveTableMap) {
        this.tables = tables;
        this.records = tables.record.rows.map((row) => toArchiveRecord(row));
        this.definitionsByOffset = new Map();
        tables.definition.rows.forEach((row, index) => {
            const offset = tables.definition.offsets[index];
            this.definitionsByOffset.set(offset, toArchiveDefinition(row));
        });
    }

    static fromCompressedBytes(bytes: Uint8Array): ArchiveReader {
        const decompressed = gunzipSync(bytes);
        const tableEntries = parseTarEntries(decompressed);
        const tables = buildArchiveTables(tableEntries);
        return new ArchiveReader(tables);
    }

    private buildReadout(recordIndex: number): ArchiveReadout {
        const record = this.records[recordIndex];
        if (!record) {
            throw new Error(`Record ${recordIndex} is out of range`);
        }
        const definition = this.definitionsByOffset.get(record.definition_offset);
        if (!definition) {
            throw new Error(
                `Missing definition at offset ${record.definition_offset} for record ${recordIndex}`,
            );
        }
        return new ArchiveReadout(this.tables, definition, record);
    }

    async read(recordId: number): Promise<Readout> {
        return this.buildReadout(recordId);
    }

    async *read_all(): AsyncGenerator<Readout> {
        for (let idx = 0; idx < this.records.length; idx += 1) {
            yield this.buildReadout(idx);
        }
    }
}

function toArchiveDefinition(row: (string | number)[]): ArchiveDefinition {
    const [
        def_sha,
        point_offset,
        point_end,
        axis_offset,
        axis_end,
        axis_value_offset,
        axis_value_end,
        goal_offset,
        goal_end,
        bucket_goal_offset,
        bucket_goal_end,
    ] = row;
    return {
        def_sha: toString(def_sha),
        point_offset: toNumber(point_offset),
        point_end: toNumber(point_end),
        axis_offset: toNumber(axis_offset),
        axis_end: toNumber(axis_end),
        axis_value_offset: toNumber(axis_value_offset),
        axis_value_end: toNumber(axis_value_end),
        goal_offset: toNumber(goal_offset),
        goal_end: toNumber(goal_end),
        bucket_goal_offset: toNumber(bucket_goal_offset),
        bucket_goal_end: toNumber(bucket_goal_end),
    };
}

function toArchiveRecord(row: (string | number)[]): ArchiveRecord {
    const [rec_sha, definition_offset, point_hit_offset, point_hit_end, bucket_hit_offset, bucket_hit_end] = row;
    return {
        rec_sha: toString(rec_sha),
        definition_offset: toNumber(definition_offset),
        point_hit_offset: toNumber(point_hit_offset),
        point_hit_end: toNumber(point_hit_end),
        bucket_hit_offset: toNumber(bucket_hit_offset),
        bucket_hit_end: toNumber(bucket_hit_end),
    };
}

function rowToPointTuple(row: (string | number)[]): PointTuple {
    const [
        start,
        depth,
        end,
        axis_start,
        axis_end,
        axis_value_start,
        axis_value_end,
        goal_start,
        goal_end,
        bucket_start,
        bucket_end,
        target,
        target_buckets,
        name,
        description,
    ] = row;
    return {
        start: toNumber(start),
        depth: toNumber(depth),
        end: toNumber(end),
        axis_start: toNumber(axis_start),
        axis_end: toNumber(axis_end),
        axis_value_start: toNumber(axis_value_start),
        axis_value_end: toNumber(axis_value_end),
        goal_start: toNumber(goal_start),
        goal_end: toNumber(goal_end),
        bucket_start: toNumber(bucket_start),
        bucket_end: toNumber(bucket_end),
        target: toNumber(target),
        target_buckets: toNumber(target_buckets),
        name: toString(name),
        description: toString(description),
    };
}

function parseTarEntries(buffer: Uint8Array): Record<string, Uint8Array> {
    const entries: Record<string, Uint8Array> = {};
    const blockSize = 512;
    let offset = 0;
    while (offset + blockSize <= buffer.length) {
        const name = decodeCString(buffer.subarray(offset, offset + 100));
        if (!name) {
            break;
        }
        const sizeOctal = decodeCString(buffer.subarray(offset + 124, offset + 136)).trim();
        const size = sizeOctal === "" ? 0 : parseInt(sizeOctal, 8);
        const dataStart = offset + blockSize;
        entries[name] = buffer.subarray(dataStart, dataStart + size);
        const totalSize = blockSize + Math.ceil(size / blockSize) * blockSize;
        offset += totalSize;
    }
    return entries;
}

function buildArchiveTables(entries: Record<string, Uint8Array>): ArchiveTableMap {
    const missing = ARCHIVE_TABLE_FILES.filter((name) => !(name in entries));
    if (missing.length > 0) {
        throw new Error(`Archive is missing tables: ${missing.join(", ")}`);
    }
    const tables = {} as ArchiveTableMap;
    for (const name of ARCHIVE_TABLE_FILES) {
        tables[name] = new ArchiveTable(entries[name]!);
    }
    return tables;
}

function decodeCString(bytes: Uint8Array): string {
    let result = "";
    for (let i = 0; i < bytes.length; i += 1) {
        const char = bytes[i];
        if (char === 0) {
            break;
        }
        result += String.fromCharCode(char);
    }
    return result.trimEnd();
}

function parseCsvTable(data: Uint8Array): { rows: (string | number)[][]; offsets: number[] } {
    const rows: (string | number)[][] = [];
    const offsets: number[] = [];
    const length = data.length;
    let idx = 0;

    while (idx < length) {
        if (data[idx] === 10 || data[idx] === 13) {
            idx += 1;
            continue;
        }

        offsets.push(idx);
        const row: (string | number)[] = [];
        let current = "";
        let inQuotes = false;

        while (idx < length) {
            const byte = data[idx];
            if (inQuotes) {
                if (byte === 34) {
                    if (data[idx + 1] === 34) {
                        current += '"';
                        idx += 2;
                        continue;
                    }
                    inQuotes = false;
                    idx += 1;
                    continue;
                }
                current += String.fromCharCode(byte);
                idx += 1;
                continue;
            }

            if (byte === 34) {
                inQuotes = true;
                idx += 1;
                continue;
            }

            if (byte === 44) {
                row.push(parseCsvValue(current));
                current = "";
                idx += 1;
                continue;
            }

            if (byte === 13) {
                idx += 1;
                continue;
            }

            if (byte === 10) {
                idx += 1;
                break;
            }

            current += String.fromCharCode(byte);
            idx += 1;
        }

        row.push(parseCsvValue(current));
        rows.push(row);
    }

    return { rows, offsets };
}

function parseCsvValue(value: string): string | number {
    if (value === "") {
        return "";
    }
    const maybe = Number(value);
    return Number.isNaN(maybe) ? value : maybe;
}

function toNumber(value: string | number): number {
    return typeof value === "number" ? value : Number(value);
}

function toString(value: string | number): string {
    return typeof value === "string" ? value : String(value);
}

export async function readFileHandle(file: FileSystemFileHandle): Promise<Reader> {

    if (file.name.endsWith(".json")) {
        const fileData = await file.getFile();
        const json = await fileData.text();
        const data: JSONData = JSON.parse(json);
        return new JSONReader(data);
    }

    if (file.name.endsWith(".bktgz")) {
        const fileData = await file.getFile();
        const buffer = await fileData.arrayBuffer();
        return ArchiveReader.fromCompressedBytes(new Uint8Array(buffer));
    }

    throw new Error("Unsupported file type");

}
