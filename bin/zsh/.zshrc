# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
#
# zsh rc for ./bin/shell. Environment setup lives in bin/setup-env.sh.

# Custom prompt to make it clear this is the Bucket environment
PROMPT="[BKT]:$PROMPT"

# Inherit the user history location (ZDOTDIR would otherwise relocate it)
export HISTFILE=$USER_HISTFILE

# Incrementally append to history file
setopt INC_APPEND_HISTORY

source "$BUCKET_ROOT/bin/setup-env.sh"
