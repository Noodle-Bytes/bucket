/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button, Flex, Typography } from "antd";
import { getThemePreference } from "@/utils/themePreference";
import { infoThemed } from "@/utils/themedStaticModal";
import { notifyError, notifyInfo, notifySuccess, notifyWarning } from "@/utils/themedStaticNotification";
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
import { buildReadableReportHtml } from "@/services/readableReport";

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

type BulkLoadStrategy = "merge" | "individual" | "compare";

export type PendingCompareActivation = {
    recordIdA: string;
    recordIdB: string;
};

type SourceLoadBatchResult = {
    recordIds: string[];
    sourceIds: string[];
    recordsBySourceId: Map<string, string[]>;
};

/** Offer merge vs individual load when more than one archive is selected in one action. */
const BULK_MERGE_THRESHOLD = 1;
/** Warn that loading many separate records may slow the viewer. */
const BULK_LOAD_SLOW_WARNING_THRESHOLD = 50;

type ArchiveFileItem =
    | { kind: "fileObject"; file: File }
    | { kind: "electronPath"; path: string }
    | { kind: "fileHandle"; handle: FileSystemFileHandle };

export type LoadingProgress = {
    completed: number;
    total: number;
    /** `reading` = parsing archives; `applying` = merge or committing huge session state (blocks UI). */
    phase?: "reading" | "applying";
    /** Meaningful when `phase === "applying"`. */
    applyingKind?: BulkLoadStrategy;
};

function yieldToBrowser(): Promise<void> {
    return new Promise((resolve) => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
        });
    });
}

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

function promptBulkLoadStrategy(
    fileCount: number,
): Promise<BulkLoadStrategy | "cancel"> {
    return new Promise((resolve) => {
        let settled = false;
        let destroyModal: (() => void) | null = null;
        const pref = getThemePreference();
        const cl = pref.theme.colors;
        const border = cl.secondarybg.value;
        const txt = cl.primarytxt.value;
        const muted = cl.desaturatedtxt.value;
        const canOfferCompare = fileCount === 2;
        const warnManySeparateLoads = fileCount >= BULK_LOAD_SLOW_WARNING_THRESHOLD;

        const finish = (choice: BulkLoadStrategy | "cancel") => {
            if (settled) {
                return;
            }
            settled = true;
            window.removeEventListener("keydown", onKeyDown, true);
            destroyModal?.();
            resolve(choice);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape") {
                return;
            }
            e.preventDefault();
            finish("cancel");
        };
        const archiveWord = fileCount === 1 ? "archive" : "archives";
        const footerChrome = {
            width: "100%",
            boxSizing: "border-box" as const,
            borderTop: `1px solid ${border}`,
            marginTop: 4,
            paddingTop: 14,
            paddingBottom: 2,
        };
        const instance = infoThemed({
            title: `Load ${fileCount} coverage ${archiveWord}`,
            icon: null,
            width: canOfferCompare ? 440 : 520,
            maskClosable: false,
            closable: false,
            keyboard: true,
            onCancel: () => finish("cancel"),
            content: canOfferCompare ? (
                <>
                    <Typography.Paragraph
                        style={{ marginBottom: 10, fontSize: 14, color: txt, lineHeight: 1.5 }}
                    >
                        Choose how to open these two archives. Compare works best when you want
                        side-by-side A/B coverage differences.
                    </Typography.Paragraph>
                    <Typography.Paragraph
                        style={{ marginBottom: 0, fontSize: 13, color: muted, lineHeight: 1.5 }}
                    >
                        Merged results exist only for this session — export to keep them.
                    </Typography.Paragraph>
                </>
            ) : (
                <>
                    <Typography.Paragraph
                        style={{ marginBottom: 10, fontSize: 14, color: txt, lineHeight: 1.5 }}
                    >
                        {warnManySeparateLoads
                            ? `Loading ${fileCount.toLocaleString()} archives as separate records can slow the viewer. You can merge them into one loaded record to keep things responsive, or load each archive as its own record.`
                            : "Merge the archives into one loaded record, or load each archive as its own record."}
                    </Typography.Paragraph>
                    <Typography.Paragraph
                        style={{ marginBottom: 0, fontSize: 14, color: txt, lineHeight: 1.5 }}
                    >
                        <Typography.Text strong style={{ color: txt }}>
                            Note:
                        </Typography.Text>{" "}
                        <span style={{ color: muted, opacity: 0.95 }}>
                            A merged result exists only in this session. Use Export to save an
                            Archive or JSON file if you want to keep it.
                        </span>
                    </Typography.Paragraph>
                </>
            ),
            footer: canOfferCompare ? (
                <div style={footerChrome}>
                    <Flex vertical gap={8}>
                        <Button type="primary" block onClick={() => finish("compare")}>
                            Compare
                        </Button>
                        <Flex gap={8}>
                            <Button block onClick={() => finish("individual")}>
                                Load individually
                            </Button>
                            <Button block onClick={() => finish("merge")}>
                                Merge into one
                            </Button>
                        </Flex>
                        <Button type="text" onClick={() => finish("cancel")}>
                            Cancel
                        </Button>
                    </Flex>
                </div>
            ) : (
                <div style={footerChrome}>
                    <Flex justify="flex-end" gap={8} wrap="wrap">
                        <Button onClick={() => finish("cancel")}>Cancel</Button>
                        <Button onClick={() => finish("individual")}>Load individually</Button>
                        <Button type="primary" onClick={() => finish("merge")}>
                            Merge into one record
                        </Button>
                    </Flex>
                </div>
            ),
        });
        destroyModal = instance.destroy;
        window.addEventListener("keydown", onKeyDown, true);
    });
}

