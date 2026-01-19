/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { useEffect, useRef, useState } from "react";
import { notification } from "antd";
import CoverageTree from "@/features/Dashboard/lib/coveragetree";
import {
    isElectron,
    loadFileFromBytes,
    loadFileFromFileObject,
    loadFileFromFileHandle,
    openElectronFileDialog,
} from "@/services/fileLoader";

/**
 * Get the default empty tree
 */
function getDefaultTree(): CoverageTree {
    return new CoverageTree([]);
}

/**
 * Custom hook for managing file loading and tree state
 */
export function useFileLoader() {
    const [tree, setTree] = useState<CoverageTree>(getDefaultTree);
    const [isLoading, setIsLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    /**
     * Load a file and update the tree state
     */
    const loadFile = async (loadFn: () => Promise<CoverageTree>, suppressNotification: boolean = false): Promise<{ success: boolean }> => {
        setIsLoading(true);
        setError(null);
        try {
            const newTree = await loadFn();
            setTree(newTree);

            if (!suppressNotification) {
                notification.success({
                    message: 'File Loaded',
                    description: 'Successfully loaded coverage data.',
                    duration: 3,
                });
            }
            return { success: true };
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error("Failed to load file:", err);
            setError(errorMessage);
            if (!suppressNotification) {
                if (errorMessage.includes('no coverage data')) {
                    notification.error({
                        message: 'No Coverage Data',
                        description: 'The loaded .bktgz file contains no coverage data. Please ensure the file was exported correctly from a Bucket coverage run.',
                        duration: 5,
                    });
                } else {
                    notification.error({
                        message: 'Failed to Load File',
                        description: errorMessage,
                        duration: 5,
                    });
                }
            }
            return { success: false };
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Handle file input change (web browser file picker)
     */
    const handleFileInput = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = event.target.files?.[0];
        if (file) {
            await loadFile(() => loadFileFromFileObject(file));
        }
        // Reset input so same file can be selected again
        if (event.target) {
            event.target.value = '';
        }
    };

    /**
     * Open file dialog (Electron or web browser)
     */
    const openFileDialog = async (): Promise<void> => {
        if (isElectron() && window.electronAPI) {
            // Electron file picker
            const result = await openElectronFileDialog();
            if (result) {
                setTree(result);
            }
        } else {
            // Web browser file picker
            fileInputRef.current?.click();
        }
    };

    /**
     * Handle drag and drop
     */
    const handleDrop = async (e: DragEvent): Promise<void> => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.name.endsWith('.bktgz')) {
                await loadFile(() => loadFileFromFileObject(file));
            } else {
                notification.warning({
                    message: 'Invalid File Type',
                    description: 'Please drop a .bktgz file.',
                    duration: 3,
                });
            }
        }
    };

    /**
     * Handle drag over (prevent default to allow drop)
     */
    const handleDragOver = (e: DragEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy';
        }
        setIsDragging(true);
    };

    /**
     * Handle drag enter
     */
    const handleDragEnter = (e: DragEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy';
        }
        setIsDragging(true);
    };

    /**
     * Handle drag leave
     */
    const handleDragLeave = (e: DragEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        // Only set dragging to false if we're leaving the window
        if (!e.relatedTarget || (e.relatedTarget as Node).nodeType === Node.DOCUMENT_NODE) {
            setIsDragging(false);
        }
    };

    // Set up event listeners and Electron handlers
    useEffect(() => {
        // Chrome PWA file handling
        if ("launchQueue" in window && window.launchQueue) {
            window.launchQueue.setConsumer(async (launchParams: { files: FileSystemFileHandle[] }) => {
                for (const file of launchParams.files) {
                    await loadFile(() => loadFileFromFileHandle(file));
                }
            });
        }

        // Handle drag and drop (works in both Electron and web browsers)
        const rootElement = document.documentElement;
        rootElement.addEventListener('drop', handleDrop);
        rootElement.addEventListener('dragover', handleDragOver);
        rootElement.addEventListener('dragenter', handleDragEnter);
        rootElement.addEventListener('dragleave', handleDragLeave);

        // Electron-specific: Handle file opened via app.open-file (macOS)
        if (isElectron() && window.electronAPI) {
            const electronAPI = window.electronAPI;
            electronAPI.onFileOpened(async (filePath: string) => {
                try {
                    const bytes = await electronAPI.readFile(filePath);
                    await loadFile(() => loadFileFromBytes(bytes));
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
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return {
        tree,
        setTree,
        isLoading,
        isDragging,
        error,
        fileInputRef,
        handleFileInput,
        openFileDialog,
    };
}
