/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

export type CoverageSourceKind =
    | "electronPath"
    | "fileHandle"
    | "fileObject"
    | "virtualMerged";

export type CoverageSourceRef = {
    id: string;
    kind: CoverageSourceKind;
    label: string;
    path?: string;
    fileHandle?: FileSystemFileHandle;
    fileObject?: File;
};

export type CoverageRecord = {
    id: string;
    readout: Readout;
    sourceRef: string;
    sourceRecordIndex: number;
    isLoaded: boolean;
};

export type CoverageSession = {
    records: CoverageRecord[];
    sources: CoverageSourceRef[];
    loadedRecordIds: string[];
};

export type ExportFormat = "bktgz" | "json";
