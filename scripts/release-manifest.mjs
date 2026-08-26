import { parse as parseJsonc } from 'jsonc-parser';

const TAG_RE = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

// Top-level wrangler.jsonc keys the release manifest either consumes or is known to be safe to
// ignore. Anything else might be deploy-affecting (e.g. `routes`, `triggers`, `durable_objects`)
// and must not be silently dropped.
const SUPPORTED = new Set([
  '$schema',
  'name',
  'main',
  'compatibility_date',
  'compatibility_flags',
  'assets',
  'vars',
  'workers_dev',
  'preview_urls',
  'observability',
]);

// Sub-keys of `assets` the manifest either consumes or is known to be safe to ignore.
const SUPPORTED_ASSETS = new Set(['directory', 'binding', 'not_found_handling', 'html_handling', 'run_worker_first']);

function assertSupportedKeys(keys, supported, prefix) {
  const extra = keys.filter((k) => !supported.has(k));
  if (extra.length) {
    const named = prefix ? extra.map((k) => `${prefix}${k}`) : extra;
    throw new Error(`wrangler.jsonc key(s) the release manifest cannot express: ${named.join(', ')}`);
  }
}

/** Derive the release.json the backend's deploy pipeline consumes from wrangler.jsonc. */
export function buildReleaseManifest(wranglerJsoncText, tag) {
  if (!TAG_RE.test(tag)) throw new Error(`tag must look like v1.2.3, got "${tag}"`);
  const errors = [];
  const cfg = parseJsonc(wranglerJsoncText, errors, { allowTrailingComma: true });
  if (errors.length || cfg === undefined) throw new Error('wrangler.jsonc did not parse');
  if (cfg === null || Array.isArray(cfg) || typeof cfg !== 'object') {
    throw new Error('wrangler.jsonc did not parse to an object');
  }

  assertSupportedKeys(Object.keys(cfg), SUPPORTED, '');

  if (typeof cfg.name !== 'string') throw new Error('wrangler.jsonc has no name');
  if (typeof cfg.compatibility_date !== 'string') throw new Error('wrangler.jsonc has no compatibility_date');

  const assets = cfg.assets ?? {};
  assertSupportedKeys(Object.keys(assets), SUPPORTED_ASSETS, 'assets.');

  return {
    schemaVersion: 1,
    tag,
    worker: {
      main: 'worker/dist/index.js',
      name: cfg.name,
      compatibilityDate: cfg.compatibility_date,
      compatibilityFlags: Array.isArray(cfg.compatibility_flags) ? cfg.compatibility_flags : [],
    },
    assets: {
      directory: 'web/dist',
      binding: assets.binding ?? 'ASSETS',
      notFoundHandling: assets.not_found_handling ?? 'single-page-application',
      runWorkerFirst: Array.isArray(assets.run_worker_first) ? assets.run_worker_first : [],
    },
    vars: Object.keys(cfg.vars ?? {}),
  };
}
