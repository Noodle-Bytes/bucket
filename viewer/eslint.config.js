/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
 */

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

// See: https://github.com/alan2207/bulletproof-react/blob/master/.eslintrc.js
export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
      ecmaVersion: 2020,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Disable rules that are new in typescript-eslint v8 (not in the old config)
      '@typescript-eslint/no-wrapper-object-types': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      // Disable rule that is new in react-hooks v7
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: ['@/features/*/*'],
        },
      ],
      // Leading underscore marks an intentionally unused parameter/variable.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Build scripts and Vite configs run under Node, not the browser.
    files: ['scripts/**', '*.config.{js,ts,mjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // The routes layer wires features together and may reach into a
    // feature's lib/ for the shared tree model; features themselves must not
    // import each other's internals.
    files: ['src/routes/**'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // lib/ modules deliberately export pure helpers alongside components so
    // the helpers can be unit tested; they are not route entry points, so
    // losing fast-refresh for them is acceptable.
    files: ['src/**/lib/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
);
