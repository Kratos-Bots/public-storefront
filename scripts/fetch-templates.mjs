#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseLock } from './templates-lock.mjs';
import { forbiddenImports } from './template-imports.mjs';
import { RESERVED_DIRS } from './template-rules.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const INTERNAL = new Set(RESERVED_DIRS);
export const DEFAULTS = {
  lockPath: path.join(ROOT, 'templates.lock.json'),
  templatesDir: path.join(ROOT, 'web', 'src', 'templates'),
  log: (m) => console.log(`fetch-templates: ${m}`),
};

export function builtInIds(templatesDir) {
  return readdirSync(templatesDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !INTERNAL.has(d.name)).map((d) => d.name);
}

function git(args, cwd, id) {
  try {
    execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    throw new Error(`git ${args[0]} failed for template "${id}": ${String(err.stderr ?? err.message).trim()}`);
  }
}

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/** Shape + import checks for one template folder. Returns messages, empty when valid. */
export function validateTemplateDir(dir, id) {
  const errors = [];
  const where = (f) => path.relative(dir, f) || '.';
  for (const f of ['manifest.ts', 'index.ts']) if (!existsSync(path.join(dir, f))) errors.push(`${id}: missing ${f} at the repo root`);
  const pkg = path.join(dir, 'package.json');
  if (existsSync(pkg)) {
    try {
      const deps = JSON.parse(readFileSync(pkg, 'utf8')).dependencies;
      if (deps && Object.keys(deps).length > 0) errors.push(`${id}: package.json declares dependencies — templates may only use the storefront contract and React`);
    } catch { errors.push(`${id}: package.json is not valid JSON`); }
  }
  const manifestPath = path.join(dir, 'manifest.ts');
  if (existsSync(manifestPath)) {
    const found = /\bid:\s*['"]([^'"]+)['"]/.exec(readFileSync(manifestPath, 'utf8'))?.[1];
    if (found !== id) errors.push(`${id}: manifest id "${found ?? '?'}" must equal the lock id "${id}"`);
  }
  for (const file of sourceFiles(dir)) {
    const bad = forbiddenImports(readFileSync(file, 'utf8'), { fileDir: path.dirname(file), templateRoot: dir, isManifest: file === manifestPath });
    for (const spec of bad) errors.push(`${id}: ${where(file)} imports "${spec}" — only @/templates/contract.ts, @/templates/define.ts, react and files inside the template are allowed`);
  }
  return errors;
}

export function fetchTemplates({ lockPath, templatesDir, log } = DEFAULTS) {
  const text = existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : '{"templates":[]}';
  const entries = parseLock(text, builtInIds(templatesDir));
  const extDir = path.join(templatesDir, 'external');
  mkdirSync(extDir, { recursive: true });

  const wanted = new Set(entries.map((e) => e.id));
  for (const d of readdirSync(extDir, { withFileTypes: true })) {
    if (d.isDirectory() && !wanted.has(d.name)) {
      rmSync(path.join(extDir, d.name), { recursive: true, force: true });
      log(`removed external/${d.name} (not in the lock)`);
    }
  }

  const errors = [];
  for (const e of entries) {
    const dir = path.join(extDir, e.id);
    const refFile = path.join(dir, '.template-ref');
    if (existsSync(refFile) && readFileSync(refFile, 'utf8').trim() === e.ref) {
      log(`external/${e.id} up to date @ ${e.ref.slice(0, 7)}`);
    } else {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      git(['init', '-q'], dir, e.id);
      git(['fetch', '-q', '--depth', '1', e.repo, e.ref], dir, e.id);
      git(['checkout', '-q', 'FETCH_HEAD'], dir, e.id);
      rmSync(path.join(dir, '.git'), { recursive: true, force: true });
      writeFileSync(refFile, `${e.ref}\n`);
      log(`fetched external/${e.id} @ ${e.ref.slice(0, 7)}`);
    }
    errors.push(...validateTemplateDir(dir, e.id));
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return entries.map((e) => e.id);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    fetchTemplates();
  } catch (err) {
    console.error(`fetch-templates: ${err.message}`);
    process.exit(1);
  }
}
