<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved
  -->

# Bucket Mac App

This is the Electron-based Mac application for viewing Bucket coverage archive files (`.bktgz`).

## Development

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

## Building the Mac App

To build a distributable Mac app, you can use the build script which automatically handles all dependencies:

```bash
./electron/build.sh
```

Or manually:

```bash
# Build the viewer first
cd viewer
npm install
npm run build

# Then build the Electron app
cd ../electron
npm install
npm run build:mac
```

This will create DMG files in the `electron/dist` directory that can be distributed.

**Note**: The built app is completely standalone and does not require a web server to run. It loads the viewer from the bundled files.

## Features

- Open `.bktgz` files via:
  - File > Open menu
  - Drag and drop
  - Double-clicking `.bktgz` files (when associated with the app)
- Native macOS menu bar
- Full coverage viewer functionality from the web app
