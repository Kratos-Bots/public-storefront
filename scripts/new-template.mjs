#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RESERVED_DIRS, TEMPLATE_ID_RE as ID_RE } from './template-rules.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const RESERVED = new Set(RESERVED_DIRS);

const titleCase = (id) => id.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export function newTemplate(id, { templatesDir = path.join(ROOT, 'web/src/templates'), starterDir = path.join(ROOT, 'scripts/template-starter') } = {}) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error(`template id must match ${ID_RE}`);
  if (RESERVED.has(id)) throw new Error(`"${id}" is a reserved folder name`);
  const target = path.join(templatesDir, id);
  if (existsSync(target)) throw new Error(`${path.relative(ROOT, target) || target} already exists`);
  mkdirSync(target, { recursive: true });
  for (const file of readdirSync(starterDir)) {
    const body = readFileSync(path.join(starterDir, file), 'utf8').replaceAll('__ID__', id).replaceAll('__NAME__', titleCase(id));
    writeFileSync(path.join(target, file.replace(/\.tpl$/, '')), body);
  }
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const dir = newTemplate(process.argv[2]);
    console.log(`created ${path.relative(ROOT, dir)} — next: docs/templates.md`);
  } catch (err) {
    console.error(`template:new: ${err.message}`);
    console.error('usage: npm run template:new -- <id>');
    process.exit(1);
  }
}
