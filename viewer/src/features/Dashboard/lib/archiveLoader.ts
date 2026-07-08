/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

// Loads .bktgz archives without blocking the main thread: the gunzip + tar
// walk + CSV parse runs in a Web Worker and only the parsed table data comes
// back. Falls back to the synchronous in-thread path when workers are
// unavailable (very old environments, tests running under node, or a worker
// that fails to construct).

// The `?worker&inline` import embeds the worker as a blob/data URL so the
// vite-plugin-singlefile bundle (self-contained HTML reports) still works
// with no separate chunk.
import ArchiveWorkerConstructor from "./archiveWorker?worker&inline";
import type { ArchiveWorkerRequest, ArchiveWorkerResponse } from "./archiveWorker";
import { ArchiveReader } from "./readers";

/**
 * Parse a .bktgz archive into an ArchiveReader, preferring a Web Worker so
 * the UI stays responsive during the (750ms+ for large stores) parse.
 *
 * Note: the byte buffer is transferred to the worker, so the caller's view of
 * `bytes` is detached once this resolves/rejects on the worker path.
 */
export async function readArchiveBytes(bytes: Uint8Array): Promise<ArchiveReader> {
    if (typeof Worker === "undefined") {
        return ArchiveReader.fromCompressedBytes(bytes);
    }

    let worker: Worker;
    try {
        worker = new ArchiveWorkerConstructor();
    } catch {
        // Worker construction failed (e.g. CSP forbids blob/data workers) —
        // parse synchronously on the main thread instead.
        return ArchiveReader.fromCompressedBytes(bytes);
    }

    try {
        return await parseInWorker(worker, bytes);
    } catch (error) {
        // If the worker infrastructure failed before consuming the bytes
        // (script failed to start, postMessage threw) the buffer is still
        // attached and we can parse in-thread. A detached buffer means the
        // worker received the data, so the failure is a genuine parse error
        // and retrying would not help.
        if (error instanceof ArchiveWorkerCrash && bytes.buffer.byteLength > 0) {
            return ArchiveReader.fromCompressedBytes(bytes);
        }
        throw error;
    } finally {
        worker.terminate();
    }
}

/** Worker-infrastructure failure (as opposed to a real archive parse error). */
class ArchiveWorkerCrash extends Error {}

function parseInWorker(worker: Worker, bytes: Uint8Array): Promise<ArchiveReader> {
    return new Promise<ArchiveReader>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<ArchiveWorkerResponse>) => {
            const data = event.data;
            if (data.ok) {
                try {
                    resolve(ArchiveReader.fromParsedTables(data.tables));
                } catch (error) {
                    reject(error instanceof Error ? error : new Error(String(error)));
                }
            } else {
                reject(new Error(data.error));
            }
        };
        worker.onerror = (event: ErrorEvent) => {
            reject(new ArchiveWorkerCrash(event.message || "Archive worker failed"));
        };
        try {
            const request: ArchiveWorkerRequest = { bytes };
            // Transfer the underlying buffer — no copy on the way in.
            worker.postMessage(request, [bytes.buffer]);
        } catch (error) {
            reject(new ArchiveWorkerCrash(String(error)));
        }
    });
}
