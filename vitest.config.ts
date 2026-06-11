import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Unit + integration tests live side by side. Integration specs
    // use the .integration.spec.ts suffix and skip themselves when
    // DATABASE_URL is absent (see test/integration/harness.ts).
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    // HTTP e2e specs boot the full Nest app and need decorator metadata; they
    // run under vitest.e2e.config.ts (unplugin-swc), not this esbuild suite.
    exclude: ['test/e2e/**', 'node_modules/**', 'dist/**'],
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
