/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { readFileHandle, readElectronFile } from "@/features/Dashboard/lib/readers";
import CoverageTree from "@/features/Dashboard/lib/coveragetree";

/**
 * Check if we're running in Electron
 */
export function isElectron(): boolean {
    return typeof window !== 'undefined' && window.electronAPI !== undefined;
}

/**
 * Load a file from bytes and return a CoverageTree
 */
export async function loadFileFromBytes(bytes: number[]): Promise<CoverageTree> {
    console.log('Loading file, bytes length:', bytes.length);
    const reader = await readElectronFile(bytes);
    console.log('Reader created, reading readouts...');
    const readouts: Readout[] = [];
    for await (const readout of reader.read_all()) {
        readouts.push(readout);
    }
    console.log('Readouts loaded:', readouts.length);
    if (readouts.length === 0) {
        throw new Error('File loaded but contains no coverage data.');
    }
    const newTree = CoverageTree.fromReadouts(readouts);
    console.log('Tree created, roots:', newTree.getRoots().length);
    return newTree;
}

/**
 * Load a file from a File object (web browser)
 */
export async function loadFileFromFileObject(file: File): Promise<CoverageTree> {
    if (!file.name.endsWith('.bktgz')) {
        throw new Error('File must be a .bktgz file');
    }
    const arrayBuffer = await file.arrayBuffer();
    const bytes = Array.from(new Uint8Array(arrayBuffer));
    return loadFileFromBytes(bytes);
}

/**
 * Load a file from a FileSystemFileHandle (PWA file handling)
 */
export async function loadFileFromFileHandle(file: FileSystemFileHandle): Promise<CoverageTree> {
    const reader = await readFileHandle(file);
    const readouts: Readout[] = [];
    for await (const readout of reader.read_all()) {
        readouts.push(readout);
    }
    if (readouts.length === 0) {
        throw new Error('File loaded but contains no coverage data.');
    }
    return CoverageTree.fromReadouts(readouts);
}

/**
 * Open file dialog in Electron and load the selected file
 */
export async function openElectronFileDialog(): Promise<CoverageTree | null> {
    if (!isElectron() || !window.electronAPI) {
        return null;
    }
    const filePath = await window.electronAPI.openFileDialog();
    if (!filePath) {
        return null;
    }
    const bytes = await window.electronAPI.readFile(filePath);
    return loadFileFromBytes(bytes);
}
