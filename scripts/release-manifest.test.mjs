import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReleaseManifest } from './release-manifest.mjs';

const WRANGLER = `{
  // comment that must not break parsing
  "name": "ecommerce-storefront",
  "main": "worker/src/index.ts",
  "compatibility_date": "2026-08-01",
  "assets": {
    "directory": "./web/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/media/*", "/healthz"]
  },
  "vars": { "BACKEND_URL": "http://localhost:3000/" },
}`;

test('builds the manifest from wrangler.jsonc', () => {
  const m = buildReleaseManifest(WRANGLER, 'v0.1.0');
  assert.deepEqual(m, {
    schemaVersion: 1,
    tag: 'v0.1.0',
    worker: { main: 'worker/dist/index.js', compatibilityDate: '2026-08-01' },
    assets: {
      directory: 'web/dist',
      notFoundHandling: 'single-page-application',
      runWorkerFirst: ['/api/*', '/media/*', '/healthz'],
    },
    vars: ['BACKEND_URL'],
  });
});

test('rejects a tag that is not v<semver>', () => {
  assert.throws(() => buildReleaseManifest(WRANGLER, 'main'), /tag/);
});

test('rejects wrangler config without compatibility_date', () => {
  assert.throws(() => buildReleaseManifest('{ "name": "x" }', 'v0.1.0'), /compatibility_date/);
});
