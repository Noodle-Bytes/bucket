/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

const { spawn } = require('child_process');
const electronBinary = require('electron');

const child = spawn(electronBinary, ['.'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    BUCKET_ELECTRON_FORCE_PRODUCTION: '1',
    BUCKET_ELECTRON_SMOKE_TEST: '1',
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error('Failed to start Electron smoke test:', error);
  process.exit(1);
});
