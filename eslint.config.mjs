// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/build/**',
      '**/src/generated/**',
      '**/*.config.{js,mjs,cjs}',
      '**/*.config.ts',
      // Local-only scripts, deliberately outside every tsconfig.
      '**/*.local.ts',
      // Generado por Next en cada build y marcado como "do not edit": su
      // contenido cambia con la versión de Next, así que lintarlo solo produce
      // fallos que no se pueden arreglar.
      '**/next-env.d.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    // Scripts that live outside any package's tsconfig `include` (the Prisma
    // seed is compiled by tsx, not tsc). Without opting out of the type-aware
    // project service, eslint aborts with "was not found by the project
    // service" and takes the whole `turbo run lint` down with it.
    files: ['**/prisma/seed.ts'],
    languageOptions: {
      parserOptions: { projectService: false, project: false },
    },
  },
  prettierConfig,
);
