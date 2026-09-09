# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
#
# bash rc for ./bin/shell, used when bash is the user's shell (the Linux
# default). Environment setup lives in bin/setup-env.sh.

# Load the user's own rc first so their PATH, aliases and prompt survive.
if [ -f "$HOME/.bashrc" ]; then
    . "$HOME/.bashrc"
fi

# Custom prompt to make it clear this is the Bucket environment
PS1="[BKT]:$PS1"

. "$BUCKET_ROOT/bin/setup-env.sh"
