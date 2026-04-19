#!/usr/bin/env bash
# Build script for Bucket Electron desktop app.
#
# Usage:
#   ./electron/build.sh            # Build for host OS
#   ./electron/build.sh mac        # Build macOS target
#   ./electron/build.sh linux      # Build Linux targets
#   ./electron/build.sh win        # Build Windows target
#   ./electron/build.sh all        # Attempt all targets (CI recommended)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

node "$SCRIPT_DIR/build.js" "$@"
