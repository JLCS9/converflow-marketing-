// @ts-check
/**
 * Web-only eslint config: the shared root rules plus the Next.js and
 * react-hooks plugins.
 *
 * Why this file exists: `next lint` picked up the ROOT flat config, which does
 * not register these two plugins. Every `// eslint-disable-next-line
 * @next/next/no-img-element` (or `react-hooks/exhaustive-deps`) in the codebase
 * then failed with "Definition for rule was not found", so `pnpm lint` exited 1
 * for the whole web app. Registering the plugins here makes those directives
 * resolve AND actually enforces the rules.
 */
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import rootConfig from '../../eslint.config.mjs';

export default [
  ...rootConfig,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
];
