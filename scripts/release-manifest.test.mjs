import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
    worker: {
      main: 'worker/dist/index.js',
      name: 'ecommerce-storefront',
      compatibilityDate: '2026-08-01',
      compatibilityFlags: [],
    },
    assets: {
      directory: 'web/dist',
      binding: 'ASSETS',
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

test('rejects an unknown top-level wrangler.jsonc key', () => {
  const withExtra = `{
    "name": "ecommerce-storefront",
    "compatibility_date": "2026-08-01",
    "routes": ["shop.example.com/*"]
  }`;
  assert.throws(() => buildReleaseManifest(withExtra, 'v0.1.0'), /routes/);
});

test('rejects an unknown assets sub-key', () => {
  const withExtra = `{
    "name": "ecommerce-storefront",
    "compatibility_date": "2026-08-01",
    "assets": { "directory": "./web/dist", "experimental_thing": true }
  }`;
  assert.throws(() => buildReleaseManifest(withExtra, 'v0.1.0'), /assets\.experimental_thing/);
});

test('carries compatibility_flags into worker.compatibilityFlags', () => {
  const withFlags = `{
    "name": "ecommerce-storefront",
    "compatibility_date": "2026-08-01",
    "compatibility_flags": ["nodejs_compat"]
  }`;
  const m = buildReleaseManifest(withFlags, 'v0.1.0');
  assert.deepEqual(m.worker.compatibilityFlags, ['nodejs_compat']);
});

test('rejects a non-object top-level wrangler.jsonc (e.g. an array)', () => {
  assert.throws(() => buildReleaseManifest('[1, 2, 3]', 'v0.1.0'), /did not parse to an object/);
});

// F4: pin the real wrangler.jsonc so a schema drift there is caught here, not just in prod.
test('builds the manifest from the real wrangler.jsonc', () => {
  const text = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const m = buildReleaseManifest(text, 'v0.0.0');
  assert.match(m.worker.compatibilityDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(m.vars, ['BACKEND_URL']);
  assert.ok(m.assets.runWorkerFirst.includes('/healthz'));
  assert.equal(m.assets.binding, 'ASSETS');
  assert.equal(m.assets.notFoundHandling, 'single-page-application');
  assert.equal(m.worker.name, 'ecommerce-storefront');
});
