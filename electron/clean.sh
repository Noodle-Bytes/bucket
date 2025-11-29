#!/bin/bash
# Clean script for Bucket Electron app
# Removes all built artifacts and temporary files
#
# Usage:
#   ./clean.sh              - Remove built artifacts only
#   ./clean.sh --node-modules  - Remove built artifacts and node_modules directory
#   ./clean.sh -n           - Same as --node-modules (short form)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Check for --node-modules or -n flag
REMOVE_NODE_MODULES=false
if [[ "$1" == "--node-modules" || "$1" == "-n" ]]; then
    REMOVE_NODE_MODULES=true
fi

echo "Cleaning Electron build artifacts..."
echo ""

# Remove dist directory (contains built DMG files and app bundles)
if [ -d "$SCRIPT_DIR/dist" ]; then
    echo "Removing dist/ directory..."
    rm -rf "$SCRIPT_DIR/dist"
    echo "✓ Removed dist/"
else
    echo "✓ No dist/ directory found"
fi

# Remove any temporary HTML files in viewer/dist
if [ -f "../viewer/dist/index-electron.html" ]; then
    echo "Removing temporary HTML file..."
    rm -f "../viewer/dist/index-electron.html"
    echo "✓ Removed temporary HTML file"
fi

# Optionally remove node_modules if flag is set
if [ "$REMOVE_NODE_MODULES" = true ]; then
    if [ -d "$SCRIPT_DIR/node_modules" ]; then
        echo "Removing node_modules/ directory..."
        rm -rf "$SCRIPT_DIR/node_modules"
        echo "✓ Removed node_modules/"
    else
        echo "✓ No node_modules/ directory found"
    fi
fi

echo ""
echo "Clean complete!"
echo ""
if [ "$REMOVE_NODE_MODULES" = true ]; then
    echo "Note: node_modules was removed. Run ./build.sh to reinstall dependencies and rebuild."
else
    echo "To rebuild the app, run: ./build.sh"
    echo "To also remove node_modules, run: ./clean.sh --node-modules"
fi
