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
     sdist and wheel and uploads them to **TestPyPI** as `noodle-bucket`.
     Production PyPI is a separate, explicit promote (see below).

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
- **Escape hatch**: set `SETUPTOOLS_SCM_PRETEND_VERSION_FOR_NOODLE_BUCKET=X.Y.Z`
  for the Python package, or `BUCKET_VERSION=X.Y.Z` for viewer/Electron
  builds, to force a version when no git metadata is available.

## Publishing to PyPI (one-time setup)

The Python library publishes as **`noodle-bucket`** (`import bucket`; the
CLI remains `bucket`). The name `bucket` is already taken on PyPI.

Uploads use [Trusted Publishing](https://docs.pypi.org/trusted-publishers/)
— no API token is stored in the repo. **TestPyPI is the default.** A `v*`
tag uploads there automatically; production is an explicit promote of that
same tag once the TestPyPI install looks right.

TestPyPI (`test.pypi.org`) is a separate site with a separate account and
separate project. Versions do not copy across.

### 1. Accounts

Create accounts (2FA) on both:

- https://test.pypi.org/account/register/ — use this first
- https://pypi.org/account/register/ — only needed when promoting

The first person to register each pending publisher becomes that project's
owner; add other maintainers afterwards under **Collaborators**.

### 2. GitHub environments

In the GitHub repo: **Settings → Environments → New environment**. Create
two:

| Name | Reviewers | Notes |
|---|---|---|
| `testpypi` | none | Automatic on every `v*` tag |
| `pypi` | optional | Only used by the manual promote |

Names must match `environment.name` in
[`publish-pypi.yml`](workflows/publish-pypi.yml). Do **not** add required
reviewers on `testpypi`. On `pypi`, a required reviewer is a useful extra
gate the first few times; leave it off if a dispatch to `pypi` should
upload immediately.

Optional: under **Deployment branches and tags** on both, restrict to
tags matching `v*`. If you do that, skip step 4's "from `main`" dry run
and use an existing `v*` tag instead.

### 3. Pending trusted publisher (TestPyPI first)

Until the first successful upload, the project does not exist yet.
Register a *pending* publisher at
https://test.pypi.org/manage/account/publishing/:

| Field | Value |
|---|---|
| PyPI project name | `noodle-bucket` |
| Owner | `Noodle-Bytes` |
| Repository | `bucket` |
| Workflow name | `publish-pypi.yml` |
| Environment name | `testpypi` |

The workflow filename must match exactly (no `workflows/` prefix). After
the first upload, the pending publisher becomes a regular publisher on
the live TestPyPI project.

Repeat the same form later at
https://pypi.org/manage/account/publishing/ with environment name
`pypi` — not before TestPyPI has been proven.

### 4. Prove the pipeline on TestPyPI

Pick one:

**From `main` (no tag):** *Actions → Publish to PyPI → Run workflow*,
workflow from `main`, target **testpypi**. The build uses a throwaway
version `0.0.<run_number>.dev0` because a local `+gSHA` version is
rejected by the index.

**From a tag:** the next `[Patch]`/`[Minor]`/`[Major]` merge uploads that
exact version to TestPyPI automatically. To retry, run the workflow
against that tag with target **testpypi** (`skip-existing` is on, so a
repeat of the same version is a no-op).

Then install and smoke-test (dependencies still come from real PyPI):

```bash
pip install -i https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple noodle-bucket
python -c "import bucket; print(bucket.__version__)"
bucket --version
```

### 5. Promote a tag to production

Once step 4 looks right and the production pending publisher from step 3
is in place:

1. *Actions → Publish to PyPI → Run workflow*
2. **Use workflow from** the `v*` tag you verified (not `main`)
3. Target **pypi**

That uploads the exact tagged version to https://pypi.org/project/noodle-bucket/.

Production versions are immutable. A failed publish that never created
the version can be retried; a successful publish cannot be overwritten.
Fix forward with the next tag.

Tag pushes do **not** upload to production. After TestPyPI has been
reliable for a few releases, tag-triggered production can be enabled in
[`publish-pypi.yml`](workflows/publish-pypi.yml) by adding a tag-push
condition to the `publish-pypi` job.

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
  [Publishing to PyPI](#publishing-to-pypi-one-time-setup).
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