async function loadPayloadFromArchiveItem(item: ArchiveFileItem): Promise<SourceLoadPayload> {
    switch (item.kind) {
        case "fileObject":
            return {
                readouts: await loadReadoutsFromFileObject(item.file),
                source: {
                    kind: "fileObject",
                    label: item.file.name,
                    fileObject: item.file,
                },
            };
        case "electronPath":
            return {
                readouts: await loadReadoutsFromElectronPath(item.path),
                source: {
                    kind: "electronPath",
                    label: item.path.split(/[\\/]/).pop() ?? item.path,
                    path: item.path,
                },
            };
        case "fileHandle":
            return {
                readouts: await loadReadoutsFromFileHandle(item.handle),
                source: {
                    kind: "fileHandle",
                    label: item.handle.name,
                    fileHandle: item.handle,
                },
            };
    }
}

export function useFileLoader() {
    const [session, setSession] = useState<CoverageSession>(getDefaultSession);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState<LoadingProgress | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingCompareActivation, setPendingCompareActivation] =
        useState<PendingCompareActivation | null>(null);
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
    ): SourceLoadBatchResult => {
        const sources: CoverageSourceRef[] = [];
        const records: CoverageRecord[] = [];
        const recordsBySourceId = new Map<string, string[]>();

        for (const payload of sourcePayloads) {
            const sourceId = `source-${sourceCounterRef.current++}`;
            const sourceRef: CoverageSourceRef = {
                id: sourceId,
                ...payload.source,
            };
            sources.push(sourceRef);
            for (const [index, readout] of payload.readouts.entries()) {
                const recordId = `record-${recordCounterRef.current++}`;
                records.push({
                    id: recordId,
                    readout,
                    sourceRef: sourceId,
                    sourceRecordIndex: index,
                    isLoaded: true,
                });
                const sourceRecordIds = recordsBySourceId.get(sourceId) ?? [];
                sourceRecordIds.push(recordId);
                recordsBySourceId.set(sourceId, sourceRecordIds);
            }
        }

        const loadedRecordIds = records.map((record) => record.id);
        if (mode === "replace") {
            setSession({
                sources,
                records,
                loadedRecordIds,
            });
        } else {
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
        }

        return {
            recordIds: loadedRecordIds,
            sourceIds: sources.map((source) => source.id),
            recordsBySourceId,
        };
    };

    const resolveCompareActivation = (
        batch: SourceLoadBatchResult,
    ): PendingCompareActivation | null => {
        if (batch.sourceIds.length !== 2) {
            return null;
        }
        const firstA = batch.recordsBySourceId.get(batch.sourceIds[0])?.[0];
        const firstB = batch.recordsBySourceId.get(batch.sourceIds[1])?.[0];
        if (!firstA || !firstB) {
            return null;
        }
        return { recordIdA: firstA, recordIdB: firstB };
    };

    const loadArchiveBatch = async (
        items: ArchiveFileItem[],
        suppressNotification: boolean = false,
        mode: LoadMode = "append",
    ): Promise<{ success: boolean }> => {
        if (items.length === 0) {
            return { success: false };
        }

        let strategy: BulkLoadStrategy = "individual";
        if (items.length > BULK_MERGE_THRESHOLD) {
            const choice = await promptBulkLoadStrategy(items.length);
            if (choice === "cancel") {
                return { success: false };
            }
            strategy = choice;
        }

        setIsLoading(true);
        setError(null);
        setLoadingProgress({ completed: 0, total: items.length, phase: "reading" });
        try {
            const payloads: SourceLoadPayload[] = [];
            for (let i = 0; i < items.length; i++) {
                payloads.push(await loadPayloadFromArchiveItem(items[i]));
                setLoadingProgress({ completed: i + 1, total: items.length, phase: "reading" });
            }
            // Let the UI paint the fully-complete file-read progress before final apply starts.
            await yieldToBrowser();

            setLoadingProgress({
                completed: items.length,
                total: items.length,
                phase: "applying",
                applyingKind: strategy,
            });
            await yieldToBrowser();

            if (strategy === "merge") {
                const allReadouts = payloads.flatMap((payload) => payload.readouts);
                if (allReadouts.length === 0) {
                    throw new Error("No coverage data");
                }
                const mergedReadout = mergeReadoutsStrict(allReadouts);
                setSessionFromSources(
                    [
                        {
                            readouts: [mergedReadout],
                            source: {
                                kind: "virtualMerged",
                                label: `Merged (${items.length} archives)`,
                            },
                        },
                    ],
                    mode,
                );
                notifySuccess({
                    message: "Merged load complete",
                    description:
                        "One merged record is in the viewer. Export to .bktgz or JSON if you want to save it.",
                    duration: 5,
                });
            } else {
                const batch = setSessionFromSources(payloads, mode);
                if (strategy === "compare") {
                    const activation = resolveCompareActivation(batch);
                    if (activation) {
                        setPendingCompareActivation(activation);
                        notifySuccess({
                            message: "Compare load complete",
                            description: "Opening compare mode for the two loaded records.",
                            duration: 4,
                        });
                    } else {
                        notifyWarning({
                            message: "Compare unavailable",
                            description:
                                "Compare needs one record from each archive. The files were loaded individually instead.",
                            duration: 5,
                        });
                    }
                }
            }
            return { success: true };
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(errorMessage);
            if (!suppressNotification) {
                if (isNoCoverageError(errorMessage)) {
                    notifyError({
                        message: "No Coverage Data",
                        description:
                            "The loaded .bktgz file contains no coverage data. Please ensure the file was exported correctly from a Bucket coverage run.",
                        duration: 5,
                    });
                } else {
                    notifyError({
                        message: "Failed to Load File",
                        description: errorMessage,
                        duration: 5,
                    });
                }
            }
            return { success: false };
        } finally {
            setIsLoading(false);
            setLoadingProgress(null);
        }
    };

    const handleFileInput = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
        const files = Array.from(event.target.files ?? []).filter((file) =>
            file.name.endsWith(".bktgz"),
        );
        if (files.length > 0) {
            await loadArchiveBatch(files.map((file) => ({ kind: "fileObject" as const, file })));
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
            await loadArchiveBatch(
                filePaths.map((path) => ({ kind: "electronPath" as const, path })),
            );
            return;
        }
        fileInputRef.current?.click();
    };

    const clearCoverage = (): void => {
        setSession(getDefaultSession());
        setError(null);
        setPendingCompareActivation(null);
    };

    const clearPendingCompareActivation = (): void => {
        setPendingCompareActivation(null);
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
            notifyWarning({
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
            notifySuccess({
                message: "Records Merged",
                description: "Merged record added and loaded.",
                duration: 3,
            });
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            notifyError({
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
                notifySuccess({
                    message: "Refresh Complete",
                    description: `Refreshed ${refreshedRecordIds.length} loaded record(s).`,
                    duration: 3,
                });
            } else {
                notifyInfo({
                    message: "Nothing Refreshed",
                    description: "No loaded file-backed records were refreshed.",
                    duration: 3,
                });
            }

            if (warnings.length > 0) {
                notifyWarning({
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
            notifyError({
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
            notifyWarning({
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
            const bytes =
                options.format === "html"
                    ? new TextEncoder().encode(
                          buildReadableReportHtml(exportReadouts, { results: true }),
                      )
                    : serializeReadouts(exportReadouts, options.format);
            const defaultFileName = getDefaultExportFileName(
                options.format,
                options.mergeBeforeExport,
            );
            const defaultBaseName = defaultFileName.replace(/\.(bktgz|json|html)$/i, "");
            const rawBaseName = (options.fileBaseName ?? "").trim();
            const extension = `.${options.format === "bktgz" ? "bktgz" : options.format}`;
            const safeBaseName =
                rawBaseName.length === 0
                    ? defaultBaseName
                    : rawBaseName.replace(/\.(bktgz|json|html)$/i, "");
            const fileName =
                safeBaseName.length === 0 ? defaultBaseName + extension : `${safeBaseName}${extension}`;
            const result = await saveExportBytes(bytes, options.format, fileName);
            if (!result.canceled) {
                notifySuccess({
                    message: "Export Complete",
                    description: `Exported ${exportReadouts.length} record(s).`,
                    duration: 3,
                });
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            notifyError({
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
                await loadArchiveBatch(
                    archiveFiles.map((file) => ({ kind: "fileObject" as const, file })),
                );
            } else {
                notifyWarning({
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
                        await loadArchiveBatch(
                            launchParams.files.map((handle) => ({
                                kind: "fileHandle" as const,
                                handle,
                            })),
                        );
                    } catch (err) {
                        notifyError({
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
                    await loadArchiveBatch(
                        filePaths.map((path) => ({ kind: "electronPath" as const, path })),
                    );
                } catch (err) {
                    notifyError({
                        message: "Failed to Open File",
                        description: err instanceof Error ? err.message : String(err),
                        duration: 5,
                    });
                }
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
        loadingProgress,
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
        pendingCompareActivation,
        clearPendingCompareActivation,
    };
}
