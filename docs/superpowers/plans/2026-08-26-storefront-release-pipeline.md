# Storefront Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a `v*` tag on `Kratos-Bots/public-storefront` produce a GitHub Release whose zip the backend can deploy to Cloudflare without `wrangler` (pre-bundled Worker + `release.json` manifest), and cut a real `v0.1.0`.

**Architecture:** CI bundles the Worker with `wrangler deploy --dry-run --outdir`, a small Node script derives `release.json` from `wrangler.jsonc`, and the zip is attached with the preinstalled `gh` CLI (no third-party action — that is what currently fails at workflow startup).

**Tech Stack:** GitHub Actions, wrangler 4, Node 22 (`node --test` for the script's tests), `jsonc-parser`.

**Spec:** `docs/superpowers/specs/2026-08-26-storefront-admin-editor-and-deploy-design.md` §1.

## Global Constraints

- Repo: `T:\Projects\ecommerce\ecommerce-storefront` (remote `origin` = `git@github.com:Kratos-Bots/public-storefront.git`, branch `main`). Run all `npm` commands from this directory.
- `package.json` is `"type": "module"` — scripts are `.mjs`/ESM.
- Zip layout is fixed by the spec: `release.json`, `worker/dist/index.js`, `web/dist/**`. `release.json.schemaVersion` is `1`.
- Worker name, compatibility date and assets config come from `wrangler.jsonc` — never hardcode them in the script.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_017mSv2DDn5QZPBHwUF4bkKc`.

---

### Task 1: `release.json` manifest script

**Files:**
- Create: `scripts/release-manifest.mjs` (pure function)
- Create: `scripts/write-release-manifest.mjs` (CLI)
- Create: `scripts/release-manifest.test.mjs`
- Modify: `package.json` (devDependency `jsonc-parser`, `test:scripts` script, extend `test`)
- Modify: `.gitignore` (add `worker/dist/` and `release.json`)

**Interfaces:**
- Produces: `buildReleaseManifest(wranglerJsoncText: string, tag: string): ReleaseManifest` where
  ```ts
  type ReleaseManifest = {
    schemaVersion: 1;
    tag: string;
    worker: { main: 'worker/dist/index.js'; compatibilityDate: string };
    assets: { directory: 'web/dist'; notFoundHandling: string; runWorkerFirst: string[] };
    vars: string[];
  };
  ```
  The backend plan's `release.json` parser consumes exactly this shape.

- [ ] **Step 1: Install `jsonc-parser` and add the test script**

Run: `npm install --save-dev jsonc-parser@^3.3.1`

Edit `package.json` scripts — replace the `test` line and add `test:scripts`:

```json
    "test": "npm --prefix web test && vitest run --config worker/vitest.config.ts && npm run test:scripts",
    "test:scripts": "node --test scripts/",
```

- [ ] **Step 2: Write the failing test**

`scripts/release-manifest.test.mjs`:

```js
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:scripts`
Expected: FAIL — `Cannot find module './release-manifest.mjs'`.

- [ ] **Step 4: Implement the pure function**

`scripts/release-manifest.mjs`:

```js
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
```

`scripts/write-release-manifest.mjs`:

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { buildReleaseManifest } from './release-manifest.mjs';

const tag = process.argv[2];
if (!tag) {
  console.error('usage: node scripts/write-release-manifest.mjs <tag>');
  process.exit(2);
}
const manifest = buildReleaseManifest(readFileSync('wrangler.jsonc', 'utf8'), tag);
writeFileSync('release.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`release.json written for ${tag}`);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:scripts`
Expected: 3 passing.

Also run: `node scripts/write-release-manifest.mjs v0.0.0-test && cat release.json && rm release.json`
Expected: JSON with `"compatibilityDate": "2026-08-01"` and `"runWorkerFirst": ["/api/*","/media/*","/healthz"]`.

- [ ] **Step 6: Ignore build outputs**

Append to `.gitignore`:

```
worker/dist/
release.json
```

- [ ] **Step 7: Commit**

```bash
git add scripts/ package.json package-lock.json .gitignore
git commit -m "build: release.json manifest script derived from wrangler.jsonc"
```

---

### Task 2: Rewrite `release.yml`

**Files:**
- Modify: `.github/workflows/release.yml` (replace whole file)

**Interfaces:**
- Consumes: `scripts/write-release-manifest.mjs <tag>` from Task 1.
- Produces: a GitHub Release named `<tag>` with one asset `storefront-<tag>.zip` containing `release.json`, `worker/dist/index.js`, `web/dist/**`. The backend's `GET /releases` filters on exactly this asset name pattern.

- [ ] **Step 1: Replace the workflow**

`.github/workflows/release.yml`:

```yaml
name: release
on:
  push:
    tags: ['v*']
jobs:
  build:
    runs-on: ubuntu-latest
    permissions: { contents: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm --prefix web ci
      - run: npm test
      - run: npm run build
      - name: Bundle worker
        run: npx wrangler deploy --dry-run --outdir=worker/dist
      - name: Write release manifest
        run: node scripts/write-release-manifest.mjs "$GITHUB_REF_NAME"
      - name: Package
        run: |
          mkdir -p out
          zip -r "out/storefront-${GITHUB_REF_NAME}.zip" release.json worker/dist/index.js web/dist
          unzip -l "out/storefront-${GITHUB_REF_NAME}.zip" | head -20
      - name: Publish release
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh release create "$GITHUB_REF_NAME" out/*.zip --title "$GITHUB_REF_NAME" --generate-notes
```

Notes for the implementer: `npm test` here is vitest only (web + worker + scripts) — no Playwright browsers needed. `wrangler deploy --dry-run` needs `web/dist` to exist, hence it runs after `npm run build`. Only `index.js` is zipped from `worker/dist` (not the source map or README wrangler also writes).

- [ ] **Step 2: Validate locally what can be validated**

Run: `npm run build && npx wrangler deploy --dry-run --outdir=worker/dist && node scripts/write-release-manifest.mjs v0.0.0-test && ls worker/dist web/dist release.json && rm -rf worker/dist release.json`
Expected: `index.js` in `worker/dist`, `index.html` in `web/dist`, `release.json` present; then cleaned up.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: publish releases with gh; ship pre-bundled worker + release.json"
```

---

### Task 3: README

**Files:**
- Modify: `README.md` — the "Prerequisites" intro line, the "Manual deploy" section, and the "Release process" section.

- [ ] **Step 1: Update the prerequisites note**

In the `## Prerequisites — settings to configure in the admin first` table, change the `storefront_features / storefront_theme / storefront_brand` row's description to:

```
Feature flags, colours/fonts/layout, and logo/title/description. Editable in the admin under Storefront → Appearance / Features (Spec 2); also settable via `PUT /api/v1/storefront-settings`.
```

and the intro sentence of that section from "All of the following are backend admin settings, not anything in this repo:" to "All of the following are backend admin settings (Storefront page in the admin SPA), not anything in this repo:".

- [ ] **Step 2: Replace the "Manual deploy" and "Release process" sections**

Replace everything from `## Manual deploy` to the end of the file with:

````markdown
## Deploying

The supported path is **deploy from the admin**: a store owner connects their Cloudflare account
on the admin's Storefront → Deploy tab, picks a hostname on one of their zones, and deploys any
published release listed there. The backend downloads the release zip, uploads the Worker and its
assets to their account, attaches the custom domain and health-checks `/healthz`. Nothing in this
repo runs during that deploy — it only consumes the release artifact described below.

Manual deploy (maintainers only, e.g. for a preview account):

```bash
npm run deploy   # npm run build && wrangler deploy
```

`wrangler.jsonc` has no route/custom domain committed; add a `routes` entry to a local copy (or pass
`--route`) first. **Deploy order matters**: the Worker has zero functionality without the backend's
storefront surface already live and configured (see Prerequisites above).

## Release process

Pushing a tag matching `v*` runs `.github/workflows/release.yml`:

1. `npm ci` (root, then `web/`) → `npm test` → `npm run build`
2. `npx wrangler deploy --dry-run --outdir=worker/dist` — bundles the Worker to `worker/dist/index.js`
   without deploying
3. `node scripts/write-release-manifest.mjs <tag>` — writes `release.json` from `wrangler.jsonc`
   (`schemaVersion`, `tag`, worker `compatibilityDate`, assets `notFoundHandling` /
   `runWorkerFirst`, and the list of `vars` the deployer must supply — currently `BACKEND_URL`)
4. zips `release.json`, `worker/dist/index.js`, `web/dist/**` as `storefront-<tag>.zip`
5. `gh release create <tag> --generate-notes` attaches it to a GitHub Release

To cut a release:

```bash
npm version minor            # or patch — bumps package.json, commits, tags v0.x.0
git push origin main --follow-tags
```

The backend's Storefront → Deploy tab lists these releases within five minutes and shows an
"Update available" badge on stores running an older tag.
````

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: deploy-from-admin and the release artifact layout"
```

---

### Task 4: Push, re-tag `v0.1.0`, verify the release

**Files:** none (git + GitHub only).

- [ ] **Step 1: Push `main`**

Run: `git push origin main`

- [ ] **Step 2: Move the tag to the new HEAD and push it**

The previous `v0.1.0` never produced a release, so moving it is safe.

```bash
git tag -f v0.1.0
git push origin v0.1.0 --force
```

- [ ] **Step 3: Watch the run**

Run (repeat until `status` is `completed`, ~2–3 min):

```bash
curl -s "https://api.github.com/repos/Kratos-Bots/public-storefront/actions/runs?per_page=1" | grep -E '"status"|"conclusion"|"html_url"' | head -3
```

Expected: `"conclusion": "success"`. If it is `startup_failure` again, open the run URL — the page shows the validation message; report it verbatim rather than guessing.

- [ ] **Step 4: Verify the artifact**

```bash
curl -s https://api.github.com/repos/Kratos-Bots/public-storefront/releases/latest | grep -E '"tag_name"|"browser_download_url"'
curl -sL -o /tmp/storefront-v0.1.0.zip "$(curl -s https://api.github.com/repos/Kratos-Bots/public-storefront/releases/latest | grep -oE 'https://[^"]+storefront-v0\.1\.0\.zip')"
unzip -l /tmp/storefront-v0.1.0.zip | grep -E 'release.json|worker/dist/index.js|web/dist/index.html'
unzip -p /tmp/storefront-v0.1.0.zip release.json
```

Expected: all three paths listed; `release.json` shows `"tag": "v0.1.0"` and `"compatibilityDate": "2026-08-01"`.

No commit — this task is verification.

---

## Self-review

- Spec §1.1 (cause) → Task 2 removes the third-party action. §1.2 workflow → Task 2 verbatim. §1.3 manifest → Task 1 (same JSON shape, `vars` derived from `wrangler.jsonc`). §1.4 re-release + README → Tasks 3–4.
- Type consistency: `buildReleaseManifest` output fields match the spec's `release.json` example key-for-key (`schemaVersion`, `tag`, `worker.main`, `worker.compatibilityDate`, `assets.directory`, `assets.notFoundHandling`, `assets.runWorkerFirst`, `vars`). The backend plan must parse exactly these names.
- No placeholders.
