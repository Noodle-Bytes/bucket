/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

/**
 * Build the Bucket desktop app for the current OS (or the OS you ask for).
 *
 * Usage:
 *   node electron/build.mjs             # build for the host OS
 *   node electron/build.mjs --mac       # macOS: arm64 + x64 .app bundles
 *   node electron/build.mjs --win       # Windows: NSIS installer (x64)
 *   node electron/build.mjs --linux     # Linux: AppImage (x64)
 *   node electron/build.mjs --mac --arm64   # restrict architectures
 *   node electron/build.mjs -- <extra electron-builder args>
 *
 * Each OS can build its own package. A Mac can also cross-build the Windows and
 * Linux packages (electron-builder fetches Wine and the AppImage tooling), but
 * macOS bundles can only be built on macOS.
 *
 * Steps: resolve the version from git tags, build the viewer, then run
 * electron-builder with the version injected into the packaged metadata.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const viewerDir = path.join(projectRoot, "viewer");

const PLATFORM_FLAGS = new Set(["--mac", "--win", "--linux"]);
const ARCH_FLAGS = new Set(["--x64", "--arm64", "--universal"]);
const HOST_FLAG = { darwin: "--mac", win32: "--win", linux: "--linux" }[process.platform];

function usage() {
    console.log(`Usage: node electron/build.mjs [--mac] [--win] [--linux] [--x64] [--arm64] [-- <electron-builder args>]

Builds the viewer, then packages the Electron app. With no platform flag the
host OS is built. Outputs land in electron/dist/.`);
}

function parseArgs(argv) {
    const platforms = [];
    const archs = [];
    const passthrough = [];
    let rest = false;
    for (const arg of argv) {
        if (rest) {
            passthrough.push(arg);
        } else if (arg === "--") {
            rest = true;
        } else if (arg === "-h" || arg === "--help") {
            usage();
            process.exit(0);
        } else if (PLATFORM_FLAGS.has(arg)) {
            platforms.push(arg);
        } else if (ARCH_FLAGS.has(arg)) {
            archs.push(arg);
        } else {
            console.error(`Unknown argument: ${arg}\n`);
            usage();
            process.exit(2);
        }
    }
    return { platforms, archs, passthrough };
}

/** Run a command with inherited stdio; exit on failure. */
function run(command, args, cwd) {
    console.log(`\n$ ${command} ${args.join(" ")}   (in ${path.relative(projectRoot, cwd) || "."})`);
    const result = spawnSync(command, args, {
        cwd,
        stdio: "inherit",
        env: process.env,
        // npm is a .cmd shim on Windows, which needs a shell to launch.
        shell: process.platform === "win32",
    });
    if (result.error) {
        console.error(`Failed to start ${command}: ${result.error.message}`);
        process.exit(1);
    }
    if (result.status !== 0) {
        console.error(`${command} exited with status ${result.status}`);
        process.exit(result.status ?? 1);
    }
}

function ensureDependencies(dir, label) {
    if (!existsSync(path.join(dir, "node_modules"))) {
        console.log(`Installing ${label} dependencies...`);
        run("npm", ["install"], dir);
    }
}

async function resolveVersion() {
    if (process.env.BUCKET_VERSION?.trim()) {
        return process.env.BUCKET_VERSION.trim().replace(/^v/, "");
    }
    // Import by URL so Windows drive-letter paths resolve correctly.
    const { resolveBucketVersion } = await import(
        pathToFileURL(path.join(viewerDir, "scripts", "resolve-version.mjs")).href
    );
    return resolveBucketVersion();
}

const { platforms, archs, passthrough } = parseArgs(process.argv.slice(2));
if (platforms.length === 0) {
    if (!HOST_FLAG) {
        console.error(`Unsupported host platform: ${process.platform}. Pass --mac, --win or --linux.`);
        process.exit(2);
    }
    platforms.push(HOST_FLAG);
}

console.log("Building Bucket desktop app");
console.log(`Targets: ${platforms.join(" ")}${archs.length ? ` ${archs.join(" ")}` : ""}`);

// Versions come from git tags, not package.json (which holds a 0.0.0
// placeholder). Resolve once and share it with the viewer bundle
// (__APP_VERSION__) and the packaged app metadata.
const version = await resolveVersion();
process.env.BUCKET_VERSION = version;
console.log(`Version: ${version}`);

console.log("\nStep 1: Building viewer...");
ensureDependencies(viewerDir, "viewer");
run("npm", ["run", "build"], viewerDir);

console.log("\nStep 2: Packaging Electron app...");
ensureDependencies(scriptDir, "Electron");
run(
    "npx",
    [
        "electron-builder",
        ...platforms,
        ...archs,
        `--config.extraMetadata.version=${version}`,
        ...passthrough,
    ],
    scriptDir,
);

console.log("\nBuild complete. Packages are in electron/dist/:");
if (platforms.includes("--mac")) {
    console.log("  macOS:   dist/mac-arm64/Bucket.app (Apple Silicon), dist/mac/Bucket.app (Intel)");
}
if (platforms.includes("--win")) {
    console.log("  Windows: dist/Bucket-<version>-win-x64.exe installer, dist/win-unpacked/ (portable folder)");
}
if (platforms.includes("--linux")) {
    console.log("  Linux:   dist/Bucket-<version>-linux-x86_64.AppImage, dist/linux-unpacked/");
}
