#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
#
# Decide which release lines a set of changed files belongs to.
#
# Bucket (the Python package, tagged v*) and the viewer (the web viewer and
# the Electron app, tagged viewer-v*) are versioned and released
# independently. A PR's [Patch]/[Minor]/[Major] prefix says how big the
# change is; the files it touches say which line(s) it releases. Documentation
# never cuts a release on its own. See .github/RELEASE_AUTOMATION.md.
#
# Usage: <changed files, one per line> | release-components.sh
#
# Prints GITHUB_OUTPUT-style lines on stdout:
#   bucket=true|false
#   viewer=true|false
#   components=<space-separated names, empty when nothing releasable changed>
# and a per-file classification on stderr for the workflow log.

set -euo pipefail

bucket=false
viewer=false

while IFS= read -r file; do
    if [ -z "$file" ]; then
        continue
    fi
    case "$file" in
        # Python package: the code and packaging metadata that end up in the
        # sdist or wheel.
        bucket/*|pyproject.toml|LICENSE|.git_archival.txt|.gitattributes)
            bucket=true
            echo "  bucket  $file" >&2
            ;;
        # Viewer: the web app, the Electron shell that wraps it, and the
        # branding assets both of them embed.
        viewer/*|electron/*|branding/*)
            viewer=true
            echo "  viewer  $file" >&2
            ;;
        # Everything else never cuts a release on its own: CI, tests, tools,
        # examples, repo housekeeping, and documentation. docs/, mkdocs.yml
        # and README.md describe the Python library and go live with the next
        # bucket release (deploy-viewer.yml builds the docs from the newest v*
        # tag), so a docs-only PR is [None].
        *)
            echo "  -       $file" >&2
            ;;
    esac
done

components=""
if [ "$bucket" = true ]; then
    components="bucket"
fi
if [ "$viewer" = true ]; then
    components="${components:+$components }viewer"
fi

echo "bucket=$bucket"
echo "viewer=$viewer"
echo "components=$components"
