/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved
 */

import { useRoutes } from "react-router-dom";
import Dashboard from "@/features/Dashboard";
import CoverageTree from "@/features/Dashboard/lib/coveragetree";
import { readFileHandle, readElectronFile } from "@/features/Dashboard/lib/readers";
import { useEffect, useState, useRef } from "react";

function getDefaultTree() {
    // Start with an empty tree - no mock data
    return new CoverageTree([]);
}

// Check if we're running in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

export const AppRoutes = () => {

    const [tree, setTree] = useState(getDefaultTree());
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadFileFromBytes = async (bytes: number[]) => {
        try {
            console.log('Loading file, bytes length:', bytes.length);
            const reader = await readElectronFile(bytes);
            console.log('Reader created, reading readouts...');
            const readouts: Readout[] = [];
            for await (const readout of reader.read_all()) {
                readouts.push(readout);
            }
            console.log('Readouts loaded:', readouts.length);
            if (readouts.length === 0) {
                alert('The loaded .bktgz file contains no coverage data. Please ensure the file was exported correctly from a Bucket coverage run.');
                return;
            }
            const newTree = CoverageTree.fromReadouts(readouts);
            console.log('Tree created, roots:', newTree.getRoots().length);
            setTree(newTree);
        } catch (error) {
            console.error("Failed to load file:", error);
            alert(`Failed to load file: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    const handleFileInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && file.name.endsWith('.bktgz')) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const bytes = Array.from(new Uint8Array(arrayBuffer));
                await loadFileFromBytes(bytes);
            } catch (error) {
                console.error("Failed to load file:", error);
                alert(`Failed to load file: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        // Reset input so same file can be selected again
        if (event.target) {
            event.target.value = '';
        }
    };

    const openFileDialog = async () => {
        if (isElectron && window.electronAPI) {
            // Electron file picker
            const filePath = await window.electronAPI.openFileDialog();
            if (filePath) {
                try {
                    const bytes = await window.electronAPI.readFile(filePath);
                    await loadFileFromBytes(bytes);
                } catch (error) {
                    console.error("Failed to open file:", error);
                    alert(`Failed to open file: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        } else {
            // Web browser file picker
            fileInputRef.current?.click();
        }
    };

    useEffect(() => {
        // Chrome PWA file handling
        if ("launchQueue" in window) {
            launchQueue.setConsumer(async (launchParams) => {
                const readouts: Readout[] = [];
                for (const file of launchParams.files as FileSystemFileHandle[]) {
                    const reader = await readFileHandle(file);
                    for await (const readout of reader.read_all()) {
                        readouts.push(readout)
                    }
                }
                setTree(CoverageTree.fromReadouts(readouts));
            });
        }

        // Handle drag and drop (works in both Electron and web browsers)
        const handleDrop = async (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                const file = files[0];
                if (file.name.endsWith('.bktgz')) {
                    try {
                        const arrayBuffer = await file.arrayBuffer();
                        const bytes = Array.from(new Uint8Array(arrayBuffer));
                        await loadFileFromBytes(bytes);
                    } catch (error) {
                        console.error("Failed to load dropped file:", error);
                        alert(`Failed to load file: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
        };

        const handleDragOver = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };

        const rootElement = document.documentElement;
        rootElement.addEventListener('drop', handleDrop);
        rootElement.addEventListener('dragover', handleDragOver);

        // Electron-specific: Handle file opened via app.open-file (macOS)
        if (isElectron && window.electronAPI) {
            window.electronAPI.onFileOpened(async (filePath: string) => {
                try {
                    const bytes = await window.electronAPI.readFile(filePath);
                    await loadFileFromBytes(bytes);
                } catch (error) {
                    console.error("Failed to open file:", error);
                }
            });
        }

        return () => {
            rootElement.removeEventListener('drop', handleDrop);
            rootElement.removeEventListener('dragover', handleDragOver);
        };
    }, [])

    const element = useRoutes([{
        path: "*",
        element: (
            <>
                {/* Hidden file input for web browsers */}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileInput}
                    accept=".bktgz"
                    style={{ display: 'none' }}
                />
                <Dashboard tree={tree} onOpenFile={openFileDialog} />
            </>
        )
    }]);
    return <>{element}</>;
};
