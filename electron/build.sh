#!/bin/bash
# Build script for Bucket Mac App
# This script builds the viewer and then the Electron app

set -e

# Get the absolute path of the script's directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Building Bucket Mac App..."
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
npm run build:mac
echo ""
echo "Build complete! Check the dist/ directory for the .app bundle."
