<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
  -->

# Bucket Desktop App

This is the Electron desktop application for viewing Bucket coverage archive files (`.bktgz`) on macOS, Linux, and Windows.

## Windows: First-Time Setup

These steps assume a fresh Windows machine and use PowerShell. You do not need Git Bash, zsh, Python, or Visual Studio to build the desktop app locally.

### 1. Open PowerShell

Press `Windows`, type `PowerShell`, and open it. You can use a normal PowerShell window; administrator PowerShell is not required for the project commands below.

### 2. Install the required tools

Bucket's Electron app needs:

- Git, to download the repository.
- Node.js LTS, which includes `node` and `npm`.
- uv, to create and maintain Bucket's Python environment.

If `winget` is available, run:

```powershell
winget install -e --id Git.Git
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id astral-sh.uv
```

If Windows says `winget` is not found, install the tools manually:

- Git for Windows: https://gitforwindows.org/
- Node.js LTS: https://nodejs.org/
- uv: https://docs.astral.sh/uv/getting-started/installation/

Close PowerShell and open a new PowerShell window after installing tools. This refreshes `PATH`.

### 3. Check the tools are visible

Run:

```powershell
git --version
node --version
npm --version
uv --version
```

If any command says it is not recognized, reinstall that tool or open a new PowerShell window.

### 4. Download Bucket

Choose a folder for source code, then clone the repository:

```powershell
mkdir $HOME\Code
cd $HOME\Code
git clone https://github.com/VyperCore/bucket.git
cd bucket
```

If you already have the repository, just go to it instead:

```powershell
cd C:\path\to\bucket
```

### 5. Build the Windows desktop app

From the repository root, run:

```powershell
.\bin\build_electron_app.cmd
```

The script installs JavaScript dependencies when needed, builds the web viewer, then builds the Windows Electron app. When it finishes, look in:

```text
electron\dist\
```

Useful outputs are:

- `electron\dist\Bucket Setup <version>.exe`, the Windows installer.
- `electron\dist\win-unpacked\Bucket.exe`, the unpacked app you can run directly.

To run the unpacked app:

```powershell
.\electron\dist\win-unpacked\Bucket.exe
```

### 6. Run the smoke test

After building, run:

```powershell
cd electron
npm.cmd run smoke
cd ..
```

The smoke test exits with `0` when Electron starts and the built viewer loads.

### Common Windows Fixes

- `npm.ps1 cannot be loaded because running scripts is disabled`: use `npm.cmd` instead of `npm`, or use the repo wrappers such as `.\bin\build_electron_app.cmd`.
- `node`, `npm`, `git`, or `uv` is not recognized: close PowerShell, open a new one, and try again. If it still fails, reinstall the missing tool.
- The build tries to download Electron Builder helper files: that is normal the first time. Run the command again if your network briefly drops.
- You do not need to enable Windows Developer Mode or run as administrator for the default local build.

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
# From repo root on macOS/Linux/Git Bash (recommended)
./bin/build_electron_app            # host target
./bin/build_electron_app linux
./bin/build_electron_app win

# Direct script (same behavior)
./electron/build.sh host
./electron/build.sh all
```

Windows PowerShell:

```powershell
# From repo root
.\bin\build_electron_app.cmd        # host target
.\bin\build_electron_app.cmd win
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
