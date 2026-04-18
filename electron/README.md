<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
  -->

# Bucket Desktop App

This is the Electron desktop application for viewing Bucket coverage archive files (`.bktgz`) on macOS, Linux, and Windows.

## Development Only

If you are just wanting to build the app for local use, please skip this section

### Prerequisites

- Node.js and npm

### Setup

1. Install dependencies (the build script will do this automatically, but for development you can do it manually):
   ```bash
   # Install viewer dependencies
   cd ../viewer
   npm install

   # Install Electron dependencies
   cd ../electron
   npm install
   ```

2. Run in development mode:
   ```bash
   # In one terminal, start the viewer dev server (required for dev mode):
   cd ../viewer
   npm run dev

   # In another terminal, start Electron:
   cd ../electron
   npm run dev
   ```

   **Note**: The web server is only required for development mode. The built/production app loads from the built files and doesn't need a server.

## Building Desktop Packages

To build locally, first build the viewer and install Electron dependencies:

```bash
# Build the viewer first
cd viewer
npm ci
npm run build

# Then build the Electron app
cd ../electron
npm ci
```

Build commands per platform:

```bash
# macOS
npm run build:mac

# Linux (AppImage + .deb)
npm run build:linux

# Windows (.exe NSIS installer)
npm run build:win
```

Convenience wrapper scripts:

```bash
# From repo root (recommended)
./bin/build_electron_app            # host target
./bin/build_electron_app linux
./bin/build_electron_app win

# Direct script (same behavior)
./electron/build.sh host
./electron/build.sh all
```

## Smoke Test

Run a CI-style launch smoke test from the `electron` directory:

```bash
npm run smoke
```

This forces production mode (loads `viewer/dist`) and exits automatically with:

- `0` when the app starts and main content loads
- non-zero when startup/load fails

## CI Artifacts

GitHub Actions workflow `.github/workflows/electron-builds.yml` builds and uploads:

- Linux: `.AppImage` and `.deb`
- Windows: `.exe`

All artifacts are published per run using the Actions `upload-artifact` step.

## Features

- Open `.bktgz` files via:
  - File > Open menu
  - Drag and drop
  - Double-clicking `.bktgz` files (when associated with the app)
- Native app menus per platform
- Full coverage viewer functionality from the web app
