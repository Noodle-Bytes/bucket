#!/bin/bash
# Build script for Bucket Mac App
# This script builds the viewer and then the Electron app

set -e

# Get the absolute path of the script's directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Building Bucket Mac App..."
echo ""

# Versions come from git tags, not package.json (which holds a 0.0.0
# placeholder). Resolve once and use it for both the viewer bundle
# (__APP_VERSION__) and the packaged app metadata.
if [ -z "${BUCKET_VERSION:-}" ]; then
    BUCKET_VERSION="$(node "$PROJECT_ROOT/viewer/scripts/resolve-version.mjs")"
fi
export BUCKET_VERSION
echo "Version: $BUCKET_VERSION"
echo ""

# Build the viewer first
echo "Step 1: Building viewer..."
cd "$PROJECT_ROOT/viewer"
if [ ! -d "node_modules" ]; then
    echo "Installing viewer dependencies..."
    npm install
fi
npm run build
echo "Viewer built successfully!"
echo ""

# Build the Electron app
echo "Step 2: Building Electron app..."
cd "$SCRIPT_DIR"
if [ ! -d "node_modules" ]; then
    echo "Installing Electron dependencies..."
    npm install
fi
npm run build:mac -- --config.extraMetadata.version="$BUCKET_VERSION"
echo ""
echo "Build complete! Check the dist/ directory for the .app bundle."
