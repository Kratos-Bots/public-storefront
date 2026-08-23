import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/** The repo root — the suite starts Vite itself, from there. */
const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * Mocked end-to-end run: Vite on a spare port, no Worker and no backend. Every
 * `/api/*` and `/media/*` call is answered by `page.route` (see `mocks.ts`), and
 * the Cloudflare challenge script is served from a local shim, so the suite is
 * hermetic and safe to run against nothing.
 */
export default defineConfig({
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  outputDir: fileURLToPath(new URL('./test-results', import.meta.url)),
  fullyParallel: true,
  workers: 2,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'retain-on-failure',
    // Screenshots are taken deliberately, per scenario, into e2e/screenshots.
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: 'npm --prefix web run dev -- --port 5199 --strictPort',
    cwd: root,
    url: 'http://localhost:5199',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
