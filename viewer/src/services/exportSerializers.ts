/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { gzipSync } from "fflate";
import type { ExportFormat } from "@/types/coverageSession";
import { materializeReadout } from "@/services/readoutUtils";
import { SUPPORTED_FORMAT_VERSION } from "@/utils/versionCompat";

type JsonCoverageData = {
    tables: Record<string, string[]>;
    definitions: Record<string, unknown>[];
    records: Record<string, unknown>[];
};

type CsvValue = string | number | null;

const JSON_TABLES: Record<string, string[]> = {
    point: [
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
    ],
    axis: ["start", "value_start", "value_end", "name", "description"],
    axis_value: ["start", "value"],
    goal: ["start", "target", "name", "description"],
    bucket_goal: ["start", "goal"],
    point_hit: ["start", "depth", "hits", "hit_buckets", "full_buckets"],
    bucket_hit: ["start", "hits"],
};

class CsvTableBuilder {
    private chunks: string[] = [];
    private byteLength = 0;
    private encoder = new TextEncoder();

    writeRows(rows: CsvValue[][]): { start: number; end: number } {
        const start = this.byteLength;
        for (const row of rows) {
            const line = `${row.map(encodeCsvCell).join(",")}\n`;
            this.chunks.push(line);
            this.byteLength += this.encoder.encode(line).length;
        }
        return { start, end: this.byteLength };
    }

    toBytes(): Uint8Array {
        return this.encoder.encode(this.chunks.join(""));
    }
}

function encodeCsvCell(value: CsvValue): string {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}

function writeAscii(target: Uint8Array, offset: number, length: number, value: string): void {
    const limit = Math.min(length, value.length);
    for (let idx = 0; idx < limit; idx += 1) {
        target[offset + idx] = value.charCodeAt(idx);
    }
}

function writeOctal(target: Uint8Array, offset: number, length: number, value: number): void {
    const maxDigits = Math.max(length - 1, 1);
    const octal = Math.max(0, value).toString(8).padStart(maxDigits, "0");
    writeAscii(target, offset, maxDigits, octal.slice(-maxDigits));
    target[offset + length - 1] = 0;
}

function writeChecksum(target: Uint8Array, value: number): void {
    const octal = Math.max(0, value).toString(8).padStart(6, "0").slice(-6);
    writeAscii(target, 148, 6, octal);
    target[154] = 0;
    target[155] = 32;
}

function createTar(entries: { name: string; data: Uint8Array }[]): Uint8Array {
    const parts: Uint8Array[] = [];
    let totalLength = 0;
    const now = Math.floor(Date.now() / 1000);

    for (const entry of entries) {
        const header = new Uint8Array(512);
        writeAscii(header, 0, 100, entry.name);
        writeOctal(header, 100, 8, 0o644);
        writeOctal(header, 108, 8, 0);
        writeOctal(header, 116, 8, 0);
        writeOctal(header, 124, 12, entry.data.length);
        writeOctal(header, 136, 12, now);
        for (let idx = 148; idx < 156; idx += 1) {
            header[idx] = 32;
        }
        header[156] = "0".charCodeAt(0);
        writeAscii(header, 257, 5, "ustar");
        header[262] = 0;
        writeAscii(header, 263, 2, "00");

        const checksum = header.reduce((sum, byte) => sum + byte, 0);
        writeChecksum(header, checksum);

        parts.push(header);
        totalLength += header.length;

        parts.push(entry.data);
        totalLength += entry.data.length;

        const padLength = (512 - (entry.data.length % 512)) % 512;
        if (padLength > 0) {
            const padding = new Uint8Array(padLength);
            parts.push(padding);
            totalLength += padding.length;
        }
    }

    const endBlocks = new Uint8Array(1024);
    parts.push(endBlocks);
    totalLength += endBlocks.length;

    const tarBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
        tarBytes.set(part, offset);
        offset += part.length;
    }
    return tarBytes;
}

export function serializeReadoutsToJsonBytes(readouts: Readout[]): Uint8Array {
    const payload: JsonCoverageData = {
        tables: JSON_TABLES,
        definitions: [],
        records: [],
    };

    for (const readout of readouts) {
        const data = materializeReadout(readout);
        const definitionIndex = payload.definitions.length;
        payload.definitions.push({
            sha: data.defSha,
            point: data.points.map((point) => [
                point.start,
                point.depth,
                point.end,
                point.axis_start,
                point.axis_end,
                point.axis_value_start,
                point.axis_value_end,
                point.goal_start,
                point.goal_end,
                point.bucket_start,
                point.bucket_end,
                point.target,
                point.target_buckets,
                point.name,
                point.description,
                point.tier ?? null,
                point.tags ?? "",
                point.motivation ?? "",
            ]),
            axis: data.axes.map((axis) => [
                axis.start,
                axis.value_start,
                axis.value_end,
                axis.name,
                axis.description,
            ]),
            axis_value: data.axisValues.map((axisValue) => [
                axisValue.start,
                axisValue.value,
            ]),
            goal: data.goals.map((goal) => [
                goal.start,
                goal.target,
                goal.name,
                goal.description,
            ]),
            bucket_goal: data.bucketGoals.map((bucketGoal) => [
                bucketGoal.start,
                bucketGoal.goal,
            ]),
        });

        payload.records.push({
            def: definitionIndex,
            sha: data.recSha,
            source: data.source,
            source_key: data.sourceKey,
            bucket_version: data.bucketVersion ?? "",
            // Always stamp the serializer's own format, not the source
            // readout's: it describes how this record is laid out.
            format_version: SUPPORTED_FORMAT_VERSION,
            point_hit: data.pointHits.map((pointHit) => [
                pointHit.start,
                pointHit.depth,
                pointHit.hits,
                pointHit.hit_buckets,
                pointHit.full_buckets,
            ]),
            bucket_hit: data.bucketHits.map((bucketHit) => [
                bucketHit.start,
                bucketHit.hits,
            ]),
        });
    }

    return new TextEncoder().encode(JSON.stringify(payload));
}

