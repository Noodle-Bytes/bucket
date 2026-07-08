/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { loadReadoutsFromBytes } from "./fileLoader";

const FIXTURE = join(
    __dirname,
    "../features/Dashboard/test/fixtures/two_records.bktgz",
);

describe("loadReadoutsFromBytes", () => {
    test("gzip magic bytes route to the archive reader", async () => {
        const bytes = Array.from(readFileSync(FIXTURE));
        const readouts = await loadReadoutsFromBytes(bytes);
        expect(readouts).toHaveLength(2);
    });

    test("non-gzip bytes are tried as JSON", async () => {
        const payload = {
            tables: {
                point: [
                    "start", "depth", "end", "axis_start", "axis_end",
                    "axis_value_start", "axis_value_end", "goal_start",
                    "goal_end", "bucket_start", "bucket_end", "target",
                    "target_buckets", "name", "description",
                ],
                axis: ["start", "value_start", "value_end", "name", "description"],
                axis_value: ["start", "value"],
                goal: ["start", "target", "name", "description"],
                bucket_goal: ["start", "goal"],
                point_hit: ["start", "depth", "hits", "hit_buckets", "full_buckets"],
                bucket_hit: ["start", "hits"],
            },
            definitions: [
                {
                    sha: "def-a",
                    point: [[0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, "point", "desc"]],
                    axis: [[0, 0, 1, "axis", "axis description"]],
                    axis_value: [[0, "A"]],
                    goal: [[0, 1, "goal", "goal description"]],
                    bucket_goal: [[0, 0]],
                },
            ],
            records: [
                {
                    def: 0,
                    sha: "rec-a",
                    point_hit: [[0, 0, 1, 1, 1]],
                    bucket_hit: [[0, 1]],
                },
            ],
        };
        const bytes = Array.from(new TextEncoder().encode(JSON.stringify(payload)));
        const readouts = await loadReadoutsFromBytes(bytes);
        expect(readouts).toHaveLength(1);
        expect(readouts[0].get_def_sha()).toBe("def-a");
    });

    test("garbage bytes reject with the unsupported-file-type error", async () => {
        const bytes = Array.from(new TextEncoder().encode("not a coverage file"));
        await expect(loadReadoutsFromBytes(bytes)).rejects.toThrow(
            "Unsupported file type - not a valid archive or JSON",
        );
    });

    test("gzipped non-archive bytes reject with the unsupported-file-type error", async () => {
        // Valid gzip container, invalid archive contents: must not fall
        // through to the JSON path or leak a parse error.
        const { gzipSync } = await import("fflate");
        const bytes = Array.from(
            gzipSync(new TextEncoder().encode("not a tar archive")),
        );
        await expect(loadReadoutsFromBytes(bytes)).rejects.toThrow(
            "Unsupported file type - not a valid archive or JSON",
        );
    });
});
