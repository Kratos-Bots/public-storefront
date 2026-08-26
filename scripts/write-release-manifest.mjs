#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { buildReleaseManifest } from './release-manifest.mjs';

const tag = process.argv[2];
if (!tag) {
  console.error('usage: node scripts/write-release-manifest.mjs <tag>');
  process.exit(2);
}

const root = new URL('../', import.meta.url);

try {
  const manifest = buildReleaseManifest(readFileSync(new URL('wrangler.jsonc', root), 'utf8'), tag);
  writeFileSync(new URL('release.json', root), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`release.json written for ${tag}`);
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exit(1);
}