export function serializeReadoutsToArchiveBytes(readouts: Readout[]): Uint8Array {
    const pointTable = new CsvTableBuilder();
    const axisTable = new CsvTableBuilder();
    const axisValueTable = new CsvTableBuilder();
    const goalTable = new CsvTableBuilder();
    const bucketGoalTable = new CsvTableBuilder();
    const pointHitTable = new CsvTableBuilder();
    const bucketHitTable = new CsvTableBuilder();
    const definitionTable = new CsvTableBuilder();
    const recordTable = new CsvTableBuilder();

    for (const readout of readouts) {
        const data = materializeReadout(readout);

        const pointSpan = pointTable.writeRows(
            data.points.map((point) => [
                point.start,
                point.depth,
                point.end,
                point.axis_start,
                point.axis_end,
                point.axis_value_start,
                point.axis_value_end,
                point.goal_start,
                point.goal_end,
                point.bucket_start,
                point.bucket_end,
                point.target,
                point.target_buckets,
                point.name,
                point.description,
                point.tier ?? null,
                point.tags ?? "",
                point.motivation ?? "",
            ]),
        );

        const pointHitSpan = pointHitTable.writeRows(
            data.pointHits.map((pointHit) => [
                pointHit.start,
                pointHit.depth,
                pointHit.hits,
                pointHit.hit_buckets,
                pointHit.full_buckets,
            ]),
        );

        const axisSpan = axisTable.writeRows(
            data.axes.map((axis) => [
                axis.value_start,
                axis.value_end,
                axis.name,
                axis.description,
            ]),
        );

        const axisValueSpan = axisValueTable.writeRows(
            data.axisValues.map((axisValue) => [axisValue.value]),
        );

        const goalSpan = goalTable.writeRows(
            data.goals.map((goal) => [goal.target, goal.name, goal.description]),
        );

        const bucketGoalSpan = bucketGoalTable.writeRows(
            data.bucketGoals.map((bucketGoal) => [bucketGoal.goal]),
        );

        const bucketHitSpan = bucketHitTable.writeRows(
            data.bucketHits.map((bucketHit) => [bucketHit.hits]),
        );

        const definitionSpan = definitionTable.writeRows([
            [
                data.defSha,
                pointSpan.start,
                pointSpan.end,
                axisSpan.start,
                axisSpan.end,
                axisValueSpan.start,
                axisValueSpan.end,
                goalSpan.start,
                goalSpan.end,
                bucketGoalSpan.start,
                bucketGoalSpan.end,
            ],
        ]);

        recordTable.writeRows([
            [
                data.recSha,
                definitionSpan.start,
                pointHitSpan.start,
                pointHitSpan.end,
                bucketHitSpan.start,
                bucketHitSpan.end,
                data.source ?? "",
                data.sourceKey ?? "",
                data.bucketVersion ?? "",
                // Always stamp the serializer's own format, not the source
                // readout's: it describes how this record row is laid out.
                SUPPORTED_FORMAT_VERSION,
            ],
        ]);
    }

    const tarBytes = createTar([
        { name: "definition", data: definitionTable.toBytes() },
        { name: "record", data: recordTable.toBytes() },
        { name: "point", data: pointTable.toBytes() },
        { name: "axis", data: axisTable.toBytes() },
        { name: "axis_value", data: axisValueTable.toBytes() },
        { name: "goal", data: goalTable.toBytes() },
        { name: "bucket_goal", data: bucketGoalTable.toBytes() },
        { name: "point_hit", data: pointHitTable.toBytes() },
        { name: "bucket_hit", data: bucketHitTable.toBytes() },
    ]);

    return gzipSync(tarBytes);
}

export function serializeReadouts(
    readouts: Readout[],
    // Markdown export is not a record serialization; it is handled by
    // services/readableReport.ts.
    format: Exclude<ExportFormat, "md">,
): Uint8Array {
    return format === "json"
        ? serializeReadoutsToJsonBytes(readouts)
        : serializeReadoutsToArchiveBytes(readouts);
}
