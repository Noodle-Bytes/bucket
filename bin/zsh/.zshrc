# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2024 Vypercore. All Rights Reserved

# Jump to BUCKET_ROOT
cd $BUCKET_ROOT

# Custom prompt to make it clear this is the hardware environment
PROMPT="[BKT]:$PROMPT"

# Inherit the user history location
export HISTFILE=$USER_HISTFILE

# Incrementally append to history file
setopt INC_APPEND_HISTORY

# Ensure uv environment is installed
echo "# Checking Python environment is up-to-date"
if [ ! -d ".venv" ] || [ ! -f "uv.lock" ]; then
    uv lock
    uv sync --extra dev
fi

# Ensure web environment is installed
if npm -v >& /dev/null; then
    cd $BUCKET_ROOT/viewer;
    npm install --no-fund --no-audit;
    cd $BUCKET_ROOT
else
    echo "NPM not installed - HTML writer will be disabled. See 'https://docs.npmjs.com/downloading-and-installing-node-js-and-npm'"
fi

# Activate the uv virtual environment
echo "# Activating virtual environment"
export VIRTUAL_ENV_DISABLE_PROMPT=1
source .venv/bin/activate

# Install pre-commit
echo "# Setting up pre-commit hooks"
pre-commit install > /dev/null
