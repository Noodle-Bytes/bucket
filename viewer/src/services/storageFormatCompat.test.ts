/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
    ArchiveReader,
    parseArchiveBytes,
} from "../features/Dashboard/lib/readers";
import type { Readout } from "../features/Dashboard/lib/readers";
import { loadReadoutsFromBytes } from "./fileLoader";
import {
    MIN_SUPPORTED_FORMAT_VERSION,
    SUPPORTED_FORMAT_VERSION,
    checkFormatCompat,
} from "@/utils/versionCompat";

/**
 * Backwards-compatibility tests for the on-disk storage formats.
 *
 * tests/format_fixtures/ (repo root, shared with the Python suite) holds one
 * frozen fixture directory per storage format version. Each is opened and
 * fully processed here, and the result compared against the snapshot taken
 * when the fixture was written.
 *
 * If a test here fails after a format change, either fix the regression or
 * consciously drop support: raise MIN_SUPPORTED_FORMAT_VERSION (and
 * MIN_FORMAT_VERSION in bucket/rw/common.py), then delete the dropped
 * fixture directory. When the format version is bumped, generate the new
 * fixture with: python tools/gen_format_fixtures.py
 */

const FIXTURE_ROOT = join(__dirname, "../../../tests/format_fixtures");
const FIXTURE_FILES = ["coverage.bktgz", "coverage.json", "expected.json"];

const SUPPORTED_VERSIONS: number[] = [];
for (
    let version = MIN_SUPPORTED_FORMAT_VERSION;
    version <= SUPPORTED_FORMAT_VERSION;
    version += 1
) {
    SUPPORTED_VERSIONS.push(version);
}

type ExpectedRecord = {
    bucket_version: { archive: string; json: string };
    [field: string]: unknown;
};

type Expected = {
    format_version: number;
    records: ExpectedRecord[];
};

function loadExpected(version: number): Expected {
    return JSON.parse(
        readFileSync(join(FIXTURE_ROOT, `v${version}`, "expected.json"), "utf-8"),
    ) as Expected;
}

function expectedRecords(
    expected: Expected,
    fileFormat: "archive" | "json",
): Record<string, unknown>[] {
    return expected.records.map(({ bucket_version, ...rest }) => ({
        ...rest,
        bucket_version: bucket_version[fileFormat],
    }));
}

function fixtureBytes(version: number, name: string): Uint8Array {
    return new Uint8Array(readFileSync(join(FIXTURE_ROOT, `v${version}`, name)));
}

/**
 * Full dump of a readout in the canonical shape written by
 * tools/gen_format_fixtures.py (record_snapshot).
 */
function canonicalRecord(readout: Readout): Record<string, unknown> {
    return {
        def_sha: readout.get_def_sha(),
        rec_sha: readout.get_rec_sha(),
        source: readout.get_source() ?? "",
        source_key: readout.get_source_key() ?? "",
        bucket_version: readout.get_bucket_version(),
        format_version: readout.get_format_version(),
        point: Array.from(readout.iter_points()).map((point) => ({
            ...point,
            tier: point.tier ?? null,
        })),
        axis: Array.from(readout.iter_axes(0, null)),
        axis_value: Array.from(readout.iter_axis_values(0, null)),
        goal: Array.from(readout.iter_goals(0, null)),
        bucket_goal: Array.from(readout.iter_bucket_goals(0, null)),
        point_hit: Array.from(readout.iter_point_hits()),
        bucket_hit: Array.from(readout.iter_bucket_hits(0, null)),
    };
}

async function collect(reader: Reader): Promise<Readout[]> {
    const readouts: Readout[] = [];
    for await (const readout of reader.read_all()) {
        readouts.push(readout);
    }
    return readouts;
}

/**
 * Step-by-step remediation shown when a supported format no longer reads
 * back correctly.
 */
function regressionHelp(version: number): string {
    return (
        `\n` +
        `Storage format v${version} is within the supported range ` +
        `[${MIN_SUPPORTED_FORMAT_VERSION}, ${SUPPORTED_FORMAT_VERSION}] but ` +
        `the viewer no longer processes it correctly.\n` +
        `The fixture files were written by the code that produced format ` +
        `v${version} and are frozen; the mismatch shows today's readback vs ` +
        `tests/format_fixtures/v${version}/expected.json (repo root).\n` +
        `\n` +
        `Pick ONE of:\n` +
        `\n` +
        `1. Fix the compatibility regression (usually the intended outcome).\n` +
        `   The viewer readers live in ` +
        `viewer/src/features/Dashboard/lib/readers.ts and archiveLoader.ts.\n` +
        `   Re-run just these tests while iterating:\n` +
        `       cd viewer && npx vitest run src/services/storageFormatCompat.test.ts\n` +
        `   The Python library reads the same fixtures - check it too:\n` +
        `       pytest tests/test_rw/test_backwards_compat.py -k v${version}\n` +
        `\n` +
        `2. Deliberately drop support for format v${version} (only if ` +
        `maintaining compatibility is not worth it):\n` +
        `       - viewer/src/utils/versionCompat.ts: set ` +
        `MIN_SUPPORTED_FORMAT_VERSION = ${version + 1}\n` +
        `       - bucket/rw/common.py: set MIN_FORMAT_VERSION = ${version + 1}\n` +
        `       - git rm -r tests/format_fixtures/v${version}\n` +
        `   and call out the dropped support in the PR description.\n` +
        `\n` +
        `See tests/format_fixtures/README.md for the full workflow.\n`
    );
}

