import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

// `eslint-config-next` (as of 15.5.18) still ships in the legacy `.eslintrc`
// format with `extends:`, so we run it through FlatCompat to wire it into
// ESLint 9's flat config. Once Next ships a native flat config we can drop
// FlatCompat and import the configs directly.
const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)
const compat     = new FlatCompat({ baseDirectory: __dirname })

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      '.review/**',
      // Parallel-agent workspaces — each is a full repo checkout from a
      // sibling branch. Local `npm run lint` was reporting ~50k issues from
      // stale code in these dirs; CI runs from a clean checkout that doesn't
      // have them at all, so the noise was purely a local-dev annoyance.
      '.claude/worktrees/**',
    ],
  },
  {
    // Plain JS config / script files use CommonJS — disable the TS-only
    // require-imports rule there. next.config.js + scripts/*.js qualify.
    files: ['**/*.js', '**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Allow the underscore-prefix convention for intentionally unused params
    // (e.g. method handlers with unused `_req`, callbacks with unused `_event`).
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
]

export default eslintConfig
