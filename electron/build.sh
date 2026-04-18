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
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET="${1:-host}"

resolve_host_target() {
  case "$(uname -s)" in
    Darwin)
      echo "mac"
      ;;
    Linux)
      echo "linux"
      ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT)
      echo "win"
      ;;
    *)
      echo ""
      ;;
  esac
}

case "$TARGET" in
  host)
    TARGET="$(resolve_host_target)"
    if [ -z "$TARGET" ]; then
      echo "Error: unsupported host platform for auto target selection." >&2
      echo "Use one of: mac, linux, win, all" >&2
      exit 1
    fi
    ;;
  mac|linux|win|all)
    ;;
  *)
    echo "Usage: ./electron/build.sh [host|mac|linux|win|all]" >&2
    exit 1
    ;;
esac

ensure_node_modules() {
  local dir="$1"
  local label="$2"
  if [ ! -d "$dir/node_modules" ]; then
    echo "Installing $label dependencies..."
    (cd "$dir" && npm ci)
  fi
}

echo "Building Bucket Electron app (target: $TARGET)..."
echo ""

echo "Step 1: Building viewer..."
ensure_node_modules "$PROJECT_ROOT/viewer" "viewer"
(cd "$PROJECT_ROOT/viewer" && npm run build)
echo "Viewer built successfully."
echo ""

echo "Step 2: Building Electron app..."
ensure_node_modules "$SCRIPT_DIR" "Electron"

build_target() {
  local script="$1"
  echo "Running npm run $script..."
  (cd "$SCRIPT_DIR" && npm run "$script")
}

case "$TARGET" in
  mac)
    build_target "build:mac"
    ;;
  linux)
    build_target "build:linux"
    ;;
  win)
    build_target "build:win"
    ;;
  all)
    echo "Note: building all targets usually requires CI/extra host tooling."
    build_target "build:mac"
    build_target "build:linux"
    build_target "build:win"
    ;;
esac

echo ""
echo "Build complete. Check electron/dist/ for artifacts."
