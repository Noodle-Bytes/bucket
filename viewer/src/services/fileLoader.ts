/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { readFileHandle, readElectronFile } from "../features/Dashboard/lib/readers";

/**
 * Check if we're running in Electron
 */
export function isElectron(): boolean {
    return typeof window !== 'undefined' && window.electronAPI !== undefined;
}

/**
 * Load readouts from bytes
 */
export async function loadReadoutsFromBytes(bytes: number[]): Promise<Readout[]> {
    const reader = await readElectronFile(bytes);
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
 * Load readouts from a File object (web browser)
 */
export async function loadReadoutsFromFileObject(file: File): Promise<Readout[]> {
    if (!file.name.endsWith('.bktgz')) {
        throw new Error('File must be a .bktgz file');
    }
    const arrayBuffer = await file.arrayBuffer();
    const bytes = Array.from(new Uint8Array(arrayBuffer));
    return loadReadoutsFromBytes(bytes);
}

/**
 * Load readouts from a FileSystemFileHandle (PWA file handling)
 */
export async function loadReadoutsFromFileHandle(file: FileSystemFileHandle): Promise<Readout[]> {
    const reader = await readFileHandle(file);
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
