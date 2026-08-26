import { parse as parseJsonc } from 'jsonc-parser';

const TAG_RE = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Derive the release.json the backend's deploy pipeline consumes from wrangler.jsonc. */
export function buildReleaseManifest(wranglerJsoncText, tag) {
  if (!TAG_RE.test(tag)) throw new Error(`tag must look like v1.2.3, got "${tag}"`);
  const errors = [];
  const cfg = parseJsonc(wranglerJsoncText, errors, { allowTrailingComma: true });
  if (errors.length || !cfg || typeof cfg !== 'object') throw new Error('wrangler.jsonc did not parse');
  if (typeof cfg.compatibility_date !== 'string') throw new Error('wrangler.jsonc has no compatibility_date');
  const assets = cfg.assets ?? {};
  return {
    schemaVersion: 1,
    tag,
    worker: { main: 'worker/dist/index.js', compatibilityDate: cfg.compatibility_date },
    assets: {
      directory: 'web/dist',
      notFoundHandling: assets.not_found_handling ?? 'single-page-application',
      runWorkerFirst: Array.isArray(assets.run_worker_first) ? assets.run_worker_first : [],
    },
    vars: Object.keys(cfg.vars ?? {}),
  };
}
