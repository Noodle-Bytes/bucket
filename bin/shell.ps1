# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $ShellArgs
)

$ErrorActionPreference = "Stop"

if ($env:BUCKET_ROOT) {
    Write-Error "Bucket shell is already activated!"
    exit 1
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BucketRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path

function Test-Command($Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-LoggedCommand([string] $Command, [string[]] $Arguments, [string] $WorkingDirectory) {
    $RunningOnWindows = ($PSVersionTable.PSEdition -eq "Desktop") -or ($IsWindows -eq $true)
    if ($RunningOnWindows -and $Command -eq "npm") {
        $Command = "npm.cmd"
    }

    Push-Location $WorkingDirectory
    try {
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$Command $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

Set-Location $BucketRoot

Write-Host "# Checking Python environment is up-to-date"
if (-not (Test-Path ".venv") -or -not (Test-Path "uv.lock")) {
    if (-not (Test-Command "uv")) {
        Write-Error "uv is required to prepare the Bucket Python environment. Install uv and rerun .\bin\shell.ps1."
        exit 1
    }
    Invoke-LoggedCommand -Command "uv" -Arguments @("lock") -WorkingDirectory $BucketRoot
    Invoke-LoggedCommand -Command "uv" -Arguments @("sync", "--extra", "dev") -WorkingDirectory $BucketRoot
}

if (Test-Command "npm") {
    Invoke-LoggedCommand -Command "npm" -Arguments @("install", "--no-fund", "--no-audit") -WorkingDirectory (Join-Path $BucketRoot "viewer")
}
else {
    Write-Warning "NPM not installed - HTML writer will be disabled. See 'https://docs.npmjs.com/downloading-and-installing-node-js-and-npm'"
}

Write-Host "# Activating virtual environment"
$ActivateScript = Join-Path $BucketRoot ".venv\Scripts\Activate.ps1"
if (-not (Test-Path $ActivateScript)) {
    Write-Error "Could not find the virtual environment activation script: $ActivateScript"
    exit 1
}

& $ActivateScript
$env:BUCKET_ROOT = $BucketRoot
$env:VIRTUAL_ENV_DISABLE_PROMPT = "1"

Write-Host "# Setting up pre-commit hooks"
if (Test-Command "pre-commit") {
    pre-commit install *> $null
}
if (-not (Test-Command "pre-commit") -or $LASTEXITCODE -ne 0) {
    Write-Warning "pre-commit hook setup failed. The shell will still open."
}

$env:BUCKET_ROOT = $BucketRoot
$PromptPrefix = 'function global:prompt { "[BKT]:" + (Microsoft.PowerShell.Core\Get-Location) + "> " }'
$LaunchArgs = @("-NoExit", "-Command", $PromptPrefix)
if ($ShellArgs) {
    $LaunchArgs += $ShellArgs
}

if (Test-Command "pwsh") {
    & pwsh @LaunchArgs
}
else {
    & powershell @LaunchArgs
}
