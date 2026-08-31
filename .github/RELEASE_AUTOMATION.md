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
     the merge commit, as the **noodle-bucket-releases** App. It also
     comments "🪣 Shipped in vX.Y.Z" on the source PR.
3. The new tag triggers two downstream workflows:
   - [`deploy-viewer.yml`](workflows/deploy-viewer.yml) builds the viewer
     with the exact release version and publishes it (plus docs) to GitHub
     Pages.
   - [`publish-pypi.yml`](workflows/publish-pypi.yml) builds the Python
     sdist and wheel and uploads them to **production PyPI** as
     `noodle-bucket`. This is immediate and irreversible (see below).

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
- **Escape hatch**: set `SETUPTOOLS_SCM_PRETEND_VERSION=X.Y.Z` for the Python
  package, or `BUCKET_VERSION=X.Y.Z` for viewer/Electron builds, to force a
  version when no git metadata is available. The per-distribution form
  (`SETUPTOOLS_SCM_PRETEND_VERSION_FOR_NOODLE_BUCKET`) is silently ignored:
  hatch-vcs does not pass the distribution name through to setuptools-scm,
  so only the bare variable is honoured.

## Publishing to PyPI

The Python library publishes as **`noodle-bucket`** (`import bucket`; the
CLI remains `bucket`). The name `bucket` is already taken on PyPI.

Uploads use [Trusted Publishing](https://docs.pypi.org/trusted-publishers/)
— no API token is stored in the repo.

**A `v*` tag push uploads straight to production PyPI.** There is no manual
promote and no approval gate: cutting a release tag publishes it. The
`[Patch]`/`[Minor]`/`[Major]` label on the merged PR is what decides a
release happens at all.

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

Merge a PR titled `[Patch]`, `[Minor]` or `[Major]`. That cuts the tag,
which uploads to PyPI and deploys the viewer. Nothing else is needed.

To retry a release that failed partway, run *Actions → Publish to PyPI →
Run workflow* with **Use workflow from** set to the tag. Dispatching from a
branch with the default `pypi` target fails deliberately, naming the most
recent tag.

### Rehearsing on TestPyPI

Worth doing after any change to `publish-pypi.yml`, since production is now
tag-triggered and there is no dry run in front of it.

*Actions → Publish to PyPI → Run workflow*, from `main`, target
**testpypi**, with **test_version** set to something outside the release
line such as `0.0.1`. That builds and uploads that exact version,
exercising OIDC, the environment, the publisher and the upload.

`test_version` is rejected with `target=pypi`, so it cannot touch
production. Do not cut a throwaway `v*` tag instead: tag pushes also
trigger [`deploy-viewer.yml`](workflows/deploy-viewer.yml), so a fake tag
would publish the viewer site as a side effect.

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
  and the shipped-in comments, appearing as `noodle-bucket-releases[bot]`.
  The release workflow mints a short-lived installation token from the
  `NOODLE_APP_ID` and `NOODLE_APP_PRIVATE_KEY` repository secrets (App
  installed on this repo with Contents + Pull requests: Read and write). An
  App token is used rather than the default `GITHUB_TOKEN` because tags
  pushed with `GITHUB_TOKEN` do not trigger `deploy-viewer.yml` or
  `publish-pypi.yml`.
- **PyPI / TestPyPI Trusted Publishers** — `publish-pypi.yml` exchanges a
  GitHub OIDC token for a short-lived upload token against the `testpypi`
  or `pypi` environment. No API token is stored in GitHub secrets. See
  [Publishing to PyPI](#publishing-to-pypi).
- An App private key does not expire, so there is no token to renew and no
  scheduled health check. If the key is ever compromised, generate a new
  one on the App's settings page and update `NOODLE_APP_PRIVATE_KEY`.

The `noodle-bucket-bot` service account and its `VERSION_BUMP_TOKEN` PAT,
the `bucket-release-approver` GitHub App, the `release-pipeline-gate` status
check, bot-authored `[Release]` PRs, and the Monday token health check all
belonged to earlier versions of the release flow and are retired.

## Recovery

The failure surface is small: if `tag-release-on-merge.yml` fails, no state
is left behind — no branches, no PRs, no blocked gates on other PRs. Fix
the cause (e.g. a revoked App key, or the App losing repo access) and
either re-run the failed workflow run, or cut the missed release via
`workflow_dispatch`. The release step is idempotent: it skips if the
release already exists and refuses to overwrite an existing tag.

## Required checks on `main` (GitHub settings)

- `PR Title Check / enforce-title-prefix`
- `CodeQL`
- `test (3.11)`, `test (3.12)`
- 1 approving review, strict up-to-date requirement

`release-pipeline-gate` must NOT be in this list — it no longer exists and
would block every PR. Optionally add a tag ruleset restricting `v*` tag
creation to the noodle-bucket-releases App.
