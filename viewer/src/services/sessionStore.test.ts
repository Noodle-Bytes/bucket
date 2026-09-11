/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
    SESSION_PERSIST_SETTING_KEY,
    clearStoredSession,
    deleteStoredSources,
    isSessionPersistenceEnabled,
    isSessionStoreAvailable,
    listStoredSourceIds,
    readStoredSession,
    setSessionPersistenceEnabled,
    writeStoredSessionMeta,
    writeStoredSources,
    type StoredSessionMeta,
} from "./sessionStore";

function meta(overrides: Partial<StoredSessionMeta> = {}): StoredSessionMeta {
    return {
        sourceOrder: ["source-1", "source-2"],
        records: [
            { id: "record-1", sourceRef: "source-1", sourceRecordIndex: 0 },
            { id: "record-2", sourceRef: "source-2", sourceRecordIndex: 0 },
        ],
        loadedRecordIds: ["record-1"],
        savedAt: 1234,
        ...overrides,
    };
}

beforeEach(() => {
    // Fresh database per test.
    globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("session store", () => {
    test("reports availability and reads null when nothing is stored", async () => {
        expect(isSessionStoreAvailable()).toBe(true);
        expect(await readStoredSession()).toBeNull();
        expect(await listStoredSourceIds()).toEqual([]);
    });

    test("round-trips sources and meta, ordering sources by the stored order", async () => {
        const bytes = new Uint8Array([1, 2, 3, 4]);
        await writeStoredSources([
            { id: "source-2", kind: "electronPath", label: "b.bktgz", path: "/tmp/b.bktgz" },
            { id: "source-1", kind: "fileObject", label: "a.bktgz", bytes },
        ]);
        await writeStoredSessionMeta(meta());

        const stored = await readStoredSession();
        expect(stored).not.toBeNull();
        expect(stored!.sourceOrder).toEqual(["source-1", "source-2"]);
        expect(stored!.loadedRecordIds).toEqual(["record-1"]);
        expect(stored!.records).toHaveLength(2);
        expect(stored!.sources.map((source) => source.id)).toEqual(["source-1", "source-2"]);
        expect(stored!.sources[0].kind).toBe("fileObject");
        expect(Array.from(stored!.sources[0].bytes ?? [])).toEqual([1, 2, 3, 4]);
        expect(stored!.sources[1].path).toBe("/tmp/b.bktgz");
    });

    test("meta alone is not enough; missing source rows are skipped", async () => {
        await writeStoredSessionMeta(meta({ sourceOrder: ["source-1", "ghost"] }));
        await writeStoredSources([{ id: "source-1", kind: "virtualMerged", label: "Merged" }]);
        const stored = await readStoredSession();
        expect(stored!.sources.map((source) => source.id)).toEqual(["source-1"]);
    });

    test("ignores meta rows with an unexpected shape", async () => {
        await writeStoredSessionMeta({ nonsense: true } as unknown as StoredSessionMeta);
        expect(await readStoredSession()).toBeNull();
    });

    test("replaces rows on rewrite and deletes by id", async () => {
        await writeStoredSources([{ id: "source-1", kind: "fileObject", label: "old.bktgz" }]);
        await writeStoredSources([{ id: "source-1", kind: "fileObject", label: "new.bktgz" }]);
        await writeStoredSources([{ id: "source-3", kind: "fileObject", label: "c.bktgz" }]);
        expect((await listStoredSourceIds()).sort()).toEqual(["source-1", "source-3"]);

        await writeStoredSessionMeta(meta({ sourceOrder: ["source-1", "source-3"] }));
        expect((await readStoredSession())!.sources[0].label).toBe("new.bktgz");

        await deleteStoredSources(["source-1"]);
        await deleteStoredSources([]);
        expect(await listStoredSourceIds()).toEqual(["source-3"]);
    });

    test("clear removes sources and meta", async () => {
        await writeStoredSources([{ id: "source-1", kind: "fileObject", label: "a.bktgz" }]);
        await writeStoredSessionMeta(meta());
        await clearStoredSession();
        expect(await readStoredSession()).toBeNull();
        expect(await listStoredSourceIds()).toEqual([]);
    });

    test("is a no-op without IndexedDB", async () => {
        vi.stubGlobal("indexedDB", undefined);
        expect(isSessionStoreAvailable()).toBe(false);
        expect(await readStoredSession()).toBeNull();
        await expect(
            writeStoredSources([{ id: "source-1", kind: "fileObject", label: "a.bktgz" }]),
        ).resolves.toBeUndefined();
        await expect(writeStoredSessionMeta(meta())).resolves.toBeUndefined();
        await expect(clearStoredSession()).resolves.toBeUndefined();
        expect(await listStoredSourceIds()).toEqual([]);
    });

    test("surfaces a throwing indexedDB getter as unavailable", () => {
        Object.defineProperty(globalThis, "indexedDB", {
            configurable: true,
            get() {
                throw new Error("blocked");
            },
        });
        expect(isSessionStoreAvailable()).toBe(false);
        Object.defineProperty(globalThis, "indexedDB", {
            configurable: true,
            writable: true,
            value: new IDBFactory(),
        });
    });
});

describe("persistence setting", () => {
    const storage = new Map<string, string>();

    beforeEach(() => {
        storage.clear();
        vi.stubGlobal("localStorage", {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => {
                storage.set(key, value);
            },
        });
    });

    test("defaults on and round-trips", () => {
        expect(isSessionPersistenceEnabled()).toBe(true);
        setSessionPersistenceEnabled(false);
        expect(storage.get(SESSION_PERSIST_SETTING_KEY)).toBe("false");
        expect(isSessionPersistenceEnabled()).toBe(false);
        setSessionPersistenceEnabled(true);
        expect(isSessionPersistenceEnabled()).toBe(true);
    });

    test("tolerates a throwing localStorage", () => {
        vi.stubGlobal("localStorage", {
            getItem: () => {
                throw new Error("denied");
            },
            setItem: () => {
                throw new Error("denied");
            },
        });
        expect(isSessionPersistenceEnabled()).toBe(true);
        expect(() => setSessionPersistenceEnabled(false)).not.toThrow();
    });
});
