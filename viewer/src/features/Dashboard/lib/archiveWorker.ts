/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

// Web Worker that performs the expensive part of loading a .bktgz archive
// (gunzip + tar walk + CSV parse) off the main thread. The parsed table data
// is posted back to the main thread, which reconstructs an ArchiveReader from
// it — see archiveLoader.ts. This module is bundled inline
// (`?worker&inline`) so the single-file HTML report build keeps working.

import { parseArchiveBytes } from "./readers";
import type { ParsedArchiveTables, ParsedCsvTable } from "./readers";

export type ArchiveWorkerRequest = {
    bytes: Uint8Array;
};

export type ArchiveWorkerResponse =
    | { ok: true; tables: ParsedArchiveTables }
    | { ok: false; error: string };

// In a dedicated worker `self` supports postMessage(message, transfer). Cast
// through Worker so we don't need the WebWorker lib in tsconfig.
const ctx = self as unknown as Worker;

ctx.onmessage = (event: MessageEvent<ArchiveWorkerRequest>) => {
    let response: ArchiveWorkerResponse;
    const transfers: Transferable[] = [];
    try {
        const parsed = parseArchiveBytes(event.data.bytes);
        const tables = {} as ParsedArchiveTables;
        for (const [name, table] of Object.entries(parsed) as [
            keyof ParsedArchiveTables,
            ParsedCsvTable,
        ][]) {
            // Offsets are numeric, so hand them back as a transferred typed
            // array instead of structured-cloning millions of numbers. The
            // rows contain strings and must be cloned.
            const offsets =
                table.offsets instanceof Float64Array
                    ? table.offsets
                    : Float64Array.from(table.offsets);
            tables[name] = { rows: table.rows, offsets };
            transfers.push(offsets.buffer);
        }
        response = { ok: true, tables };
    } catch (error) {
        response = {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        };
        transfers.length = 0;
    }
    ctx.postMessage(response, transfers);
};
