/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved
 */

type JSONDefinition = {
    sha: string,
} & {[key:string]: (string | number)[][]};

type JSONRecord = {
    def: number,
    sha: string,
    source?: string | null,
    source_key?: string | null,
} & {[key:string]: (string | number)[][]};

type JSONTables = {
    [key:string]: String[]
};

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
    get_source(): string | null {
        return this.record.source ?? null;
    }
    get_source_key(): string | null {
        return this.record.source_key ?? null;
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
    read(recordId: number) {
        const record = this.data.records[recordId]
        const definition = this.data.definitions[record.def]
        return new JSONReadout(this.data.tables, definition, record)
    }
    *read_all() {
        for (const record of this.data.records) {
            const definition = this.data.definitions[record.def]
            yield new JSONReadout(this.data.tables, definition, record)
        }
        return 0;
    }
}
