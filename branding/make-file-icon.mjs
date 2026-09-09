/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

/**
 * Compose the macOS .bktgz document icon: the Azure Spark mark and an
 * "ARCHIVE" label on a blank page.
 *
 * Usage: node branding/make-file-icon.mjs <blank-page.png> <output.png>
 *
 * The blank page is macOS's own generic document artwork, extracted at build
 * time by branding/apply.sh from
 *   /System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericDocumentIcon.icns
 * so it is not committed here. The mark comes from branding/logo.svg. Layout
 * is expressed relative to the page's visible bounds (found from the alpha
 * channel), matching the proportions of the original hand-made icon.
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [blankPath, outputPath] = process.argv.slice(2);
if (!blankPath || !outputPath) {
    console.error("Usage: node branding/make-file-icon.mjs <blank-page.png> <output.png>");
    process.exit(2);
}

const brandingDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(brandingDir, "..", "viewer", "package.json"));
const sharp = require("sharp");

// Proportions of the page's visible bounds, measured from the original icon.
const MARK_WIDTH = 0.53; // mark width as a fraction of page width
const MARK_TOP = 0.235; // mark top edge as a fraction of page height
const LABEL_BASELINE = 0.865; // label baseline as a fraction of page height
const LABEL_CAP_HEIGHT = 0.078; // label cap height as a fraction of page height
const LABEL_COLOR = "#7D7D7D";

/** Bounding box of pixels with alpha above a threshold. */
async function visibleBounds(image) {
    const { data, info } = await image.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let x0 = info.width;
    let y0 = info.height;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
            if (data[(y * info.width + x) * 4 + 3] > 40) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
    }
    return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

const page = sharp(blankPath);
const { width: canvasWidth, height: canvasHeight } = await page.metadata();
const bounds = await visibleBounds(page);

// Mark: scale logo.svg to the target width, keeping its aspect ratio.
const markWidth = Math.round(bounds.width * MARK_WIDTH);
const markPng = await sharp(path.join(brandingDir, "logo.svg"))
    .resize({ width: markWidth })
    .png()
    .toBuffer();
const markMeta = await sharp(markPng).metadata();
const markLeft = Math.round(bounds.x + (bounds.width - markMeta.width) / 2);
const markTop = Math.round(bounds.y + bounds.height * MARK_TOP);

// Label: rendered as SVG text so sharp handles the typography. Cap height of
// Helvetica Bold is about 0.72 of the font size.
const fontSize = Math.round((bounds.height * LABEL_CAP_HEIGHT) / 0.72);
const labelSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}">
        <text x="${bounds.x + bounds.width / 2}" y="${Math.round(bounds.y + bounds.height * LABEL_BASELINE)}"
              text-anchor="middle" fill="${LABEL_COLOR}"
              font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="700"
              font-size="${fontSize}">ARCHIVE</text>
    </svg>`,
);

await page
    .composite([
        { input: markPng, left: markLeft, top: markTop },
        { input: labelSvg, left: 0, top: 0 },
    ])
    .png()
    .toFile(outputPath);

console.log(
    `Wrote ${outputPath}: page ${bounds.width}x${bounds.height} at (${bounds.x},${bounds.y}), ` +
        `mark ${markMeta.width}x${markMeta.height} at (${markLeft},${markTop}), label ${fontSize}px`,
);
readFileSync(outputPath); // sanity: the file exists and is readable
