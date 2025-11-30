/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2024 Vypercore. All Rights Reserved
 */

/// <reference types="vite/client" />

interface ElectronAPI {
  openFileDialog: () => Promise<string | null>;
  readFile: (filePath: string) => Promise<number[]>;
  getDroppedFile: (filePath: string) => Promise<number[] | null>;
  onFileOpened: (callback: (filePath: string) => void) => void;
  onClearCoverage: (callback: () => void) => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
