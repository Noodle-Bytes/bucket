# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

# Jump to BUCKET_ROOT
cd "$BUCKET_ROOT" || return

# Custom prompt to make it clear this is the Bucket environment
PS1="[BKT]:$PS1"

# Inherit the user history location
export HISTFILE="$USER_HISTFILE"

# Ensure uv environment is installed
echo "# Checking Python environment is up-to-date"
if ! command -v uv > /dev/null 2>&1; then
    echo "uv is required to prepare the Bucket Python environment."
    echo "Install uv and rerun ./bin/shell: https://docs.astral.sh/uv/getting-started/installation/"
    return 1
fi

if [ ! -d ".venv" ] || [ ! -f "uv.lock" ]; then
    uv lock
    uv sync --extra dev
fi

# Ensure web environment is installed
if npm -v > /dev/null 2>&1; then
    cd "$BUCKET_ROOT/viewer" || return
    npm install --no-fund --no-audit
    cd "$BUCKET_ROOT" || return
else
    echo "NPM not installed - HTML writer will be disabled. See 'https://docs.npmjs.com/downloading-and-installing-node-js-and-npm'"
fi

# Activate the uv virtual environment
echo "# Activating virtual environment"
export VIRTUAL_ENV_DISABLE_PROMPT=1
if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
elif [ -f ".venv/Scripts/activate" ]; then
    source .venv/Scripts/activate
else
    echo "Could not find the virtual environment activation script."
fi

# Install pre-commit
echo "# Setting up pre-commit hooks"
pre-commit install > /dev/null
