<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
  -->

# Bucket Desktop App

This is the Electron-based desktop application for viewing Bucket coverage archive files (`.bktgz`). It builds for macOS (Apple Silicon and Intel), Windows and Linux.

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

## Building the Desktop App

One build script serves every platform. The simplest arrangement is for each OS
to package itself: the macOS app on a Mac, the Windows installer on Windows,
the Linux AppImage on Linux. A Mac can also cross-build the Windows and Linux
packages (electron-builder downloads the Wine and AppImage tooling it needs),
but macOS bundles can only be built on macOS.

### Prerequisites

- Node.js 22.12 or newer and npm, plus `git` so the version can be read from tags
- macOS: nothing else
- Windows: nothing else (run the command from PowerShell or cmd)
- Linux: `libfuse2` if you want to *run* the AppImage on distributions that no longer ship it

### Build

From the repository root:

```bash
node electron/build.mjs
```

On macOS and Linux, `./electron/build.sh` does the same thing.

The script resolves the version from git tags, builds the viewer, installs any
missing npm dependencies, and packages the app for the current OS. Pass a
platform flag to override, and an architecture flag to narrow it:

```bash
node electron/build.mjs --mac            # arm64 and x64 .app bundles
node electron/build.mjs --mac --arm64    # Apple Silicon only
node electron/build.mjs --win            # NSIS installer, x64
node electron/build.mjs --linux          # AppImage, x64
node electron/build.mjs -- --publish never   # anything after -- goes to electron-builder
```

### Outputs

Everything lands in `electron/dist/`:

| OS      | Output                                                        | Notes                                              |
|---------|---------------------------------------------------------------|----------------------------------------------------|
| macOS   | `mac-arm64/Bucket.app` (Apple Silicon), `mac/Bucket.app` (Intel) | Unsigned; copy to Applications or run in place      |
| Windows | `Bucket-<version>-win-x64.exe`                                | NSIS installer; `win-unpacked/` is a portable folder |
| Linux   | `Bucket-<version>-linux-x86_64.AppImage`                         | `chmod +x` then run; `linux-unpacked/` also works    |

Installing on Windows or Linux registers the `.bktgz` file association. On
macOS the association is declared in the app bundle and takes effect once the
app has been launched once.

### Manual build

```bash
# Build the viewer first
cd viewer
npm install
npm run build

# Then package the Electron app for the current OS
cd ../electron
npm install
npm run build            # or build:mac / build:win / build:linux
```

`npm run build` skips version resolution, so the packaged app reports `0.0.0`
unless you pass `--config.extraMetadata.version=<version>`.

## App icon

The official Bucket mark lives in [`branding/`](../branding/). The Dock icon is the filled plate in `branding/logo-macos.svg`; the transparent mark is `branding/logo.svg`. After changing either, regenerate derived assets with:

```bash
./branding/apply.sh
```

Or just rebuild `electron/bucket.icns` from the existing PNG:

```bash
./electron/make-macos-icon.sh
```

macOS uses `bucket.icns` for the app. Windows and Linux use `branding/logo.png`
directly; electron-builder converts it to `.ico` and the Linux icon set at
build time, so no extra tooling is needed there.

The `.bktgz` document icons are also produced by `branding/apply.sh`:

- macOS (`electron/bucket_file.icns`): the mark and an ARCHIVE label composed
  by `branding/make-file-icon.mjs` onto macOS's own generic document page,
  read at build time from `CoreTypes.bundle`, so it matches Finder's other
  documents. This step only runs on a Mac.
- Windows (`electron/bucket_file.ico`): the flat page in
  `branding/file-icon.svg`, packed at 16 to 256px by `branding/make-ico.mjs`.
- Linux: none. Desktops pick file icons from the icon theme by MIME type,
  which an AppImage cannot install, so `.bktgz` files show the generic
  archive icon.

**Note**: The built app is completely standalone and does not require a web server to run. It loads the viewer from the bundled files.

## Features

- Open `.bktgz` files via:
  - File > Open menu
  - Drag and drop
  - Double-clicking `.bktgz` files (when associated with the app)
  - Passing paths on the command line
- Native menu bar on each platform
- Full coverage viewer functionality from the web app
