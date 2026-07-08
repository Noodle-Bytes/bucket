/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { readArchiveBytes } from "./archiveLoader";
import { ArchiveReader, parseArchiveBytes } from "./readers";
import type { Readout } from "./readers";
import { materializeReadout } from "@/services/readoutUtils";

// Two-record archive written by the Python ArchiveAccessor, with non-ASCII
// point descriptions (byte offsets differ from character offsets, so this
// also exercises the non-ASCII CSV parser fallback on real data).
const FIXTURE = join(__dirname, "../test/fixtures/two_records.bktgz");

function fixtureBytes(): Uint8Array {
    return new Uint8Array(readFileSync(FIXTURE));
}

async function collect(reader: ArchiveReader): Promise<Readout[]> {
    const readouts: Readout[] = [];
    for await (const readout of reader.read_all()) {
        readouts.push(readout);
    }
    return readouts;
}

describe("archiveLoader", () => {
    test("readArchiveBytes falls back to synchronous parsing without Worker", async () => {
        // vitest runs under node where Worker is undefined, so this covers
        // the loader's sync fallback contract.
        expect(typeof Worker).toBe("undefined");

        const reader = await readArchiveBytes(fixtureBytes());
        const readouts = await collect(reader);

        expect(readouts).toHaveLength(2);
        expect(Array.from(readouts[0].iter_points())).toHaveLength(10);
        expect(Array.from(readouts[1].iter_points())).toHaveLength(13);
    });

    test("each record reads exactly its own rows (no cross-record spill)", async () => {
        const reader = await readArchiveBytes(fixtureBytes());
        const readouts = await collect(reader);

        for (const readout of readouts) {
            const keys = Array.from(readout.iter_points()).map(
                (p) => `${p.start}:${p.depth}`,
            );
            expect(new Set(keys).size).toBe(keys.length);
        }
        // Non-ASCII descriptions survive the parse
        const root = Array.from(readouts[0].iter_points())[0];
        expect(root.description).toBe("points — with dashes — 1");
        const root2 = Array.from(readouts[1].iter_points())[0];
        expect(root2.description).toBe("points — with dashes — 2");
    });

    test("worker data path (parseArchiveBytes → fromParsedTables) matches sync path", async () => {
        // This is the exact pipeline the archive worker runs and the exact
        // reconstruction the main thread performs on its response, minus the
        // postMessage transport.
        const viaWorkerPath = ArchiveReader.fromParsedTables(
            parseArchiveBytes(fixtureBytes()),
        );
        const viaSyncPath = ArchiveReader.fromCompressedBytes(fixtureBytes());

        const workerReadouts = await collect(viaWorkerPath);
        const syncReadouts = await collect(viaSyncPath);

        expect(workerReadouts).toHaveLength(syncReadouts.length);
        for (let i = 0; i < syncReadouts.length; i += 1) {
            expect(materializeReadout(workerReadouts[i])).toEqual(
                materializeReadout(syncReadouts[i]),
            );
        }
    });

    test("bucket hit totals match the values written by the Python writer", async () => {
        const reader = await readArchiveBytes(fixtureBytes());
        const readouts = await collect(reader);

        const totals = readouts.map((readout) =>
            Array.from(readout.iter_bucket_hits()).reduce(
                (sum, bucket) => sum + Number(bucket.hits),
                0,
            ),
        );
        expect(totals).toEqual([71, 193]);
    });
});