function checkAll(
    readouts: Readout[],
    expected: Expected,
    fileFormat: "archive" | "json",
    version: number,
) {
    expect(readouts.map(canonicalRecord), regressionHelp(version)).toEqual(
        expectedRecords(expected, fileFormat),
    );
    for (const readout of readouts) {
        // A supported fixture must be recognised as fully compatible.
        expect(
            checkFormatCompat(readout.get_format_version()),
            regressionHelp(version),
        ).toEqual({
            status: "match",
        });
    }
}

describe("storage format backwards compatibility", () => {
    test("a frozen fixture exists for every supported format version", () => {
        const missing = SUPPORTED_VERSIONS.flatMap((version) =>
            FIXTURE_FILES.filter(
                (name) => !existsSync(join(FIXTURE_ROOT, `v${version}`, name)),
            ).map((name) => `v${version}/${name}`),
        );
        expect(
            missing,
            `\n` +
                `Missing storage-format fixtures: ${missing.join(", ")}.\n` +
                `Every format from MIN_SUPPORTED_FORMAT_VERSION ` +
                `(${MIN_SUPPORTED_FORMAT_VERSION}) to SUPPORTED_FORMAT_VERSION ` +
                `(${SUPPORTED_FORMAT_VERSION}) needs a frozen fixture ` +
                `directory under tests/format_fixtures/ (repo root).\n` +
                `\n` +
                `If you just bumped the format version, generate and commit ` +
                `the new fixture (from the repo root):\n` +
                `    python tools/gen_format_fixtures.py\n` +
                `    git add tests/format_fixtures/v${SUPPORTED_FORMAT_VERSION}\n` +
                `\n` +
                `If a fixture for an OLDER format is missing, recreate it ` +
                `from the last commit that wrote that format - instructions ` +
                `in the docstring of tools/gen_format_fixtures.py and in ` +
                `tests/format_fixtures/README.md.\n` +
                `Also check SUPPORTED_FORMAT_VERSION / ` +
                `MIN_SUPPORTED_FORMAT_VERSION here match FORMAT_VERSION / ` +
                `MIN_FORMAT_VERSION in bucket/rw/common.py.\n`,
        ).toEqual([]);
    });

    test("no fixture directories outside the supported range", () => {
        const stale = readdirSync(FIXTURE_ROOT, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && /^v\d+$/.test(entry.name))
            .map((entry) => parseInt(entry.name.slice(1), 10))
            .filter((version) => !SUPPORTED_VERSIONS.includes(version));
        expect(
            stale,
            `\n` +
                `Fixture directories outside the supported format range ` +
                `[${MIN_SUPPORTED_FORMAT_VERSION}, ${SUPPORTED_FORMAT_VERSION}]: ` +
                `${stale.map((v) => `v${v}`).join(", ")}.\n` +
                `\n` +
                `If support for these formats was dropped on purpose, remove ` +
                `their fixtures and keep both sides in sync:\n` +
                stale
                    .map((v) => `    git rm -r tests/format_fixtures/v${v}\n`)
                    .join("") +
                `    (bucket/rw/common.py: MIN_FORMAT_VERSION must equal ` +
                `MIN_SUPPORTED_FORMAT_VERSION = ${MIN_SUPPORTED_FORMAT_VERSION})\n` +
                `\n` +
                `Otherwise restore MIN_SUPPORTED_FORMAT_VERSION in ` +
                `viewer/src/utils/versionCompat.ts so the range covers them ` +
                `again.\n`,
        ).toEqual([]);
    });

    describe.each(SUPPORTED_VERSIONS)("format v%i", (version) => {
        test("archive opens and processes fully (file loader, sync path)", async () => {
            const readouts = await loadReadoutsFromBytes(
                fixtureBytes(version, "coverage.bktgz"),
            );
            checkAll(readouts, loadExpected(version), "archive", version);
        });

        test("archive opens and processes fully (worker data path)", async () => {
            const reader = ArchiveReader.fromParsedTables(
                parseArchiveBytes(fixtureBytes(version, "coverage.bktgz")),
            );
            checkAll(
                await collect(reader),
                loadExpected(version),
                "archive",
                version,
            );
        });

        test("JSON record opens and processes fully (file loader)", async () => {
            const readouts = await loadReadoutsFromBytes(
                fixtureBytes(version, "coverage.json"),
            );
            checkAll(readouts, loadExpected(version), "json", version);
        });
    });
});
