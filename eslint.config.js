import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.claude/**',
      'dist',
      'coverage',
      'artifacts',
      'drizzle',
      '.planning',
      'evals/fixtures',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-console': ['error', { allow: ['error'] }],
    },
  },
  {
    files: ['src/pricing/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'pg',
                'drizzle-orm',
                'drizzle-orm/*',
                'playwright',
                'pino',
                'node:fs',
                'node:fs/*',
                'node:http',
                'node:https',
                'node:net',
                'node:child_process',
                '**/db/**',
                '**/sellers/**',
                '**/telemetry/**',
              ],
              message: 'src/pricing must stay pure: no IO imports',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
