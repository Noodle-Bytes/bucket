/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved
 */

import { useRoutes } from "react-router-dom";
import Dashboard from "@/features/Dashboard";
import CoverageTree from "@/features/Dashboard/lib/coveragetree";
import { readFileHandle, readElectronFile } from "@/features/Dashboard/lib/readers";
import { useEffect, useState, useRef, useCallback } from "react";
import { notification, Spin, Modal } from "antd";

function getDefaultTree() {
    // Start with an empty tree - no mock data
    return new CoverageTree([]);
}

// Check if we're running in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

export const AppRoutes = () => {

    const [tree, setTree] = useState(getDefaultTree());
    const [allReadouts, setAllReadouts] = useState<Readout[]>([]);
    const [loading, setLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState<{ current: number; total: number } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const clearCoverage = useCallback(() => {
        Modal.confirm({
            title: 'Clear Coverage',
            content: 'Are you sure you want to clear all coverage data? This action cannot be undone.',
            okText: 'Clear',
            okType: 'danger',
            cancelText: 'Cancel',
            onOk: () => {
                setTree(getDefaultTree());
                setAllReadouts([]);
                notification.info({
                    message: 'Coverage Cleared',
                    description: 'All coverage data has been cleared.',
                    duration: 2,
                });
            },
        });
    }, []);

    const loadFileFromBytes = async (bytes: number[], suppressNotification: boolean = false) => {
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
                if (!suppressNotification) {
                    notification.error({
                        message: 'No Coverage Data',
                        description: 'The loaded .bktgz file contains no coverage data. Please ensure the file was exported correctly from a Bucket coverage run.',
                        duration: 5,
                    });
                }
                return { success: false, readouts: [] };
            }
            // Merge new readouts with existing ones
            setAllReadouts(prevReadouts => {
                const mergedReadouts = [...prevReadouts, ...readouts];
                const newTree = CoverageTree.fromReadouts(mergedReadouts);
                if (process.env.NODE_ENV === 'development') {
                    console.log('Tree created, roots:', newTree.getRoots().length);
                }
                setTree(newTree);
                if (!suppressNotification) {
                    notification.success({
                        message: 'File Loaded',
                        description: `Successfully loaded ${readouts.length} coverage readout(s). Total: ${mergedReadouts.length} readout(s).`,
                        duration: 3,
                    });
                }
                return mergedReadouts;
            });
            return { success: true, readouts };
        } catch (error) {
            console.error("Failed to load file:", error);
            if (!suppressNotification) {
                notification.error({
                    message: 'Failed to Load File',
                    description: error instanceof Error ? error.message : String(error),
                    duration: 5,
                });
            }
            return { success: false, readouts: [], error };
        }
    };

    const loadFilesBatch = async (fileLoaders: Array<() => Promise<number[]>>) => {
        const totalFiles = fileLoaders.length;
        if (totalFiles === 0) return;

        setLoading(true);
        setLoadingProgress({ current: 0, total: totalFiles });

        let successCount = 0;
        let errorCount = 0;
        let totalReadouts = 0;

        for (let i = 0; i < fileLoaders.length; i++) {
            setLoadingProgress({ current: i + 1, total: totalFiles });
            try {
                const bytes = await fileLoaders[i]();
                const result = await loadFileFromBytes(bytes, true); // Suppress individual notifications
                if (result.success) {
                    successCount++;
                    totalReadouts += result.readouts.length;
                } else {
                    errorCount++;
                }
            } catch (error) {
                console.error("Failed to load file:", error);
                errorCount++;
            }
        }

        setLoading(false);
        setLoadingProgress(null);

        // Show single summary notification
        if (errorCount === 0) {
            const fileText = successCount === 1 ? 'file' : 'files';
            const readoutText = totalReadouts === 1 ? 'readout' : 'readouts';
            notification.success({
                message: successCount === 1 ? 'File Loaded' : 'Files Loaded',
                description: `Successfully loaded ${successCount} ${fileText} with ${totalReadouts} coverage ${readoutText}.`,
                duration: 4,
            });
        } else {
            const fileText = successCount === 1 ? 'file' : 'files';
            const readoutText = totalReadouts === 1 ? 'readout' : 'readouts';
            const errorFileText = errorCount === 1 ? 'file' : 'files';
            notification.warning({
                message: 'Files Loaded with Errors',
                description: `Successfully loaded ${successCount} ${fileText} with ${totalReadouts} coverage ${readoutText}. ${errorCount} ${errorFileText} failed.`,
                duration: 5,
            });
        }
    };

    const handleFileInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            const bktgzFiles = Array.from(files).filter(file => file.name.endsWith('.bktgz'));
            if (bktgzFiles.length === 0) {
                notification.warning({
                    message: 'No Valid Files',
                    description: 'Please select .bktgz files.',
                    duration: 3,
                });
                if (event.target) {
                    event.target.value = '';
                }
                return;
            }

            const fileLoaders = bktgzFiles.map(file => async () => {
                const arrayBuffer = await file.arrayBuffer();
                return Array.from(new Uint8Array(arrayBuffer));
            });

            await loadFilesBatch(fileLoaders);
        }
        // Reset input so same file can be selected again
        if (event.target) {
            event.target.value = '';
        }
    };

    const openFileDialog = async () => {
        if (isElectron && window.electronAPI) {
            // Electron file picker
            const filePaths = await window.electronAPI.openFileDialog();
            if (filePaths && filePaths.length > 0) {
                const fileLoaders = filePaths.map(filePath => async () => {
                    return await window.electronAPI!.readFile(filePath);
                });
                await loadFilesBatch(fileLoaders);
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
                // Filter for .bktgz files
                const bktgzFiles = Array.from(files).filter(file => file.name.endsWith('.bktgz'));

                if (bktgzFiles.length === 0) {
                    notification.warning({
                        message: 'Invalid File Type',
                        description: 'Please drop .bktgz files.',
                        duration: 3,
                    });
                    return;
                }

                const fileLoaders = bktgzFiles.map(file => async () => {
                    const arrayBuffer = await file.arrayBuffer();
                    return Array.from(new Uint8Array(arrayBuffer));
                });

                await loadFilesBatch(fileLoaders);
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

        // Electron-specific: Handle file opened via app.open-file (macOS) or menu
        if (isElectron && window.electronAPI) {
            const handleFilesOpened = async (filePaths: string[]) => {
                const fileLoaders = filePaths.map(filePath => async () => {
                    return await window.electronAPI!.readFile(filePath);
                });
                await loadFilesBatch(fileLoaders);
            };

            window.electronAPI.onFilesOpened(handleFilesOpened);
            window.electronAPI.onClearCoverage(clearCoverage);

            // Cleanup: Note - ipcRenderer.on listeners persist, but we register it here
            // The listener will be active for the lifetime of the window
        }

        return () => {
            rootElement.removeEventListener('drop', handleDrop);
            rootElement.removeEventListener('dragover', handleDragOver);
            rootElement.removeEventListener('dragenter', handleDragEnter);
            rootElement.removeEventListener('dragleave', handleDragLeave);
        };
    }, [clearCoverage])

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
                    multiple
                    style={{ display: 'none' }}
                />
                <Spin
                    spinning={loading}
                    size="large"
                    tip={loadingProgress
                        ? `Loading file ${loadingProgress.current} of ${loadingProgress.total}...`
                        : "Loading coverage data..."}
                >
                    <Dashboard tree={tree} onOpenFile={openFileDialog} onClearCoverage={clearCoverage} isDragging={isDragging} />
                </Spin>
            </>
        )
    }]);
    return <>{element}</>;
};
