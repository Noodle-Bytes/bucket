<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
  -->

# Storage format fixtures

One frozen fixture directory per on-disk storage format version (see the
format history in `bucket/rw/common.py`). These prove that the current
readers — both the Python library and the viewer — can still open and fully
process every format we claim to support, from `MIN_FORMAT_VERSION` up to
`FORMAT_VERSION`.

Each `v<N>/` contains files written by the code that produced format `N`:

| File             | Contents                                                       |
| ---------------- | -------------------------------------------------------------- |
| `coverage.bktgz` | Two-record archive (shared definition, different bucket hits)  |
| `coverage.json`  | The same two records in the JSON record format                 |
| `expected.json`  | Canonical snapshot of the data, taken at write time by reading the files back with the writing era's own readers |

The records are deterministic (fixed seeds) and deliberately exercise format
edge cases: point groups, multi-axis points, illegal (`-1`) and ignore (`0`)
goals, all tier/tags/motivation variants, and non-ASCII / quoted / comma text
in CSV fields.

## Consumed by

- `tests/test_rw/test_backwards_compat.py` (Python readers, merging)
- `viewer/src/services/storageFormatCompat.test.ts` (viewer, both archive
  parse paths and the JSON load path)

Both suites run in CI on every pull request. Each fails loudly if a fixture
for a supported version is missing, or if a fixture directory exists outside
the supported range.

## Bumping the format version (new fixture)

After bumping `FORMAT_VERSION` in `bucket/rw/common.py` (and
`SUPPORTED_FORMAT_VERSION` in `viewer/src/utils/versionCompat.ts`), generate
and commit the new fixture from the repo root:

```bash
python tools/gen_format_fixtures.py
```

## Dropping support for an old format

If a compat test fails and the breakage is intentional, move the minimum
supported version instead of fixing it: raise `MIN_FORMAT_VERSION` in
`bucket/rw/common.py` and `MIN_SUPPORTED_FORMAT_VERSION` in
`viewer/src/utils/versionCompat.ts`, then delete the dropped `v<N>/`
directory.

## Never regenerate existing fixtures

A committed fixture is frozen: it stands in for files real users wrote with
old releases. Regenerating one from newer code would silently erase exactly
the compatibility evidence it exists to provide. `tools/gen_format_fixtures.py`
refuses to overwrite an existing directory for this reason. (If a fixture for
an *old* format is ever lost, recreate it from a checkout of the last commit
that wrote that format — instructions in the tool's docstring.)
