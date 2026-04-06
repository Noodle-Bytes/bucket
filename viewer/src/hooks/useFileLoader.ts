/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, notification } from "antd";
import CoverageTree from "../features/Dashboard/lib/coveragetree";
import {
    isElectron,
    loadReadoutsFromElectronPath,
    loadReadoutsFromFileHandle,
    loadReadoutsFromFileObject,
    openElectronFileDialog,
} from "@/services/fileLoader";
import type {
    CoverageRecord,
    CoverageSession,
    CoverageSourceRef,
    ExportFormat,
} from "@/types/coverageSession";
import { mergeReadoutsStrict } from "@/services/readoutUtils";
import { serializeReadouts } from "@/services/exportSerializers";
import { getDefaultExportFileName, saveExportBytes } from "@/services/exportSaver";

type FilePickerWindow = Window & {
    showOpenFilePicker?: (options?: {
        multiple?: boolean;
        types?: Array<{
            description?: string;
            accept: Record<string, string[]>;
        }>;
    }) => Promise<FileSystemFileHandle[]>;
};

type RefreshWarning = {
    sourceLabel: string;
    detail: string;
};

type SourceLoadPayload = {
    readouts: Readout[];
    source: Omit<CoverageSourceRef, "id">;
};

type LoadMode = "replace" | "append";

function getDefaultSession(): CoverageSession {
    return {
        records: [],
        sources: [],
        loadedRecordIds: [],
    };
}

function isNoCoverageError(errorMessage: string): boolean {
    return errorMessage.toLowerCase().includes("no coverage data");
}

async function promptCoverageFileReselect(): Promise<File | null> {
    const pickerWindow = window as FilePickerWindow;
    if (pickerWindow.showOpenFilePicker) {
        try {
            const [handle] = await pickerWindow.showOpenFilePicker({
                multiple: false,
                types: [
                    {
                        description: "Bucket Archive",
                        accept: {
                            "application/gzip": [".bktgz"],
                        },
                    },
                ],
            });
            if (!handle) {
                return null;
            }
            return handle.getFile();
        } catch {
            return null;
        }
    }

    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".bktgz";
        input.style.display = "none";
        document.body.appendChild(input);

        let settled = false;
        const cleanup = () => {
            window.removeEventListener("focus", onFocus, true);
            input.remove();
        };
        const finish = (file: File | null) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            resolve(file);
        };
        const onFocus = () => {
            setTimeout(() => {
                if (!settled) {
                    finish(null);
                }
            }, 500);
        };

        input.onchange = () => {
            const file = input.files?.[0] ?? null;
            finish(file);
        };

        window.addEventListener("focus", onFocus, true);
        input.click();
    });
}

