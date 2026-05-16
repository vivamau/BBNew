import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      '@bbnew/shared': resolve(root, 'packages/shared/src/index.ts'),
      '@bbnew/voprf': resolve(root, 'packages/voprf/src/index.ts'),
      '@bbnew/ledger': resolve(root, 'packages/ledger/src/index.ts'),
      '@bbnew/member': resolve(root, 'packages/member/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/test/**/*.test.ts', 'apps/**/test/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
