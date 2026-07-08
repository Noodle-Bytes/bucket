<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
  -->

# Bucket Viewer

React web app for viewing Bucket coverage archives (`.bktgz`). It is also
embedded in standalone HTML exports and bundled into the Electron Mac app.

## User documentation

For loading coverage, compare mode, session management, and export:

- [Viewing coverage](../docs/viewing_coverage.md)
- Hosted viewer: https://noodle-bytes.github.io/bucket/
- Mac app: [`electron/README.md`](../electron/README.md)

## Development

### Prerequisites

- Node.js and npm

### Setup

```bash
cd viewer
npm install
npm run dev
```

The dev server runs at http://127.0.0.1:4000/

To load coverage locally, run the example from the repo root (which writes a
`.bktgz` archive), then open that file in the viewer:

```bash
./bin/shell
python -m example.example
```

### Other commands

```bash
npm run build    # production build
npm run preview  # preview production build
npm run test     # vitest with coverage
npm run lint
```

### Electron

For native Mac development, start the viewer dev server in one terminal, then run
the Electron app from `electron/` — see [`electron/README.md`](../electron/README.md).

### Compare fixtures

To generate two archives for testing compare mode:

```bash
python tools/gen_compare_fixtures.py
```