export function useFileLoader() {
    const [session, setSession] = useState<CoverageSession>(getDefaultSession);
    const [isLoading, setIsLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const sourceCounterRef = useRef(1);
    const recordCounterRef = useRef(1);

    const tree = useMemo(() => {
        const loadedSet = new Set(session.loadedRecordIds);
        const loadedReadouts = session.records
            .filter((record) => loadedSet.has(record.id))
            .map((record) => record.readout);
        return CoverageTree.fromReadouts(loadedReadouts);
    }, [session.loadedRecordIds, session.records]);

    const setSessionFromSources = (
        sourcePayloads: SourceLoadPayload[],
        mode: LoadMode,
    ): void => {
        const sources: CoverageSourceRef[] = [];
        const records: CoverageRecord[] = [];

        for (const payload of sourcePayloads) {
            const sourceId = `source-${sourceCounterRef.current++}`;
            const sourceRef: CoverageSourceRef = {
                id: sourceId,
                ...payload.source,
            };
            sources.push(sourceRef);
            for (const [index, readout] of payload.readouts.entries()) {
                records.push({
                    id: `record-${recordCounterRef.current++}`,
                    readout,
                    sourceRef: sourceId,
                    sourceRecordIndex: index,
                    isLoaded: true,
                });
            }
        }

        const loadedRecordIds = records.map((record) => record.id);
        if (mode === "replace") {
            setSession({
                sources,
                records,
                loadedRecordIds,
            });
            return;
        }

        setSession((current) => {
            const mergedLoaded = new Set(current.loadedRecordIds);
            for (const loadedId of loadedRecordIds) {
                mergedLoaded.add(loadedId);
            }
            return {
                sources: [...current.sources, ...sources],
                records: [...current.records, ...records],
                loadedRecordIds: Array.from(mergedLoaded),
            };
        });
    };

    const loadWithSources = async (
        loadFn: () => Promise<SourceLoadPayload[]>,
        suppressNotification: boolean = false,
        mode: LoadMode = "append",
    ): Promise<{ success: boolean }> => {
        setIsLoading(true);
        setError(null);
        try {
            const payloads = await loadFn();
            if (payloads.length === 0) {
                throw new Error("No coverage files selected.");
            }
            setSessionFromSources(payloads, mode);
            return { success: true };
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(errorMessage);
            if (!suppressNotification) {
                if (isNoCoverageError(errorMessage)) {
                    notification.error({
                        message: "No Coverage Data",
                        description:
                            "The loaded .bktgz file contains no coverage data. Please ensure the file was exported correctly from a Bucket coverage run.",
                        duration: 5,
                    });
                } else {
                    notification.error({
                        message: "Failed to Load File",
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

    const handleFileInput = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
        const files = Array.from(event.target.files ?? []).filter((file) =>
            file.name.endsWith(".bktgz"),
        );
        if (files.length > 0) {
            await loadWithSources(async () => {
                const payloads: SourceLoadPayload[] = [];
                for (const file of files) {
                    payloads.push({
                        readouts: await loadReadoutsFromFileObject(file),
                        source: {
                            kind: "fileObject",
                            label: file.name,
                            fileObject: file,
                        },
                    });
                }
                return payloads;
            });
        }
        if (event.target) {
            event.target.value = "";
        }
    };

    const openFileDialog = async (): Promise<void> => {
        if (isElectron() && window.electronAPI) {
            const filePaths = await openElectronFileDialog();
            if (!filePaths || filePaths.length === 0) {
                return;
            }
            await loadWithSources(async () => {
                const payloads: SourceLoadPayload[] = [];
                for (const filePath of filePaths) {
                    payloads.push({
                        readouts: await loadReadoutsFromElectronPath(filePath),
                        source: {
                            kind: "electronPath",
                            label: filePath.split(/[\\/]/).pop() ?? filePath,
                            path: filePath,
                        },
                    });
                }
                return payloads;
            });
            return;
        }
        fileInputRef.current?.click();
    };

    const clearCoverage = (): void => {
        Modal.confirm({
            title: "Clear Coverage",
            content: "Are you sure you want to clear all coverage data?",
            okText: "Clear",
            okType: "danger",
            cancelText: "Cancel",
            onOk: () => {
                setSession(getDefaultSession());
                setError(null);
            },
        });
    };

    const setLoadedRecords = (loadedRecordIds: string[]): void => {
        const loadedSet = new Set(loadedRecordIds);
        setSession((current) => ({
            ...current,
            loadedRecordIds,
            records: current.records.map((record) => ({
                ...record,
                isLoaded: loadedSet.has(record.id),
            })),
        }));
    };

    const mergeRecords = async (recordIds: string[]): Promise<void> => {
        const selected = session.records.filter((record) => recordIds.includes(record.id));
        if (selected.length < 2) {
            notification.warning({
                message: "Merge Requires Two or More Records",
                description: "Select at least two records to merge.",
                duration: 4,
            });
            return;
        }

        try {
            const mergedReadout = mergeReadoutsStrict(selected.map((record) => record.readout));
            const sourceId = `source-${sourceCounterRef.current++}`;
            const mergedSource: CoverageSourceRef = {
                id: sourceId,
                kind: "virtualMerged",
                label: mergedReadout.get_source() ?? "Merged Record",
            };
            const mergedRecord: CoverageRecord = {
                id: `record-${recordCounterRef.current++}`,
                readout: mergedReadout,
                sourceRef: sourceId,
                sourceRecordIndex: 0,
                isLoaded: true,
            };
            setSession((current) => ({
                sources: [...current.sources, mergedSource],
                records: [...current.records, mergedRecord],
                loadedRecordIds: [...current.loadedRecordIds, mergedRecord.id],
            }));
            notification.success({
                message: "Records Merged",
                description: "Merged record added and loaded.",
                duration: 3,
            });
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            notification.error({
                message: "Merge Failed",
                description: errorMessage,
                duration: 5,
            });
        }
    };

    const refreshLoadedRecords = async (): Promise<void> => {
        setIsLoading(true);
        setError(null);

        const warnings: RefreshWarning[] = [];
        const refreshedRecordIds: string[] = [];

        try {
            const nextSources = session.sources.map((source) => ({ ...source }));
            const nextRecords = session.records.map((record) => ({ ...record }));
            const sourceById = new Map(nextSources.map((source) => [source.id, source]));

            const recordsBySource = new Map<string, CoverageRecord[]>();
            for (const record of nextRecords) {
                if (!record.isLoaded) {
                    continue;
                }
                const source = sourceById.get(record.sourceRef);
                if (!source || source.kind === "virtualMerged") {
                    continue;
                }
                const group = recordsBySource.get(source.id) ?? [];
                group.push(record);
                recordsBySource.set(source.id, group);
            }

            for (const [sourceId, records] of recordsBySource.entries()) {
                const source = sourceById.get(sourceId);
                if (!source) {
                    continue;
                }

                let refreshedReadouts: Readout[] | null = null;
                try {
                    if (source.kind === "electronPath") {
                        if (!source.path) {
                            throw new Error("Missing source file path.");
                        }
                        refreshedReadouts = await loadReadoutsFromElectronPath(source.path);
                    } else if (source.kind === "fileHandle") {
                        if (!source.fileHandle) {
                            throw new Error("Missing file handle.");
                        }
                        refreshedReadouts = await loadReadoutsFromFileHandle(source.fileHandle);
                    } else if (source.kind === "fileObject") {
                        const replacementFile = await promptCoverageFileReselect();
                        if (!replacementFile) {
                            warnings.push({
                                sourceLabel: source.label,
                                detail: "Refresh canceled; keeping currently loaded record(s).",
                            });
                            continue;
                        }
                        source.fileObject = replacementFile;
                        source.label = replacementFile.name;
                        refreshedReadouts = await loadReadoutsFromFileObject(replacementFile);
                    }
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    warnings.push({
                        sourceLabel: source.label,
                        detail: `Skipping refresh: ${message}`,
                    });
                    continue;
                }

                if (!refreshedReadouts) {
                    continue;
                }

                for (const record of records) {
                    const refreshed = refreshedReadouts[record.sourceRecordIndex];
                    if (!refreshed) {
                        warnings.push({
                            sourceLabel: source.label,
                            detail: `Record index ${record.sourceRecordIndex} no longer exists; kept stale record.`,
                        });
                        continue;
                    }
                    record.readout = refreshed;
                    refreshedRecordIds.push(record.id);
                }
            }

            setSession({
                sources: nextSources,
                records: nextRecords,
                loadedRecordIds: session.loadedRecordIds,
            });

            if (refreshedRecordIds.length > 0) {
                notification.success({
                    message: "Refresh Complete",
                    description: `Refreshed ${refreshedRecordIds.length} loaded record(s).`,
                    duration: 3,
                });
            } else {
                notification.info({
                    message: "Nothing Refreshed",
                    description: "No loaded file-backed records were refreshed.",
                    duration: 3,
                });
            }

            if (warnings.length > 0) {
                notification.warning({
                    message: "Refresh Warnings",
                    description: warnings
                        .map((warning) => `${warning.sourceLabel}: ${warning.detail}`)
                        .join(" "),
                    duration: 7,
                });
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(errorMessage);
            notification.error({
                message: "Refresh Failed",
                description: errorMessage,
                duration: 5,
            });
        } finally {
            setIsLoading(false);
        }
    };

    const exportRecords = async (options: {
        recordIds: string[];
        format: ExportFormat;
        mergeBeforeExport: boolean;
        fileBaseName?: string;
    }): Promise<void> => {
        const selected = session.records.filter(
            (record) => record.isLoaded && options.recordIds.includes(record.id),
        );
        if (selected.length === 0) {
            notification.warning({
                message: "No Records Selected",
                description: "Select at least one loaded record to export.",
                duration: 4,
            });
            return;
        }

        try {
            const exportReadouts = options.mergeBeforeExport
                ? [mergeReadoutsStrict(selected.map((record) => record.readout))]
                : selected.map((record) => record.readout);
            const bytes = serializeReadouts(exportReadouts, options.format);
            const defaultFileName = getDefaultExportFileName(
                options.format,
                options.mergeBeforeExport,
            );
            const defaultBaseName = defaultFileName.replace(/\.(bktgz|json)$/i, "");
            const rawBaseName = (options.fileBaseName ?? "").trim();
            const extension = options.format === "json" ? ".json" : ".bktgz";
            const safeBaseName =
                rawBaseName.length === 0
                    ? defaultBaseName
                    : rawBaseName.replace(/\.(bktgz|json)$/i, "");
            const fileName =
                safeBaseName.length === 0 ? defaultBaseName + extension : `${safeBaseName}${extension}`;
            const result = await saveExportBytes(bytes, options.format, fileName);
            if (!result.canceled) {
                notification.success({
                    message: "Export Complete",
                    description: `Exported ${exportReadouts.length} record(s).`,
                    duration: 3,
                });
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            notification.error({
                message: "Export Failed",
                description: errorMessage,
                duration: 5,
            });
            throw err;
        }
    };

    const handleDrop = async (e: DragEvent): Promise<void> => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            const archiveFiles = Array.from(files).filter((file) =>
                file.name.endsWith(".bktgz"),
            );
            if (archiveFiles.length > 0) {
                await loadWithSources(async () => {
                    const payloads: SourceLoadPayload[] = [];
                    for (const file of archiveFiles) {
                        payloads.push({
                            readouts: await loadReadoutsFromFileObject(file),
                            source: {
                                kind: "fileObject",
                                label: file.name,
                                fileObject: file,
                            },
                        });
                    }
                    return payloads;
                });
            } else {
                notification.warning({
                    message: "Invalid File Type",
                    description: "Please drop a .bktgz file.",
                    duration: 3,
                });
            }
        }
    };

    const handleDragOver = (e: DragEvent): void => {
        const isPivotAxisDrag = e.dataTransfer?.types?.includes("application/x-pivot-axis");
        e.preventDefault();
        if (isPivotAxisDrag) {
            return;
        }
        e.stopPropagation();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = "copy";
        }
        setIsDragging(true);
    };

    const handleDragEnter = (e: DragEvent): void => {
        const isPivotAxisDrag = e.dataTransfer?.types?.includes("application/x-pivot-axis");
        e.preventDefault();
        if (isPivotAxisDrag) {
            return;
        }
        e.stopPropagation();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = "copy";
        }
        setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        if (!e.relatedTarget || (e.relatedTarget as Node).nodeType === Node.DOCUMENT_NODE) {
            setIsDragging(false);
        }
    };

    useEffect(() => {
        if ("launchQueue" in window && window.launchQueue) {
            window.launchQueue.setConsumer(
                async (launchParams: { files: FileSystemFileHandle[] }) => {
                    try {
                        await loadWithSources(async () => {
                            const payloads: SourceLoadPayload[] = [];
                            for (const fileHandle of launchParams.files) {
                                payloads.push({
                                    readouts: await loadReadoutsFromFileHandle(fileHandle),
                                    source: {
                                        kind: "fileHandle",
                                        label: fileHandle.name,
                                        fileHandle,
                                    },
                                });
                            }
                            return payloads;
                        });
                    } catch (err) {
                        notification.error({
                            message: "Failed to Load File",
                            description: err instanceof Error ? err.message : String(err),
                            duration: 5,
                        });
                    }
                },
            );
        }

        const rootElement = document.documentElement;
        rootElement.addEventListener("drop", handleDrop);
        rootElement.addEventListener("dragover", handleDragOver);
        rootElement.addEventListener("dragenter", handleDragEnter);
        rootElement.addEventListener("dragleave", handleDragLeave);

        if (isElectron() && window.electronAPI) {
            const electronAPI = window.electronAPI;
            electronAPI.onFilesOpened(async (filePaths: string[]) => {
                try {
                    await loadWithSources(async () => {
                        const payloads: SourceLoadPayload[] = [];
                        for (const filePath of filePaths) {
                            payloads.push({
                                readouts: await loadReadoutsFromElectronPath(filePath),
                                source: {
                                    kind: "electronPath",
                                    label: filePath.split(/[\\/]/).pop() ?? filePath,
                                    path: filePath,
                                },
                            });
                        }
                        return payloads;
                    });
                } catch (err) {
                    notification.error({
                        message: "Failed to Open File",
                        description: err instanceof Error ? err.message : String(err),
                        duration: 5,
                    });
                }
            });

            electronAPI.onClearCoverage(() => {
                clearCoverage();
            });
        }

        return () => {
            rootElement.removeEventListener("drop", handleDrop);
            rootElement.removeEventListener("dragover", handleDragOver);
            rootElement.removeEventListener("dragenter", handleDragEnter);
            rootElement.removeEventListener("dragleave", handleDragLeave);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        tree,
        session,
        isLoading,
        isDragging,
        error,
        fileInputRef,
        handleFileInput,
        openFileDialog,
        clearCoverage,
        setLoadedRecords,
        mergeRecords,
        refreshLoadedRecords,
        exportRecords,
    };
}
