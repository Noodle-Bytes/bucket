/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { useEffect, useRef, useState } from "react";
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
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    /**
     * Load a file and update the tree state
     */
    const loadFile = async (loadFn: () => Promise<CoverageTree>): Promise<void> => {
        setIsLoading(true);
        setError(null);
        try {
            const newTree = await loadFn();
            setTree(newTree);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error("Failed to load file:", err);
            setError(errorMessage);
            alert(`Failed to load file: ${errorMessage}`);
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
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.name.endsWith('.bktgz')) {
                await loadFile(() => loadFileFromFileObject(file));
            }
        }
    };

    /**
     * Handle drag over (prevent default to allow drop)
     */
    const handleDragOver = (e: DragEvent): void => {
        e.preventDefault();
        e.stopPropagation();
    };

    // Set up event listeners and Electron handlers
    useEffect(() => {
        // Chrome PWA file handling
        if ("launchQueue" in window) {
            launchQueue.setConsumer(async (launchParams) => {
                for (const file of launchParams.files as FileSystemFileHandle[]) {
                    await loadFile(() => loadFileFromFileHandle(file));
                }
            });
        }

        // Handle drag and drop (works in both Electron and web browsers)
        const rootElement = document.documentElement;
        rootElement.addEventListener('drop', handleDrop);
        rootElement.addEventListener('dragover', handleDragOver);

        // Electron-specific: Handle file opened via app.open-file (macOS)
        if (isElectron() && window.electronAPI) {
            window.electronAPI.onFileOpened(async (filePath: string) => {
                try {
                    const bytes = await window.electronAPI!.readFile(filePath);
                    await loadFile(() => loadFileFromBytes(bytes));
                } catch (error) {
                    console.error("Failed to open file:", error);
                }
            });
        }

        return () => {
            rootElement.removeEventListener('drop', handleDrop);
            rootElement.removeEventListener('dragover', handleDragOver);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return {
        tree,
        setTree,
        isLoading,
        error,
        fileInputRef,
        handleFileInput,
        openFileDialog,
    };
}
