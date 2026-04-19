@echo off
rem SPDX-License-Identifier: MIT
rem Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."

node "%PROJECT_ROOT%\electron\build.js" %*
