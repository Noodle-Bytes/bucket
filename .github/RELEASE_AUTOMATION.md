<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
  -->

# Release Automation — Operator Guide

This document is for repository maintainers. It describes how releases are
cut and how to recover when something fails.

End-user / library documentation lives in [`docs/`](../docs/index.md); this
file is not part of the published docs site.

## How versioning works

Versions are derived from **git tags** — they are not stored in any file in
the repository. `pyproject.toml` declares a dynamic version resolved by
[hatch-vcs](https://github.com/ofek/hatch-vcs) (setuptools-scm underneath),
and the viewer/Electron builds inject a version resolved from `git describe`
(or the `BUCKET_VERSION` env var) at build time — see
[`viewer/scripts/resolve-version.mjs`](../viewer/scripts/resolve-version.mjs).
The `version` fields in `viewer/package.json` and `electron/package.json`
are `0.0.0` placeholders — do not edit them.

| State of checkout | Python (PEP 440) | Viewer/Electron (semver) |
|---|---|---|
| Exactly on tag `v2.4.3`, clean | `2.4.3` | `2.4.3` |
| 2 commits past the tag | `2.4.4.dev2+g<sha>` | `2.4.4-dev.2+g<sha>` |
| Uncommitted local changes | trailing `.d<date>` | trailing `.dirty` |

A dev/dirty suffix on a build is accurate, not a bug: that build is not the
released artifact. Official artifacts are built from tags and get exact
versions. The viewer's update-availability check is skipped when the build
version is the `0.0.0` fallback (no git metadata at build time).

## Release flow

1. Open a PR against `main` with a title prefix: `[Patch]`, `[Minor]`,
   `[Major]`, or `[None]` (enforced by
   [`pr-title-check.yml`](workflows/pr-title-check.yml)).
2. When the PR merges,
   [`tag-release-on-merge.yml`](workflows/tag-release-on-merge.yml):
   - `[None]` → does nothing.
   - Otherwise → reads the latest `v*` tag, bumps the corresponding part,
     and creates a GitHub release (tag + auto-generated notes) targeting
     the merge commit, as **noodle-bucket-bot**. The bot also comments
     "🪣 Shipped in vX.Y.Z" on the source PR.
3. The new tag triggers
   [`deploy-viewer.yml`](workflows/deploy-viewer.yml), which builds the
   viewer with the exact release version and publishes it (plus docs) to
   GitHub Pages.

Two nearly-simultaneous merges are serialized by the release workflow's
concurrency group (queued, never cancelled), so each computes its version
from the previous one's tag.

## Manual release (immediate or exact version)

Run **Tag Release On Merge** via *Actions → Tag Release On Merge → Run
workflow*:

- Pick `bump` (patch/minor/major) to cut a release from the current `main`
  HEAD without waiting for a PR merge, or
- Enter an exact `version` (`X.Y.Z`) to override the computed bump.

## Building without git metadata

- **Cloned repo**: works out of the box (a clone includes tags). Shallow
  clones need `git fetch --tags --unshallow` for a correct version; CI
  checkouts here use `fetch-depth: 0` for this reason.
- **GitHub source archives (Download ZIP / tarball)**:
  [`.git_archival.txt`](../.git_archival.txt) is substituted by GitHub at
  archive time (via `.gitattributes` `export-subst`) and setuptools-scm
  reads it, so archives of tagged commits version correctly.
- **Escape hatch**: set `SETUPTOOLS_SCM_PRETEND_VERSION_FOR_BUCKET=X.Y.Z`
  for the Python package, or `BUCKET_VERSION=X.Y.Z` for viewer/Electron
  builds, to force a version when no git metadata is available.

## Identities and secrets

- **noodle-bucket-bot** (service account) — creates release tags, releases,
  and the shipped-in comments. Authenticated via the `VERSION_BUMP_TOKEN`
  repository secret (classic PAT with `repo` scope, or fine-grained with
  Contents + Pull requests: Read and write). A PAT is required because tags
  pushed with the default `GITHUB_TOKEN` do not trigger
  `deploy-viewer.yml`.
- [`token-health-check.yml`](workflows/token-health-check.yml) validates
  the PAT every Monday 09:00 UTC (and on manual dispatch) so expiry is
  caught before a release needs it.

The `bucket-release-approver` GitHub App, the `release-pipeline-gate`
status check, and bot-authored `[Release]` PRs belonged to the previous
file-based versioning flow and are retired.

## Recovery

The failure surface is small: if `tag-release-on-merge.yml` fails, no state
is left behind — no branches, no PRs, no blocked gates on other PRs. Fix
the cause (usually an expired `VERSION_BUMP_TOKEN`) and either re-run the
failed workflow run, or cut the missed release via `workflow_dispatch`.
The release step is idempotent: it skips if the release already exists and
refuses to overwrite an existing tag.

## Required checks on `main` (GitHub settings)

- `PR Title Check / enforce-title-prefix`
- `CodeQL`
- `test (3.11)`, `test (3.12)`
- 1 approving review, strict up-to-date requirement

`release-pipeline-gate` must NOT be in this list — it no longer exists and
would block every PR. Optionally add a tag ruleset restricting `v*` tag
creation to noodle-bucket-bot.
