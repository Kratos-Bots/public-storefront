import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// NOTE: brief specified `defineWorkersConfig` from
// '@cloudflare/vitest-pool-workers/config' + `test.poolOptions.workers`, but
// the installed 0.22.0 package removed that subpath and the poolOptions
// nesting in favour of a `cloudflareTest()` Vite plugin (Vitest 4's
// plugin-based pool API), whose `wrangler.configPath` resolves relative to
// process.cwd() rather than this file's directory. Adapted accordingly, using
// an import.meta.url-relative path so it works regardless of invocation cwd.
// See task-7-report.md.
export default defineConfig({
  test: {
    include: ['worker/test/**/*.test.ts'],
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)) },
      miniflare: { bindings: { BACKEND_URL: 'https://backend.test/' } },
    }),
  ],
});
