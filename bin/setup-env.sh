# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
#
# Shared Bucket shell setup, sourced by bin/zsh/.zshrc and bin/bash/.bashrc.
# Written for POSIX sh so both shells can source it. Expects BUCKET_ROOT.

cd "$BUCKET_ROOT" || return 1

if ! command -v uv >/dev/null 2>&1; then
    printf '[\033[0;31mERROR\033[0m] uv is not installed. See https://docs.astral.sh/uv/getting-started/installation/\n' >&2
    return 1
fi

# Ensure uv environment is installed
echo "# Checking Python environment is up-to-date"
if [ ! -d ".venv" ] || [ ! -f "uv.lock" ]; then
    uv lock
    uv sync --extra dev
fi
uv pip install -e . --quiet

# Ensure web environment is installed
if command -v npm >/dev/null 2>&1; then
    (cd "$BUCKET_ROOT/viewer" && npm install --no-fund --no-audit)
else
    echo "NPM not installed - HTML writer will be disabled. See 'https://docs.npmjs.com/downloading-and-installing-node-js-and-npm'"
fi

# Activate the uv virtual environment
echo "# Activating virtual environment"
export VIRTUAL_ENV_DISABLE_PROMPT=1
. "$BUCKET_ROOT/.venv/bin/activate"

# Install pre-commit
echo "# Setting up pre-commit hooks"
pre-commit install > /dev/null
