import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environmentMatchGlobs: [
      ['src/p2p/**', 'jsdom'],
      ['src/crypto/**', 'node'],
    ],
  },
});
