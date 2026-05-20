import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-plugin-prettier';

/**
 * PHI-free-logger enforcement (NFR-027/028/029).
 *
 * - `console.*` is banned everywhere in `src/` — there is no
 *   legitimate use of unstructured stdout in production code, and
 *   the wrapper offers debug/trace levels for everything else.
 * - `pino` is only importable from inside the phi-free-logger module;
 *   every other service must depend on the wrapper, not on pino
 *   directly, so the allow-list/identifier-hashing checks cannot be
 *   bypassed.
 * - `@nestjs/common`'s `Logger` is left alone (boot/lifecycle messages
 *   use it) but the structured-log path goes through PhiFreeLogger.
 */
const PHI_LOGGER_RULES = {
  'no-console': 'error',
  'no-restricted-imports': [
    'error',
    {
      paths: [
        {
          name: 'pino',
          message:
            'Import PhiFreeLogger from common/phi-free-logger instead of pino directly. ' +
            'Only the wrapper itself may depend on pino (NFR-027).',
        },
      ],
    },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector:
        "MemberExpression[object.object.name='process'][object.property.name=/^(stdout|stderr)$/][property.name='write']",
      message:
        'process.stdout.write / process.stderr.write are forbidden. ' +
        'Use PhiFreeLogger so identifier-hashing and the field allow-list apply (NFR-027).',
    },
  ],
};

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'prettier/prettier': 'warn',
    },
  },
  {
    // PHI-free-logger discipline applies to all production source.
    files: ['src/**/*.ts'],
    rules: PHI_LOGGER_RULES,
  },
  {
    // The wrapper itself, audit scripts, and tests are exempt.
    files: [
      'src/common/phi-free-logger/**/*.ts',
      'scripts/**/*.ts',
      'test/**/*.ts',
      '**/*.spec.ts',
    ],
    rules: {
      'no-console': 'off',
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
    },
  },
];
