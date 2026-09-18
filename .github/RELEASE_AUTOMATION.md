<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
  -->

# Release Automation — Operator Guide

This document is for repository maintainers. It describes how releases are
cut and how to recover when something fails.

End-user / library documentation lives in [`docs/`](../docs/index.md); this
file is not part of the published docs site.

## Two release lines

The repository ships two things, and they are versioned and released
independently:

| Line | What ships | Tags | Where it goes |
|---|---|---|---|
| **bucket** | the `noodle-bucket` Python package | `v2.11.0` | PyPI, plus the sdist/wheel on the GitHub release; the docs site under `/docs/` on GitHub Pages |
| **viewer** | the web viewer and the Electron desktop app | `viewer-v2.11.0` | GitHub Pages (site root) |

A change to the viewer never bumps the Python package or publishes to PyPI,
and a change to bucket never bumps or redeploys the viewer. Both lines
started from the same number — `viewer-v2.11.0` was created on 2026-09-18
pointing at the same commit as `v2.11.0` — and drift apart from there. One
line's number says nothing about the other; whether a viewer can read a
coverage file is decided by the on-disk **format** version
(`bucket/rw/common.py`), which is separate from both.

The Electron app has no version of its own: it bundles the viewer and
reports the viewer's version.

The docs describe the Python library, so they are published with bucket:
every bucket release rebuilds `/docs/` from its tag. Documentation never
cuts a release on its own — a docs-only PR is `[None]` and goes live with
the next bucket release.

## How versioning works

Versions are derived from **git tags** — they are not stored in any file in
the repository.

- **bucket**: `pyproject.toml` declares a dynamic version resolved by
  [hatch-vcs](https://github.com/ofek/hatch-vcs) (setuptools-scm
  underneath) from the latest `v*` tag. Its `raw-options` restrict the
  `git describe` to `v[0-9]*`; without that, setuptools-scm would match
  `viewer-v*` tags too and strip their prefix.
- **viewer / Electron**: the builds inject a version resolved from the
  latest `viewer-v*` tag (or the `VIEWER_VERSION` env var) at build time —
  see
  [`viewer/scripts/resolve-version.mjs`](../viewer/scripts/resolve-version.mjs).
  The `version` fields in `viewer/package.json` and `electron/package.json`
  are `0.0.0` placeholders — do not edit them.

| State of checkout | bucket (PEP 440) | viewer/Electron (semver) |
|---|---|---|
| Exactly on the line's `…2.4.3` tag, clean | `2.4.3` | `2.4.3` |
| 2 commits past the line's tag | `2.4.4.dev2+g<sha>` | `2.4.4-dev.2+g<sha>` |
| Uncommitted local changes | trailing `.d<date>` | trailing `.dirty` |

Each column only looks at its own tags, so a checkout can sit exactly on a
viewer tag while the Python version is a dev build, and vice versa.

A dev/dirty suffix on a build is accurate, not a bug: that build is not the
released artifact. Official artifacts are built from tags and get exact
versions. The viewer's update-availability check only compares against
`viewer-v*` releases, and is skipped when the build version is the `0.0.0`
fallback (no git metadata at build time).

## Release flow

