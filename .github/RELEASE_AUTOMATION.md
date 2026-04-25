<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
  -->

# Release Automation — Operator Guide

This document is for repository maintainers. It describes how the automated
release pipeline works and, more importantly, how to recover when it fails.

End-user / library documentation lives in [`docs/`](../docs/index.md); this
file is not part of the published docs site.

## Contents

1. [How the pipeline works](#how-the-pipeline-works)
2. [PR title prefixes](#pr-title-prefixes)
3. [The `release-pipeline-gate` required check](#the-release-pipeline-gate-required-check)
4. [Stay-blocked recovery policy](#stay-blocked-recovery-policy)
5. [Recovery: clearing a stuck gate](#recovery-clearing-a-stuck-gate)
6. [Reference](#reference)

---

## How the pipeline works

1. A contributor opens a PR against `main` with a release-prefix title
   (`[Patch]`, `[Minor]`, `[Major]`, `[None]`, or `[Force]`).
2. `Release Pipeline Gate`
   ([`.github/workflows/release-pipeline-gate.yml`](workflows/release-pipeline-gate.yml))
   posts a `release-pipeline-gate` commit status on the PR head. This is a
   required check on `main`.
3. When a `[Patch]/[Minor]/[Major]` PR is merged, `Bump Version On Merge`
   ([`.github/workflows/bump-version-on-merge.yml`](workflows/bump-version-on-merge.yml))
   does the following in order:
   - Flips every other open source PR's `release-pipeline-gate` status to
     `pending` so they cannot merge while a release is in flight.
   - Fails fast (defensive check) if a release PR (`ci/version-bump-main`) is
     already open. This must not happen if the gate is configured correctly,
     but the check exists to prevent silent version downgrades or lost
     releases if it ever does.
   - Bumps the version files, opens a `[Force]` release PR as
     `noodle-bucket-bot`, and approves it via the `bucket-release-approver`
     GitHub App.
   - Polls `gh pr merge --squash` until the PR merges.
   - Re-runs against the merged release PR to create the GitHub release tag.
   - Resets every other open source PR's gate back to `success`.

## PR title prefixes

| Prefix    | Effect when merged                                                | Gate status posted        |
|-----------|-------------------------------------------------------------------|---------------------------|
| `[Patch]` | Triggers a patch bump and release                                 | `success` if pipeline free, else `pending` |
| `[Minor]` | Triggers a minor bump and release                                 | `success` if pipeline free, else `pending` |
| `[Major]` | Triggers a major bump and release                                 | `success` if pipeline free, else `pending` |
| `[None]`  | No bump, no release                                               | always `success`          |
| `[Force]` | Manual / automation-generated bump (the release PR itself)        | always `success`          |

`[Force]` PRs do not gate themselves and are normally only created by the
bump workflow. Manual `[Force]` PRs are allowed but should be rare.

## The `release-pipeline-gate` required check

This is a custom commit-status check (not a GitHub Actions check run). It
ensures that only one release process is active at a time.

- **`success`** — no release PR is currently open. Source PRs with this status
  are free to merge.
- **`pending`** — a release PR is in flight (or the bump workflow failed
  partway and the stay-blocked policy is keeping things locked).

The status is named exactly `release-pipeline-gate` and is posted on each
PR's head SHA. It is configured as a required status check on `main` in
branch protection.

## Stay-blocked recovery policy

If `Bump Version On Merge` fails between flipping gates to `pending` and the
final "Set release pipeline gate to success on open source PRs" step, every
source PR's gate is intentionally left `pending`.

This is deliberate. The alternatives — clearing on failure, or running the
clear step with `if: always()` — would let new source PRs merge during a
broken release pipeline, risking lost releases or version downgrades.

When the pipeline is broken, no new releases land until a human investigates.
Your three options to recover are below.

## Recovery: clearing a stuck gate

### Option 1 — re-run the bump workflow (preferred)

If the bump PR is still salvageable, fix the underlying cause and re-run the
last `Bump Version On Merge` run. A successful run will hit the
"Set release pipeline gate to success on open source PRs" step and clear
every gate automatically.

```bash
gh run list --workflow="Bump Version On Merge" --limit 5
gh run rerun <run-id>
gh run rerun <run-id> --failed   # only re-run failed jobs
```

### Option 2 — manually clear one PR

There is no "delete a status" API. You overwrite the `pending` status by
posting a fresh `success` status with the same context name on the same SHA.

```bash
PR=123  # the source PR you want to unblock
SHA="$(gh pr view "$PR" --json headRefOid --jq .headRefOid)"
gh api -X POST "repos/Noodle-Bytes/bucket/statuses/${SHA}" \
  -f state=success \
  -f context=release-pipeline-gate \
  -f description='Manually cleared.' \
  -f target_url="https://github.com/Noodle-Bytes/bucket/actions"
```

The required check turns green within a few seconds.

### Option 3 — manually clear every open source PR

Use this after fixing the underlying problem when several source PRs are
queued behind the failed release.

```bash
REPO=Noodle-Bytes/bucket
gh pr list --repo "$REPO" --state open --base main \
  --json number,title,headRefOid \
  --jq '.[] | select(.title | test("^\\[(Patch|Minor|Major)\\]")) | "\(.number) \(.headRefOid)"' \
| while read -r pr sha; do
    echo "Clearing gate on PR #${pr} (${sha:0:7})"
    gh api -X POST "repos/${REPO}/statuses/${sha}" \
      -f state=success \
      -f context=release-pipeline-gate \
      -f description='Manually cleared after release pipeline recovery.' \
      -f target_url="https://github.com/${REPO}/actions" >/dev/null
  done
```

### Pre-clear checklist

Before running Option 2 or 3, confirm no release PR is genuinely in flight.
If there is one, clearing the gate would let a source PR merge into the race
the gate exists to prevent.

```bash
gh pr list --repo Noodle-Bytes/bucket \
  --state open --base main \
  --json number,title,headRepositoryOwner,headRefName \
  --jq '[.[] | select(.headRefName == "ci/version-bump-main"
                   and .headRepositoryOwner.login == "Noodle-Bytes")]'
```

This must return `[]` before you clear.

### Common mistakes

- **Wrong context name.** The context must be exactly `release-pipeline-gate`
  (lowercase, hyphens). A typo posts a *new* required check that is missing
  → permanently red.
- **Wrong SHA.** Must be the PR's current head commit. If you push a new
  commit later, `Release Pipeline Gate` re-evaluates from scratch on the new
  SHA, so a manually-cleared status only sticks until the next push to that
  PR.
- **Token scope.** Your normal `gh` PAT with `repo` scope works. The status
  is posted as you, which appears in the PR's "Checks" timeline.

## Reference

### Workflows

- [`bump-version-on-merge.yml`](workflows/bump-version-on-merge.yml) —
  detects merged source PRs, opens / approves / merges the `[Force]` release
  PR, manages the `release-pipeline-gate` status during a release.
- [`release-pipeline-gate.yml`](workflows/release-pipeline-gate.yml) —
  posts the initial `release-pipeline-gate` status on every release-prefixed
  PR opened against `main`. Uses `pull_request_target` so it works for fork
  PRs.
- [`pr-title-check.yml`](workflows/pr-title-check.yml) — enforces title
  prefixes and restricts which actors may author or approve `[Force]` PRs.

### Identities

- **`noodle-bucket-bot`** — service-account user. Authors the `[Force]`
  release PRs and merges them. Authentication via the `VERSION_BUMP_TOKEN`
  secret. By policy (enforced in `pr-title-check.yml`), this account may
  only author `[Force]` PRs on `ci/version-bump-main`.
- **`bucket-release-approver` (GitHub App)** — approves the `[Force]` release
  PR so it satisfies the "1 approving review" branch protection rule.
  Authentication via `RELEASE_APPROVER_APP_ID` and
  `RELEASE_APPROVER_PRIVATE_KEY` secrets. By policy, this app may only
  approve `[Force]` PRs authored by `noodle-bucket-bot`.

### Required status checks on `main`

- `release-pipeline-gate` (custom commit status, posted by the gate workflow)
- `CodeQL`
- `test (3.11)`
- `test (3.12)`

Plus 1 approving review and `strict: true` (branch must be up-to-date with
`main` before merging).

### Branch protection bypass

Bypass for required pull request reviews is granted to:

- `noodle-bucket-bot` (so it can merge its own `[Force]` release PRs without
  a human approval, in conjunction with the App approval).
- `github-actions[bot]` (legacy; the App approval flow does not require it
  but it is left in place for safety).
