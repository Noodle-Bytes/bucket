/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { readJsonBytes } from "../features/Dashboard/lib/readers";
import { readArchiveBytes } from "../features/Dashboard/lib/archiveLoader";

/**
 * Check if we're running in Electron
 */
export function isElectron(): boolean {
    return typeof window !== 'undefined' && window.electronAPI !== undefined;
}

function isGzip(buffer: Uint8Array): boolean {
    return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

/**
 * Build a reader from raw bytes: gzipped bytes are treated as a .bktgz
 * archive (parsed off the main thread where possible), anything else is
 * tried as JSON.
 */
async function readerFromBuffer(buffer: Uint8Array): Promise<Reader> {
    try {
        return isGzip(buffer) ? await readArchiveBytes(buffer) : readJsonBytes(buffer);
    } catch (cause) {
        throw new Error("Unsupported file type - not a valid archive or JSON", {
            cause,
        });
    }
}

async function collectReadouts(reader: Reader): Promise<Readout[]> {
    const readouts: Readout[] = [];
    for await (const readout of reader.read_all()) {
        readouts.push(readout);
    }
    if (readouts.length === 0) {
        throw new Error('File loaded but contains no coverage data.');
    }
    return readouts;
}

/**
 * Load readouts from bytes
 */
export async function loadReadoutsFromBytes(bytes: Uint8Array): Promise<Readout[]> {
    return collectReadouts(await readerFromBuffer(bytes));
}

/** Bundled RISC-V demo archive served from `viewer/public/examples/`. */
export const EXAMPLE_COVERAGE_ARCHIVE =
    "examples/riscv_stress_viewer_demo.bktgz";

/**
 * Fetch the bundled example coverage archive as a File for the normal load path.
 */
export async function fetchExampleCoverageFile(): Promise<File> {
    const url = `${import.meta.env.BASE_URL}${EXAMPLE_COVERAGE_ARCHIVE}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(
            `Could not load example coverage (HTTP ${response.status}).`,
        );
    }
    const buffer = await response.arrayBuffer();
    const fileName = EXAMPLE_COVERAGE_ARCHIVE.split("/").pop() ?? "example.bktgz";
    return new File([buffer], fileName, { type: "application/gzip" });
}

/**
 * Load readouts from a File object (web browser)
 */
export async function loadReadoutsFromFileObject(file: File): Promise<Readout[]> {
    if (!file.name.endsWith('.bktgz')) {
        throw new Error('File must be a .bktgz file');
    }
    const arrayBuffer = await file.arrayBuffer();
    return collectReadouts(await readerFromBuffer(new Uint8Array(arrayBuffer)));
}

/**
 * Load readouts from a FileSystemFileHandle (PWA file handling)
 */
export async function loadReadoutsFromFileHandle(file: FileSystemFileHandle): Promise<Readout[]> {
    const fileData = await file.getFile();
    const buffer = new Uint8Array(await fileData.arrayBuffer());
    return collectReadouts(await readerFromBuffer(buffer));
}

/**
 * Open file dialog in Electron and return selected file path(s)
 */
export async function openElectronFileDialog(): Promise<string[] | null> {
    if (!isElectron() || !window.electronAPI) {
        return null;
    }
    return window.electronAPI.openFileDialog();
}

/**
 * Load readouts from an Electron file path
 */
export async function loadReadoutsFromElectronPath(filePath: string): Promise<Readout[]> {
    if (!window.electronAPI) {
        throw new Error("Electron API unavailable");
    }
    const bytes = await window.electronAPI.readFile(filePath);
    return loadReadoutsFromBytes(bytes);
}