1. Open a PR against `main` with a title prefix: `[Patch]`, `[Minor]`,
   `[Major]`, or `[None]` (enforced by
   [`pr-title-check.yml`](workflows/pr-title-check.yml)). The prefix says
   how big the change is; **the files the PR changes say which line(s) it
   releases** — see [Which files release what](#which-files-release-what).
   A release-prefixed PR that touches neither line fails the title check
   with a hint to use `[None]`.
2. When the PR merges,
   [`tag-release-on-merge.yml`](workflows/tag-release-on-merge.yml):
   - `[None]` → does nothing.
   - Otherwise → classifies the PR's changed files
     ([`release-components.sh`](scripts/release-components.sh)) and, for
     each affected line, reads that line's latest tag, bumps the
     corresponding part ([`next-version.sh`](scripts/next-version.sh)),
     and creates a GitHub release (tag + notes generated from the line's
     previous tag) targeting the merge commit, as the
     **noodle-bucket-releases** App. A PR that touches both lines bumps
     both by the same amount. It comments "🪣 Shipped in vX.Y.Z" and/or
     "🪣 Viewer shipped in viewer-vX.Y.Z" on the source PR.
3. The new tag triggers the downstream workflows:
   - `v*` only → [`publish-pypi.yml`](workflows/publish-pypi.yml) builds
     the Python sdist and wheel and uploads them to **production PyPI** as
     `noodle-bucket`. This is immediate and irreversible (see below).
     `viewer-v*` tags never run it.
   - `v*` or `viewer-v*` → [`deploy-viewer.yml`](workflows/deploy-viewer.yml)
     rebuilds the GitHub Pages site from the newest release of each line:
     the viewer from the newest `viewer-v*` tag at the site root, the docs
     from the newest `v*` tag under `/docs/`. Neither half is ever built
     from `main`, so a bucket release cannot put an unreleased viewer on
     the site, and a viewer release cannot publish docs for unreleased
     bucket features.

Viewer releases are created with `--latest=false`, so the repository's
"Latest release" badge always points at the newest `noodle-bucket` release.

Two nearly-simultaneous merges are serialized by the release workflow's
concurrency group (queued, never cancelled), so each computes its version
from the previous one's tag.

### Which files release what

[`release-components.sh`](scripts/release-components.sh) is the single
source of truth; this table summarises it.

| Changed path | Line | Why |
|---|---|---|
| `bucket/**`, `pyproject.toml`, `LICENSE`, `.git_archival.txt`, `.gitattributes` | bucket | the code and packaging metadata in the sdist / wheel |
| `viewer/**`, `electron/**` | viewer | the viewer and the app that wraps it |
| `branding/**` | viewer | icons embedded in the viewer and the Electron app |
| `docs/**`, `mkdocs.yml`, `README.md` | neither | documentation goes live with the next bucket release and never bumps a version on its own |
| everything else (`.github/`, `tests/`, `tools/`, `example*/`, …) | neither | ships in no artifact |

So a `[Patch]` fix under `viewer/src/` cuts `viewer-v2.11.1` and redeploys
Pages; a `[Patch]` fix under `bucket/` cuts `v2.11.1`, publishes to PyPI
and redeploys Pages (picking up any docs changes merged since the previous
bucket release); a PR that changes `bucket/rw/common.py` and
`viewer/src/utils/versionCompat.ts` together cuts both. A docs-only,
CI-only or test-only change must be `[None]`; the title check rejects a
release prefix on it.

To see how a branch will be classified before opening the PR:

```bash
git diff --name-only main... | .github/scripts/release-components.sh
```

## Manual release (immediate or exact version)

Run **Tag Release On Merge** via *Actions → Tag Release On Merge → Run
workflow*:

- Pick the `component` (`bucket` or `viewer`). A manual run cuts exactly
  one line.
- Pick `bump` (patch/minor/major) to cut a release from the current `main`
  HEAD without waiting for a PR merge, or
- Enter an exact `version` (`X.Y.Z`) to override the computed bump. The tag
  prefix is added for you: `2.12.0` with `component=viewer` creates
  `viewer-v2.12.0`.

To republish the Pages site without cutting anything (for example after a
failed deploy), run *Actions → Deploy Viewer and Docs to GitHub Pages → Run
workflow*; it rebuilds from the newest release of each line.

## Building without git metadata

- **Cloned repo**: works out of the box (a clone includes tags). Shallow
  clones need `git fetch --tags --unshallow` for a correct version; CI
  checkouts here use `fetch-depth: 0` for this reason.
- **GitHub source archives (Download ZIP / tarball)**:
  [`.git_archival.txt`](../.git_archival.txt) is substituted by GitHub at
  archive time (via `.gitattributes` `export-subst`) and setuptools-scm
  reads it, so archives of tagged commits version the Python package
  correctly. The viewer has no equivalent and builds as `0.0.0` from an
  archive; set `VIEWER_VERSION` instead.
- **Escape hatch**: set `SETUPTOOLS_SCM_PRETEND_VERSION=X.Y.Z` for the Python
  package, or `VIEWER_VERSION=X.Y.Z` (a leading `viewer-v` or `v` is
  stripped) for viewer/Electron builds, to force a version when no git
  metadata is available. The per-distribution form
  (`SETUPTOOLS_SCM_PRETEND_VERSION_FOR_NOODLE_BUCKET`) is silently ignored:
  hatch-vcs does not pass the distribution name through to setuptools-scm,
  so only the bare variable is honoured.

## Publishing to PyPI

The Python library publishes as **`noodle-bucket`** (`import bucket`; the
CLI remains `bucket`). The name `bucket` is already taken on PyPI.

Uploads use [Trusted Publishing](https://docs.pypi.org/trusted-publishers/)
— no API token is stored in the repo.

**A `v*` tag push uploads straight to production PyPI.** There is no manual
promote and no approval gate: cutting a bucket release tag publishes it.
The `[Patch]`/`[Minor]`/`[Major]` label on the merged PR, together with the
PR touching bucket files, is what decides a release happens at all.
`viewer-v*` tags never reach this workflow.

TestPyPI is opt-in, for rehearsing changes to the publish pipeline itself.
It is a separate site with a separate account and project; versions do not
copy across.

### What gets published

Only plain `X.Y.Z` versions. An untagged commit builds as
`X.Y.Z.devN+gSHA`, and the indexes reject that local segment, so a run from
a branch builds and verifies the artifacts but publishes nothing — it
reports which tag it *could* publish, and whether the index already has it.

Re-running is safe. The workflow queries the target index first and skips
the upload if that version is already there, so re-running a published tag
is a no-op rather than an error.

Production versions are immutable. A failed publish that never created the
version can be retried; a successful one can never be overwritten or the
number reused, even after deleting it. Fix forward with the next tag.

### Releasing

Merge a PR titled `[Patch]`, `[Minor]` or `[Major]` that changes bucket
files. That cuts the `v*` tag, which uploads to PyPI and redeploys the
Pages site so `/docs/` matches the release. Nothing else is needed. (The
viewer half of the site stays at its own newest release unless the same PR
changed viewer files too.)

The source PR gets two comments from **noodle-bucket-releases**: "Shipped
in vX.Y.Z" when the tag is cut, and a second linking the PyPI release once
the upload has actually succeeded. The absence of the second one means the
publish failed or was skipped.

To retry a release that failed partway, run *Actions → Publish to PyPI →
Run workflow* with **Use workflow from** set to the `v*` tag. Dispatching
from a branch (or from a `viewer-v*` tag) with the default `pypi` target
fails deliberately, naming the most recent bucket tag.

### Rehearsing on TestPyPI

Worth doing after any change to `publish-pypi.yml`, since production is
tag-triggered and there is no dry run in front of it.

*Actions → Publish to PyPI → Run workflow*, from `main`, target
**testpypi**, with **test_version** set to an unused number outside the
release line. That builds and uploads that exact version, exercising OIDC,
the environment, the publisher and the upload.

Pick a fresh number each time. The index pre-check skips versions that are
already present, so reusing one turns the rehearsal into a silent no-op
that proves nothing. `0.0.1` is already taken.

`test_version` is rejected with `target=pypi`, so it cannot touch
production. Do not cut a throwaway `v*` tag instead: a `v*` tag push
publishes to production PyPI, and production versions are immutable.

Install from TestPyPI (dependencies still come from real PyPI):

```bash
pip install -i https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple noodle-bucket
python -c "import bucket; print(bucket.__version__)"
bucket --version
```

### One-time setup (already done)

Recorded for recovery. Both trusted publishers are registered and both
projects exist, so none of this needs repeating unless something is lost.

Each index was registered as a *pending* publisher before the project
existed, at https://pypi.org/manage/account/publishing/ and
https://test.pypi.org/manage/account/publishing/:

| Field | Value |
|---|---|
| PyPI project name | `noodle-bucket` |
| Owner | `Noodle-Bytes` |
| Repository | `bucket` |
| Workflow name | `publish-pypi.yml` |
| Environment name | `pypi` or `testpypi` |

The workflow filename must match exactly, with no `workflows/` prefix —
that is the usual misconfiguration. The first successful upload converts a
pending publisher into a regular one. Whoever registers it becomes the
project owner; add others under **Collaborators**.

The matching GitHub environments live under **Settings → Environments** and
must match `environment.name` in
[`publish-pypi.yml`](workflows/publish-pypi.yml). Neither has required
reviewers, so a tag push publishes without waiting. Adding one on `pypi`
would turn every release into an approval prompt. Do not restrict
**Deployment branches and tags** to `v*`: that would block the TestPyPI
rehearsal, which runs from `main`.

## Identities and secrets

- **noodle-bucket-releases** (GitHub App) — creates release tags, releases,
  and the shipped-in / PyPI comments, appearing as
  `noodle-bucket-releases[bot]`. The release and publish workflows mint a
  short-lived installation token from the `NOODLE_APP_ID` and
  `NOODLE_APP_PRIVATE_KEY` repository secrets (App installed on this repo
  with Contents + Pull requests: Read and write). An App token is used
  rather than the default `GITHUB_TOKEN` because tags pushed with
  `GITHUB_TOKEN` do not trigger `deploy-viewer.yml` or `publish-pypi.yml`.
  Private keys do not expire; if compromised, generate a new one on the
  App's settings page and update `NOODLE_APP_PRIVATE_KEY`.
- **PyPI / TestPyPI Trusted Publishers** — `publish-pypi.yml` exchanges a
  GitHub OIDC token for a short-lived upload token against the `testpypi`
  or `pypi` environment. No API token is stored in GitHub secrets. See
  [Publishing to PyPI](#publishing-to-pypi).

Two repository settings lean on the fact that GitHub's `v*` glob also
matches `viewer-v*`, so one pattern covers both lines:

- The **release-tags** tag ruleset restricts creation, update and deletion
  of `refs/tags/v*` to the noodle-bucket-releases App and the listed
  maintainers. It therefore protects `viewer-v*` tags too, and the App can
  create both.
- The **github-pages** environment accepts deployments from `main` and from
  `v*` tags, which covers both lines' tags (Pages deploys run on either).
  If that policy is ever tightened to `v[0-9]*`, add an explicit
  `viewer-v*` tag entry beside it.

## Recovery

If `tag-release-on-merge.yml` fails before creating anything, nothing is
left behind — no tag, no release, no comment. Fix the cause (e.g. a revoked
App key, or the App losing repo access) and either re-run the failed
workflow run, or cut the missed release via `workflow_dispatch`. The
release step is idempotent: it skips if the release already exists and
refuses to overwrite an existing tag.

A PR that releases both lines cuts bucket first, then the viewer. If the
run fails between the two, the bucket release exists and the viewer's does
not; cut the viewer release via `workflow_dispatch` with
`component=viewer` rather than re-running, which would stop on the
already-existing bucket tag.

## Required checks on `main` (GitHub settings)

These live in GitHub branch protection, not in this repo, so nothing keeps
them in sync with the workflows — re-check them whenever the CI matrix
changes. Verified against the live settings:

- `enforce-title-prefix`
- `CodeQL`
- `test (3.11)`, `test (3.12)`, `test (3.13)`, `test (3.14)`
- `test-viewer (22)`, `test-viewer (23)`, `test-viewer (24)`
- 1 approving review, strict up-to-date requirement
