/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

// Minimal config for running headless scripts (scripts/report.ts) with
// vite-node. Deliberately NOT the default vite.config.ts: in dev mode that
// config enables the PWA plugin's devOptions, which writes dev-dist/ as a
// side effect. Only tsconfig path aliases ("@/...") are needed here.
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [tsconfigPaths()],
});
