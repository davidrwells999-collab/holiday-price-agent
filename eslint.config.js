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
                'node:dns',
                'node:dns/*',
                'node:http2',
                'node:dgram',
                'node:worker_threads',
                'fs',
                'fs/*',
                'http',
                'https',
                'net',
                'child_process',
                'dns',
                'dns/*',
                'http2',
                'dgram',
                'worker_threads',
                'undici',
                'posthog-node',
                '@posthog/*',
                '@anthropic-ai/*',
                '@mastra/*',
                '@opentelemetry/*',
                '**/db/**',
                '**/sellers/**',
                '**/telemetry/**',
              ],
              message: 'src/pricing must stay pure: no IO imports',
            },
          ],
        },
      ],
      // Pricing must be deterministic: take the clock/date as input, never read ambient state.
      'no-restricted-globals': [
        'error',
        ...['fetch', 'process', 'setTimeout', 'setInterval'].map((name) => ({
          name,
          message: 'src/pricing must stay pure: no ambient IO, env or timers',
        })),
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Date',
          property: 'now',
          message: 'src/pricing must take a clock or date as input',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'src/pricing must take a clock or date as input; do not call new Date()',
        },
      ],
    },
  },
  prettier,
);
