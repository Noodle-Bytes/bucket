/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

/// <reference types="vite/client" />

interface ElectronAPI {
  openFileDialog: () => Promise<string[] | null>;
  readFile: (filePath: string) => Promise<Uint8Array>;
  getDroppedFile: (filePath: string) => Promise<Uint8Array | null>;
  saveExportFile: (payload: {
    bytes: Uint8Array;
    format: "bktgz" | "json";
    defaultFileName: string;
  }) => Promise<{ canceled: boolean; path?: string }>;
  onFilesOpened: (callback: (filePaths: string[]) => void) => void;
  onClearCoverage: (callback: () => void) => void;
  onOpenPreferences: (callback: () => void) => void;
}

interface Window {
  electronAPI?: ElectronAPI;
  launchQueue?: {
    setConsumer: (consumer: (launchParams: { files: FileSystemFileHandle[] }) => void | Promise<void>) => void;
  };
}
