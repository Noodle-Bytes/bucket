/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { useRoutes } from "react-router-dom";
import Dashboard from "@/features/Dashboard";
import CoverageTree from "@/features/Dashboard/lib/coveragetree";
import { readFileHandle, readElectronFile } from "@/features/Dashboard/lib/readers";
import { useEffect, useState, useRef } from "react";
import { notification, Spin } from "antd";

function getDefaultTree() {
    // Start with an empty tree - no mock data
    return new CoverageTree([]);
}

// Check if we're running in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

export const AppRoutes = () => {
    const [tree, setTree] = useState(getDefaultTree());
    const [loading, setLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadFileFromBytes = async (bytes: number[]) => {
        setLoading(true);
        try {
            if (process.env.NODE_ENV === 'development') {
                console.log('Loading file, bytes length:', bytes.length);
            }
            const reader = await readElectronFile(bytes);
            if (process.env.NODE_ENV === 'development') {
                console.log('Reader created, reading readouts...');
            }
            const readouts: Readout[] = [];
            for await (const readout of reader.read_all()) {
                readouts.push(readout);
            }
            if (process.env.NODE_ENV === 'development') {
                console.log('Readouts loaded:', readouts.length);
            }
            if (readouts.length === 0) {
                notification.error({
                    message: 'No Coverage Data',
                    description: 'The loaded .bktgz file contains no coverage data. Please ensure the file was exported correctly from a Bucket coverage run.',
                    duration: 5,
                });
                setLoading(false);
                return;
            }
            const newTree = CoverageTree.fromReadouts(readouts);
            if (process.env.NODE_ENV === 'development') {
                console.log('Tree created, roots:', newTree.getRoots().length);
            }
            setTree(newTree);
            notification.success({
                message: 'File Loaded',
                description: `Successfully loaded ${readouts.length} coverage readout(s).`,
                duration: 3,
            });
        } catch (error) {
            console.error("Failed to load file:", error);
            notification.error({
                message: 'Failed to Load File',
                description: error instanceof Error ? error.message : String(error),
                duration: 5,
            });
        } finally {
            setLoading(false);
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
                notification.error({
                    message: 'Failed to Load File',
                    description: error instanceof Error ? error.message : String(error),
                    duration: 5,
                });
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
                    notification.error({
                        message: 'Failed to Open File',
                        description: error instanceof Error ? error.message : String(error),
                        duration: 5,
                    });
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
            setIsDragging(false);
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
                        notification.error({
                            message: 'Failed to Load File',
                            description: error instanceof Error ? error.message : String(error),
                            duration: 5,
                        });
                    }
                } else {
                    notification.warning({
                        message: 'Invalid File Type',
                        description: 'Please drop a .bktgz file.',
                        duration: 3,
                    });
                }
            }
        };

        const handleDragOver = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'copy';
            }
            setIsDragging(true);
        };

        const handleDragLeave = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            // Only set dragging to false if we're leaving the window
            if (!e.relatedTarget || (e.relatedTarget as Node).nodeType === Node.DOCUMENT_NODE) {
                setIsDragging(false);
            }
        };

        const handleDragEnter = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'copy';
            }
            setIsDragging(true);
        };

        const rootElement = document.documentElement;
        rootElement.addEventListener('drop', handleDrop);
        rootElement.addEventListener('dragover', handleDragOver);
        rootElement.addEventListener('dragenter', handleDragEnter);
        rootElement.addEventListener('dragleave', handleDragLeave);

        // Electron-specific: Handle file opened via app.open-file (macOS)
        if (isElectron && window.electronAPI) {
            window.electronAPI.onFileOpened(async (filePath: string) => {
                try {
                    const bytes = await window.electronAPI.readFile(filePath);
                    await loadFileFromBytes(bytes);
                } catch (error) {
                    console.error("Failed to open file:", error);
                    notification.error({
                        message: 'Failed to Open File',
                        description: error instanceof Error ? error.message : String(error),
                        duration: 5,
                    });
                }
            });
        }

        return () => {
            rootElement.removeEventListener('drop', handleDrop);
            rootElement.removeEventListener('dragover', handleDragOver);
            rootElement.removeEventListener('dragenter', handleDragEnter);
            rootElement.removeEventListener('dragleave', handleDragLeave);
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
                <Spin spinning={loading} size="large" tip="Loading coverage data...">
                    <Dashboard tree={tree} onOpenFile={openFileDialog} isDragging={isDragging} />
                </Spin>
            </>
        )
    }]);
    return <>{element}</>;
};
