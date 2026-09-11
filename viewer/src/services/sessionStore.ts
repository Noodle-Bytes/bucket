/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

/**
 * IndexedDB persistence for the loaded coverage session, so a reload of the
 * viewer (or PWA) restores the archives that were open.
 *
 * Layout (database `bucket-viewer-session`):
 *   - `sources`: one row per coverage source, keyed by source id. File-backed
 *     sources carry the raw `.bktgz` bytes; Electron paths carry the path.
 *   - `meta`: a single `session` row with the source order, record id map and
 *     the loaded record ids.
 *
 * Every function is safe to call when IndexedDB is unavailable: reads return
 * `null` and writes are no-ops. Callers should still catch runtime failures
 * (quota, blocked databases) — the viewer must never depend on this store.
 */

import type { CoverageSourceKind } from "@/types/coverageSession";

export const SESSION_STORE_DB_NAME = "bucket-viewer-session";
const SESSION_STORE_DB_VERSION = 1;
const STORE_SOURCES = "sources";
const STORE_META = "meta";
const META_KEY = "session";

/** Sources larger than this are not persisted (the rest of the session still is). */
export const SESSION_PERSIST_MAX_SOURCE_BYTES = 200 * 1024 * 1024;

export const SESSION_PERSIST_SETTING_KEY = "bucket.viewer.persistSession";

export type StoredSessionSource = {
    id: string;
    kind: CoverageSourceKind;
    label: string;
    /** Electron file path (`electronPath`). */
    path?: string;
    /** Raw archive bytes (`fileObject`, `fileHandle`, serialised `virtualMerged`). */
    bytes?: Uint8Array;
    /** Kept when the browser can structured-clone it, for "Refresh from disk". */
    fileHandle?: FileSystemFileHandle;
};

export type StoredSessionRecord = {
    id: string;
    sourceRef: string;
    sourceRecordIndex: number;
};

export type StoredSessionMeta = {
    sourceOrder: string[];
    records: StoredSessionRecord[];
    loadedRecordIds: string[];
    savedAt: number;
};

export type StoredSession = StoredSessionMeta & {
    sources: StoredSessionSource[];
};

function getIndexedDb(): IDBFactory | null {
    try {
        if (typeof indexedDB === "undefined" || indexedDB === null) {
            return null;
        }
        return indexedDB;
    } catch {
        return null;
    }
}

export function isSessionStoreAvailable(): boolean {
    return getIndexedDb() !== null;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
    });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () =>
            reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
        transaction.onerror = () =>
            reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    });
}

async function openDatabase(): Promise<IDBDatabase | null> {
    const factory = getIndexedDb();
    if (!factory) {
        return null;
    }
    const request = factory.open(SESSION_STORE_DB_NAME, SESSION_STORE_DB_VERSION);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_SOURCES)) {
            db.createObjectStore(STORE_SOURCES, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
            db.createObjectStore(STORE_META);
        }
    };
    const db = await requestToPromise(request);
    // Let a future schema upgrade in another tab proceed.
    db.onversionchange = () => db.close();
    return db;
}

/** Run `work` inside a transaction over both stores, always closing the database. */
async function withStores<T>(
    mode: IDBTransactionMode,
    work: (sources: IDBObjectStore, meta: IDBObjectStore) => Promise<T> | T,
): Promise<T | null> {
    const db = await openDatabase();
    if (!db) {
        return null;
    }
    try {
        const transaction = db.transaction([STORE_SOURCES, STORE_META], mode);
        const done = transactionDone(transaction);
        const result = await work(
            transaction.objectStore(STORE_SOURCES),
            transaction.objectStore(STORE_META),
        );
        await done;
        return result;
    } finally {
        db.close();
    }
}

function isStoredMeta(value: unknown): value is StoredSessionMeta {
    if (!value || typeof value !== "object") {
        return false;
    }
    const meta = value as Partial<StoredSessionMeta>;
    return (
        Array.isArray(meta.sourceOrder)
        && Array.isArray(meta.records)
        && Array.isArray(meta.loadedRecordIds)
    );
}

/** Read the whole stored session, or `null` when nothing (valid) is stored. */
export async function readStoredSession(): Promise<StoredSession | null> {
    const result = await withStores("readonly", async (sources, meta) => {
        const [metaValue, sourceRows] = await Promise.all([
            requestToPromise(meta.get(META_KEY)),
            requestToPromise(sources.getAll()),
        ]);
        if (!isStoredMeta(metaValue)) {
            return null;
        }
        const rowsById = new Map(
            (sourceRows as StoredSessionSource[]).map((row) => [row.id, row]),
        );
        const ordered: StoredSessionSource[] = [];
        for (const id of metaValue.sourceOrder) {
            const row = rowsById.get(id);
            if (row) {
                ordered.push(row);
            }
        }
        return { ...metaValue, sources: ordered };
    });
    return result ?? null;
}

/** Insert or replace source rows. */
export async function writeStoredSources(rows: StoredSessionSource[]): Promise<void> {
    if (rows.length === 0) {
        return;
    }
    await withStores("readwrite", (sources) => {
        for (const row of rows) {
            sources.put(row);
        }
    });
}

export async function deleteStoredSources(ids: string[]): Promise<void> {
    if (ids.length === 0) {
        return;
    }
    await withStores("readwrite", (sources) => {
        for (const id of ids) {
            sources.delete(id);
        }
    });
}

export async function writeStoredSessionMeta(meta: StoredSessionMeta): Promise<void> {
    await withStores("readwrite", (_sources, metaStore) => {
        metaStore.put(meta, META_KEY);
    });
}

/** Remove everything persisted for the session. */
export async function clearStoredSession(): Promise<void> {
    await withStores("readwrite", (sources, meta) => {
        sources.clear();
        meta.clear();
    });
}

/** List the ids of every stored source row (including rows no longer in the meta order). */
export async function listStoredSourceIds(): Promise<string[]> {
    const result = await withStores("readonly", async (sources) => {
        const keys = await requestToPromise(sources.getAllKeys());
        return keys.map((key) => String(key));
    });
    return result ?? [];
}

/** User setting: persist the session across reloads (default on). */
export function isSessionPersistenceEnabled(): boolean {
    try {
        if (typeof localStorage === "undefined") {
            return true;
        }
        const raw = localStorage.getItem(SESSION_PERSIST_SETTING_KEY);
        return raw === null ? true : raw !== "false";
    } catch {
        return true;
    }
}

export function setSessionPersistenceEnabled(enabled: boolean): void {
    try {
        if (typeof localStorage === "undefined") {
            return;
        }
        localStorage.setItem(SESSION_PERSIST_SETTING_KEY, String(enabled));
    } catch {
        // ignore
    }
}
