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
    // seed is compiled by tsx, not tsc; los .cjs de operacion se ejecutan con
    // node a pelo). Without opting out of the type-aware project service,
    // eslint aborts with "was not found by the project service" and takes the
    // whole `turbo run lint` down with it. Se siguen lintando, pero sin tipos.
    files: ['**/prisma/seed.ts'],
    languageOptions: {
      parserOptions: { projectService: false, project: false },
    },
  },
  {
    // Scripts de operación en CommonJS (migraciones puntuales, restablecer la
    // contraseña del super admin). Se ejecutan con `node` a pelo dentro del
    // contenedor, así que usan require() y los globales de Node: sin declararlo
    // eslint los marcaba como 42 errores de 'require is not defined'.
    files: ['**/scripts/*.cjs', '**/*.local.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      parserOptions: { projectService: false, project: false },
      globals: { require: 'readonly', process: 'readonly', console: 'readonly', module: 'writable' },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  prettierConfig,
);
