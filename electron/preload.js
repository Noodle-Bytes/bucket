/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  getDroppedFiles: (filePaths) => ipcRenderer.invoke('get-dropped-files', filePaths),
  onFileOpened: (callback) => {
    // Remove any existing listeners to avoid duplicates
    ipcRenderer.removeAllListeners('file-opened');
    // Set up the new listener
    ipcRenderer.on('file-opened', (event, filePath) => {
      callback(filePath);
    });
  },
  onFilesOpened: (callback) => {
    // Remove any existing listeners to avoid duplicates
    ipcRenderer.removeAllListeners('files-opened');
    // Set up the new listener
    ipcRenderer.on('files-opened', (event, filePaths) => {
      callback(filePaths);
    });
  },
  onClearCoverage: (callback) => {
    // Remove any existing listeners to avoid duplicates
    ipcRenderer.removeAllListeners('clear-coverage');
    // Set up the new listener
    ipcRenderer.on('clear-coverage', () => {
      callback();
    });
  },
});
