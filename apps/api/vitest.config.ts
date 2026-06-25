import { defineConfig } from 'vitest/config';

// The API uses NodeNext ESM, so source imports carry an explicit `.js` extension
// that points at `.ts` files. This pre-resolver rewrites those to `.ts` so vitest
// (Vite) can load the real sources during tests.
export default defineConfig({
  plugins: [
    {
      name: 'js-to-ts-resolver',
      enforce: 'pre',
      async resolveId(source, importer) {
        if (importer && source.startsWith('.') && source.endsWith('.js')) {
          const resolved = await this.resolve(source.replace(/\.js$/, '.ts'), importer, {
            skipSelf: true,
          });
          if (resolved) return resolved;
        }
        return null;
      },
    },
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // Dummy values so modules that validate env at import time (config/env.ts via
    // crypto.ts) load under test. No real services are contacted.
    env: {
      DATABASE_URL: 'postgresql://u:p@localhost:5432/test',
      DATABASE_DIRECT_URL: 'postgresql://u:p@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      AUTH_SECRET: 'test-auth-secret-0123456789abcdef',
      ENCRYPTION_KEY: '0'.repeat(64),
    },
  },
});
