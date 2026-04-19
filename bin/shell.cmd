@echo off
rem SPDX-License-Identifier: MIT
rem Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0shell.ps1" %*
