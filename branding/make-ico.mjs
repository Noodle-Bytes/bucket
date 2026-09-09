/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

/**
 * Pack a PNG into a multi-size Windows .ico.
 *
 * Usage: node branding/make-ico.mjs <input.png> <output.ico>
 *
 * Uses the viewer's sharp dependency to resize, so run after `npm install` in
 * viewer/. Entries are PNG-compressed, which every Windows since Vista reads.
 */

import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SIZES = [16, 24, 32, 48, 64, 128, 256];

const [input, output] = process.argv.slice(2);
if (!input || !output) {
    console.error("Usage: node branding/make-ico.mjs <input.png> <output.ico>");
    process.exit(2);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repoRoot, "viewer", "package.json"));
const sharp = require("sharp");

const images = await Promise.all(
    SIZES.map((size) => sharp(input).resize(size, size).png().toBuffer()),
);

const headerSize = 6;
const entrySize = 16;
const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(SIZES.length, 4);

const entries = Buffer.alloc(entrySize * SIZES.length);
let offset = headerSize + entries.length;
SIZES.forEach((size, i) => {
    const entry = entries.subarray(i * entrySize, (i + 1) * entrySize);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // width (0 means 256)
    entry.writeUInt8(size === 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette size
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(images[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += images[i].length;
});

writeFileSync(output, Buffer.concat([header, entries, ...images]));
console.log(`Wrote ${output} (${SIZES.join(", ")} px)`);
