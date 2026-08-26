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
