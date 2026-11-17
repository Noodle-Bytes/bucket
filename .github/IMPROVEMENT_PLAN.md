<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
  -->

# Improvement Plan

This plan comes from a review of the Python library, the viewer, the Electron
app and CI in November 2026. Each item is one PR unless noted. Titles use the
release prefixes from [RELEASE_AUTOMATION.md](RELEASE_AUTOMATION.md).

Some findings were not reproduced during the review, so each PR should start
by confirming its problem exists.

Done:

- [#266](https://github.com/Noodle-Bytes/bucket/pull/266) **[Patch] Store
  unwaived coverage when writing with waivers.**

## Phase 1: Security and correctness

1. **[Patch] Electron: serve the viewer from memory.**
   - Stop writing `index-electron.html` into the app bundle (`main.js` ~737).
     This fails on read-only installs: Linux AppImage and translocated
     unsigned macOS apps.
   - Move from the deprecated `registerFileProtocol` to `protocol.handle`,
     and keep resolved paths inside the viewer `dist` folder.
   - Send a Content-Security-Policy header.
   - Comes first because PR 2 relies on its protocol handler.
2. **[Patch] Electron: lock down file reads and navigation.**
   - The `read-file` IPC handler reads any path the renderer sends. Only
     allow paths the main process handed out (dialog results, opened files,
     command-line arguments, recent files).
   - Add `will-navigate` / `will-redirect` guards that block anything other
     than the app's own origin.
   - Set `sandbox: true` explicitly, and escape every field on the error page.
   - Remove the dead IPC handlers (`get-dropped-file`, `onClearCoverage`) and
     fix the type drift in `viewer/src/vite-env.d.ts`.
3. **[Patch] Electron: fix file opening and the menus.**
   - Files opened before the page has loaded are sent too early and lost.
     Track renderer readiness and queue until then.
   - "Open Recent" never appears, because the menu template never creates
     the item that `updateRecentFilesMenu` replaces.
   - "Open…" does nothing on macOS when no window is open.
   - The load-failure handler shows an error page on `ERR_ABORTED` (-3).
   - Hide DevTools and Reload in packaged builds, and remove the duplicate
     `openDevTools` call.
4. **[Patch] Viewer: make "Select unhit" respect column filters.**
   - In full mode the selection is built before the axis column filters
     apply, so waivers can cover buckets the user never saw.
5. **[Patch] Viewer: make loading and sessions robust (`useFileLoader`).**
   - Queue concurrent loads instead of running them in parallel.
   - Stop Refresh overwriting the session with a stale snapshot.
   - Prevent duplicate record IDs when a file is dropped during restore.
   - Run Clear through the persistence queue so a pending save can't
     resurrect cleared data.
   - Load the good files when one file in a batch is corrupt, and report the
     bad one.
6. **[Patch] Viewer: fix small state bugs.**
   - `providers/Theme.tsx` adds `matchMedia` listeners on every render.
   - The Edit records and Export modals reset their state while open.
   - Saving or copying waivers can fail with no message.
7. **[Patch] Python: give clear errors for bad input.**
   - Replace user-facing `assert`s (`add_goal`, `Bucket.hit`, CLI file
     checks) with real exceptions.
   - Name the unknown axis on a `hit(...)` typo, instead of reporting a
     different axis as unset.
   - Use `BucketException` subclasses instead of plain `Exception`.
8. **[Patch] Write archives atomically.**
   - `ArchiveWriter` overwrites the archive in place. Write to a temp file
     and swap it in with `os.replace`.

## Phase 2: Large designs

9. **[Patch] Viewer: speed up data access.** Add regression tests first.
   - `ArchiveTable.slice` copies the whole table before taking one
     coverpoint's range.
   - The `pointPath` lookup rebuilds the full points array inside its loop.
   - Waiver matching compiles a new regex for every bucket, rule and axis.
   - Large mode builds full-size waiver and axis-option data even when
     waiver creation is off.
10. **[Patch] Viewer: stop recomputing on every waiver edit.**
    - Build the comparison only while compare mode is on.
    - Reuse waived readouts between the base tree and compare views.
    - Memoize the `useWaiverSession` and `useCoverageCompare` return values.
11. **[Patch] Viewer: virtualize the big views.**
    - Virtualize the Summary table and the sidebar tree.
    - Stop the pivot table re-rendering every cell on hover.
12. **[Minor] Store each definition once in archives and SQL.**
    - Every record currently stores a full copy of its definition.
    - Writers reuse an existing definition with the same hash. No format
      change is needed: the Python and viewer readers already look
      definitions up by offset.
    - Widen the SQL `String(30)` name and description columns in the same PR.

## Phase 3: Tooling and CI

These can run alongside phases 1 and 2.

13. **[None] Make Python CI reproducible.**
    - Commit `uv.lock` (currently gitignored), switch to `setup-uv` with
      `--locked`, and fix `bin/setup-env.sh`.
    - Run tests on pushes to `main` as well as PRs.
    - Add a coverage report and a minimum threshold.
14. **[None] Clean up the workflows.**
    - Test on Node 22 and 24, deploy on 24, and use `npm ci`.
    - Fix the `create-github-app-token` SHA comment, and pin MkDocs.
    - Move the Pages permissions to the deploy job only.
    - Update the pre-commit hooks (ruff is pinned to v0.5.7).
    - Ignore `node_modules/` and `viewer/tmp/`, and remove duplicate
      `.gitignore` entries.
15. **[None] Build and lint Electron in CI.**
    - `npm ci`, ESLint, and a Linux `--dir` build smoke test.
16. **[None] Add viewer component tests.**
    - Add jsdom and Testing Library.
    - Export and test `buildPointTableModel` and the Summary filter logic.
    - Must land before PR 17.
17. **[None] Split the large files.**
    - Break up `Dashboard/index.tsx` into the modals and header.
    - Remount `PointGrid` by key instead of resetting its state in an effect.
    - Split `electron/main.js` into modules.
    - Re-enable `react-hooks/set-state-in-effect` and remove the
      `exhaustive-deps` disables.
18. **[None] Add a Python type checker** (mypy or pyright) and fix what it
    finds.

## Phase 4: Features

19. **[Minor] Add `bucket check --fail-under`** so CI can fail when coverage
    drops below a threshold.
20. **[Minor] Add a waiver hygiene report to the CLI**, listing rules that
    match nothing and buckets that are waived but were hit.
21. **Viewer features, one PR each:**
    - [Minor] Summary table sorting.
    - [Minor] Export a coverpoint's unhit buckets as CSV.
    - [Minor] Open `.json` coverage in the viewer.
    - [Minor] Refresh from disk in the web app, not just Electron.
    - [Minor] A "next unhit coverpoint" keyboard shortcut.
    - [Patch] Keyboard and screen-reader fixes: breadcrumbs, Summary
      drill-down, pivot axes, sidebar resize handle.

## Needs a decision first

- **Desktop releases with installers, plus signing and notarisation.** Needs
  an Apple Developer ID and a Windows signing certificate as repo secrets.
  Until then, PR 15 only builds and lints.
- **Waiver expiry and ticket fields.** Changes the waiver file format and
  needs matching viewer changes.
- **Configurable default goal target.** The target of 10 is hardcoded in
  `Coverpoint.add_goal`. Decide the name and whether it is a coverpoint class
  attribute or a covertop setting.
- **Pickling a `Covertop` for multiprocessing.** Needs a design for merging
  sampled hits back from worker processes.
- **Appending to archives without rewriting them.** `ArchiveWriter` unpacks
  and recompresses the whole archive on every write. Fixing this properly
  needs an append-friendly layout.
