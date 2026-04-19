# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

[CmdletBinding()]
param(
    [ValidateSet("host", "mac", "linux", "win", "all")]
    [string] $Target = "host"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")

node (Join-Path $ProjectRoot "electron\build.js") $Target
