/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
 */

/**
 * Headless entry for generating a human-readable HTML coverage report.
 *
 * Invoked by the Python `ReportWriter` (bucket/rw/report.py) as
 * `npm run report -- --json <cov.json> --output <report.html> [flags]`,
 * so the report logic in src/services/readableReport.ts stays the single
 * implementation shared with the viewer UI. Run via vite-node so the
 * "@/..." imports inside the viewer sources resolve.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { readJsonBytes } from "../src/features/Dashboard/lib/readers";
import {
    buildReadableReportHtml,
    type ReadableReportOptions,
} from "../src/services/readableReport";

const USAGE = `Usage: report --json <cov.json> --output <report.html>
    [--no-description] [--no-motivation] [--no-tier-tags] [--no-axes]
    [--no-axis-values] [--no-goals] [--no-bucket-counts] [--no-summary]
    [--results] [--max-axis-values <n>]
    [--max-tier <n>] [--tags <tag,tag,...>] [--point <glob>]`;

function fail(message: string): never {
    console.error(`${message}\n\n${USAGE}`);
    process.exit(1);
}

function parseArgs(argv: string[]): {
    jsonPath: string;
    outputPath: string;
    options: ReadableReportOptions;
} {
    let jsonPath: string | null = null;
    let outputPath: string | null = null;
    const options: ReadableReportOptions = {};

    const sectionFlags: Record<
        string,
        Exclude<keyof ReadableReportOptions, "maxAxisValues" | "maxTier" | "tags" | "point">
    > = {
        "--no-description": "description",
        "--no-motivation": "motivation",
        "--no-tier-tags": "tierTags",
        "--no-axes": "axes",
        "--no-axis-values": "axisValues",
        "--no-goals": "goals",
        "--no-bucket-counts": "bucketCounts",
        "--no-summary": "summary",
    };

    for (let idx = 0; idx < argv.length; idx += 1) {
        const arg = argv[idx];
        if (arg === "--json") {
            jsonPath = argv[++idx] ?? fail("--json requires a path");
        } else if (arg === "--output") {
            outputPath = argv[++idx] ?? fail("--output requires a path");
        } else if (arg === "--results") {
            options.results = true;
        } else if (arg === "--max-axis-values") {
            const raw = argv[++idx] ?? fail("--max-axis-values requires a number");
            const parsed = Number(raw);
            if (!Number.isInteger(parsed) || parsed < 0) {
                fail(`Invalid --max-axis-values: ${raw}`);
            }
            options.maxAxisValues = parsed;
        } else if (arg === "--max-tier") {
            const raw = argv[++idx] ?? fail("--max-tier requires a number");
            const parsed = Number(raw);
            if (!Number.isInteger(parsed) || parsed < 0) {
                fail(`Invalid --max-tier: ${raw}`);
            }
            options.maxTier = parsed;
        } else if (arg === "--tags") {
            const raw = argv[++idx] ?? fail("--tags requires a comma-separated list");
            options.tags = raw
                .split(",")
                .map((tag) => tag.trim())
                .filter((tag) => tag.length > 0);
        } else if (arg === "--point") {
            options.point = argv[++idx] ?? fail("--point requires a glob");
        } else if (arg in sectionFlags) {
            options[sectionFlags[arg]] = false;
        } else {
            fail(`Unknown argument: ${arg}`);
        }
    }

    if (jsonPath === null) {
        fail("--json is required");
    }
    if (outputPath === null) {
        fail("--output is required");
    }
    return { jsonPath, outputPath, options };
}

async function main(): Promise<void> {
    const { jsonPath, outputPath, options } = parseArgs(process.argv.slice(2));

    const reader = readJsonBytes(new Uint8Array(readFileSync(jsonPath)));
    const readouts: Readout[] = [];
    for await (const readout of reader.read_all()) {
        readouts.push(readout);
    }
    if (readouts.length === 0) {
        fail(`No coverage records found in ${jsonPath}`);
    }

    writeFileSync(outputPath, buildReadableReportHtml(readouts, options));
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
