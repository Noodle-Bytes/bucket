#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
#
# Compute the next release tag for one release line from the tags already in
# the repository. Versions live in git tags, not files, and each line only
# ever looks at its own tags: "v" for bucket, "viewer-v" for the viewer.
#
# Usage: next-version.sh <tag-prefix> <patch|minor|major>
#        next-version.sh <tag-prefix> exact <X.Y.Z>
#
# Prints GITHUB_OUTPUT-style lines:
#   latest=<newest existing tag on the line, empty if there is none yet>
#   next=<tag to create>
#
# Needs a checkout with full tag history (fetch-depth: 0).

set -euo pipefail

usage="usage: next-version.sh <tag-prefix> <patch|minor|major|exact> [X.Y.Z]"
prefix="${1:?$usage}"
bump="${2:?$usage}"
exact="${3:-}"

# "v[0-9]*" does not match "viewer-v2.11.0", so the bucket line never sees
# viewer tags; versionsort orders v2.11.10 above v2.11.9.
latest="$(git tag --list "${prefix}[0-9]*" --sort=-v:refname | head -1)"

if [ "$bump" = "exact" ]; then
    if ! echo "$exact" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
        echo "::error title=Invalid version::'${exact}' is not of the form X.Y.Z" >&2
        exit 1
    fi
    next="$exact"
else
    base="${latest#"$prefix"}"
    if [ -z "$base" ]; then
        base="0.0.0"
    fi
    IFS=. read -r major minor patch <<<"$base"
    case "$bump" in
        major) next="$((major + 1)).0.0" ;;
        minor) next="${major}.$((minor + 1)).0" ;;
        patch) next="${major}.${minor}.$((patch + 1))" ;;
        *)
            echo "::error title=Unsupported bump type::'${bump}'" >&2
            exit 1
            ;;
    esac
fi

echo "latest=${latest}"
echo "next=${prefix}${next}"
