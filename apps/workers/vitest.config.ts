import { defineConfig } from 'vitest/config';

// Same `.js` → `.ts` pre-resolver as the API: NodeNext ESM source imports carry
// an explicit .js extension that points at .ts files.
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
    env: {
      DATABASE_URL: 'postgresql://u:p@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      ENCRYPTION_KEY: '0'.repeat(64),
      API_INTERNAL_URL: 'http://localhost:4000',
      BOT_RUNNER_INTERNAL_TOKEN: 'test-internal-token-0123456789',
    },
  },
});
