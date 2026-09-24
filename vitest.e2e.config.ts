import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Separate config for HTTP end-to-end tests that boot the full Nest app.
 *
 * NestJS DI relies on `emitDecoratorMetadata`, which the default esbuild
 * transform (used by vitest.config.ts for the fast unit suite) does NOT emit —
 * so booting AppModule there fails to resolve constructor params. unplugin-swc
 * compiles the TS with decorator metadata, exactly like `nest build` (tsc) does
 * in production. Kept isolated so the unit suite is untouched.
 *
 *   npm run test:e2e
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/e2e/**/*.e2e-spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // These suites run with no external services. ConfigModule loads .env,
    // which fills in any variable that is *unset* — and a local .env points
    // at the production database and holds live LLM and email keys. Set them
    // empty so it can't: an empty URL means in-memory storage, an empty key
    // means that provider is off.
    env: {
      DATABASE_URL: '',
      REDIS_URL: '',
      AGENTIC_PROVIDER: '',
      OPENAI_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      GEMINI_API_KEY: '',
      RESEND_API_KEY: '',
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
