#!/bin/bash
# Build the Bucket desktop app for the current OS.
#
# This is a thin wrapper around build.mjs so existing `./electron/build.sh`
# invocations keep working. The real logic lives in build.mjs, which runs
# anywhere Node does (macOS, Linux, Windows cmd/PowerShell without a bash).
#
# Usage:
#   ./electron/build.sh                 # host OS
#   ./electron/build.sh --mac|--win|--linux [--x64|--arm64]
#   ./electron/build.sh -- <extra electron-builder args>

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$SCRIPT_DIR/build.mjs" "$@"
