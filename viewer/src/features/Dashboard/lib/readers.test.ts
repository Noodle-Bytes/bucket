/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { describe, expect, test } from "vitest";

import { readElectronFile } from "./readers";

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
