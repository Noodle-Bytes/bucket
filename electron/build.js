#!/usr/bin/env node
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

const { spawnSync } = require('child_process');
const os = require('os');
const path = require('path');

const scriptDir = __dirname;
const projectRoot = path.resolve(scriptDir, '..');
let target = process.argv[2] || 'host';

function usage() {
  console.error('Usage: build_electron_app [host|mac|linux|win|all]');
}

function resolveHostTarget() {
  switch (os.platform()) {
    case 'darwin':
      return 'mac';
    case 'linux':
      return 'linux';
    case 'win32':
      return 'win';
    default:
      return '';
  }
}

function run(command, args, cwd, extraEnv = {}) {
  let executable = command;
  let executableArgs = args;

  if (process.platform === 'win32' && command === 'npm') {
    executable = process.env.ComSpec || 'cmd.exe';
    executableArgs = ['/d', '/s', '/c', 'npm', ...args];
  }

  const result = spawnSync(executable, executableArgs, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    console.error(`Failed to run ${executable}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function ensureNodeModules(dir, label) {
  if (!require('fs').existsSync(path.join(dir, 'node_modules'))) {
    console.log(`Installing ${label} dependencies...`);
    run('npm', ['ci'], dir);
  }
}

if (target === 'host') {
  target = resolveHostTarget();
  if (!target) {
    console.error('Error: unsupported host platform for auto target selection.');
    console.error('Use one of: mac, linux, win, all');
    process.exit(1);
  }
}

if (!['mac', 'linux', 'win', 'all'].includes(target)) {
  usage();
  process.exit(1);
}

console.log(`Building Bucket Electron app (target: ${target})...`);
console.log('');

console.log('Step 1: Building viewer...');
ensureNodeModules(path.join(projectRoot, 'viewer'), 'viewer');
run('npm', ['run', 'build'], path.join(projectRoot, 'viewer'), {
  BUCKET_ELECTRON_BUILD: '1',
});
console.log('Viewer built successfully.');
console.log('');

console.log('Step 2: Building Electron app...');
ensureNodeModules(scriptDir, 'Electron');

function buildTarget(script) {
  console.log(`Running npm run ${script}...`);
  run('npm', ['run', script], scriptDir);
}

switch (target) {
  case 'mac':
    buildTarget('build:mac');
    break;
  case 'linux':
    buildTarget('build:linux');
    break;
  case 'win':
    buildTarget('build:win');
    break;
  case 'all':
    console.log('Note: building all targets usually requires CI/extra host tooling.');
    buildTarget('build:mac');
    buildTarget('build:linux');
    buildTarget('build:win');
    break;
}

console.log('');
console.log('Build complete. Check electron/dist/ for artifacts.');
