/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import type { ExportFormat } from "@/types/coverageSession";
import { isElectron } from "@/services/fileLoader";

type SaveResult = {
    canceled: boolean;
    path?: string;
};

type SaveFilePickerWindow = Window & {
    showSaveFilePicker?: (options?: {
        suggestedName?: string;
        types?: Array<{
            description?: string;
            accept: Record<string, string[]>;
        }>;
    }) => Promise<FileSystemFileHandle>;
};

function getMimeType(format: ExportFormat): string {
    return format === "json" ? "application/json" : "application/gzip";
}

function getExtension(format: ExportFormat): string {
    return format === "json" ? "json" : "bktgz";
}

/** User closed the save picker without choosing a file — not a write failure. */
function isSavePickerUserAbort(error: unknown): boolean {
    if (error instanceof DOMException && error.name === "AbortError") {
        return true;
    }
    return error instanceof Error && error.name === "AbortError";
}

export function getDefaultExportFileName(format: ExportFormat, merged: boolean): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hour = String(now.getHours()).padStart(2, "0");
    const minute = String(now.getMinutes()).padStart(2, "0");
    const second = String(now.getSeconds()).padStart(2, "0");
    const prefix = merged ? "bucket_merged" : "bucket_export";
    return `${prefix}_${year}${month}${day}_${hour}${minute}${second}.${getExtension(format)}`;
}

export async function saveExportBytes(
    bytes: Uint8Array,
    format: ExportFormat,
    defaultFileName: string,
): Promise<SaveResult> {
    const arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;

    if (isElectron() && window.electronAPI?.saveExportFile) {
        return window.electronAPI.saveExportFile({
            bytes: Array.from(bytes),
            format,
            defaultFileName,
        });
    }

    const pickerWindow = window as SaveFilePickerWindow;
    if (pickerWindow.showSaveFilePicker) {
        try {
            const handle = await pickerWindow.showSaveFilePicker({
                suggestedName: defaultFileName,
                types: [
                    {
                        description: format === "json" ? "JSON Coverage" : "Bucket Archive",
                        accept: {
                            [getMimeType(format)]: [`.${getExtension(format)}`],
                        },
                    },
                ],
            });
            const writable = await handle.createWritable();
            await writable.write(arrayBuffer);
            await writable.close();
            return { canceled: false };
        } catch (error) {
            if (isSavePickerUserAbort(error)) {
                return { canceled: true };
            }
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    const blob = new Blob([arrayBuffer], { type: getMimeType(format) });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = defaultFileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return { canceled: false };
}

export type CompareReportFormat = "json" | "html";

function getReportMimeType(format: CompareReportFormat): string {
    return format === "json" ? "application/json" : "text/html";
}

function getReportExtension(format: CompareReportFormat): string {
    return format;
}

export async function saveCompareReportBytes(
    bytes: Uint8Array,
    format: CompareReportFormat,
    defaultFileName: string,
): Promise<SaveResult> {
    const arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;

    if (isElectron() && window.electronAPI?.saveExportFile) {
        return window.electronAPI.saveExportFile({
            bytes: Array.from(bytes),
            format: format === "json" ? "json" : "json",
            defaultFileName,
        });
    }

    const pickerWindow = window as SaveFilePickerWindow;
    if (pickerWindow.showSaveFilePicker) {
        try {
            const handle = await pickerWindow.showSaveFilePicker({
                suggestedName: defaultFileName,
                types: [
                    {
                        description: format === "json" ? "JSON Report" : "HTML Report",
                        accept: {
                            [getReportMimeType(format)]: [`.${getReportExtension(format)}`],
                        },
                    },
                ],
            });
            const writable = await handle.createWritable();
            await writable.write(arrayBuffer);
            await writable.close();
            return { canceled: false };
        } catch (error) {
            if (isSavePickerUserAbort(error)) {
                return { canceled: true };
            }
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    const blob = new Blob([arrayBuffer], { type: getReportMimeType(format) });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = defaultFileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return { canceled: false };
}
