#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { parseLock } from './templates-lock.mjs';
import { forbiddenCssImports, forbiddenImports, scriptKindFor } from './template-imports.mjs';
import { RESERVED_DIRS, SOURCE_FILE_RE } from './template-rules.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const INTERNAL = new Set(RESERVED_DIRS);
export const DEFAULTS = {
  lockPath: path.join(ROOT, 'templates.lock.json'),
  templatesDir: path.join(ROOT, 'web', 'src', 'templates'),
  log: (m) => console.log(`fetch-templates: ${m}`),
};

/**
 * Every git invocation is restricted to the transports we actually need (file:// only matters for
 * tests, which fetch from local fixture repos) so a `repo` value can never smuggle in a dangerous
 * transport helper (e.g. `ext::`) even if it somehow slipped past parseLock's allowlist.
 */
const PROTOCOL_ARGS = ['-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always', '-c', 'protocol.ssh.allow=always', '-c', 'protocol.file.allow=always'];

export function builtInIds(templatesDir) {
  return readdirSync(templatesDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !INTERNAL.has(d.name)).map((d) => d.name);
}

function git(args, cwd, id) {
  try {
    execFileSync('git', [...PROTOCOL_ARGS, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    throw new Error(`git ${args[0]} failed for template "${id}": ${String(err.stderr ?? err.message).trim()}`);
  }
}

/** Recursively collects file paths under `dir` matching `filterFn(name)`. Never follows symlinks
 *  (lstatSync only) — by the time this runs, findSymlinks() has already rejected any, but a plain
 *  directory walk must not be the thing that would have followed one. */
function collectFiles(dir, filterFn, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) collectFiles(full, filterFn, out);
    else if (filterFn(name)) out.push(full);
  }
  return out;
}

/** Lists every symlink under `dir` (path relative to `root`), without ever following one. */
function findSymlinks(dir, root, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) { out.push(path.relative(root, full)); continue; }
    if (st.isDirectory()) findSymlinks(full, root, out);
  }
  return out;
}

function unwrapExpression(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node))) {
    node = node.expression;
  }
  return node;
}

/**
 * Reads the manifest's declared id straight from the `defineTemplate({ ... })` call's own
 * top-level `id` property via the TypeScript AST — not the first `id:` text match anywhere in the
 * file, which a manifest could reorder (e.g. put `presets: [{ id: ... }]` first) to dodge the check.
 * `fileName` picks the parser mode (see scriptKindFor) — manifest.ts is always real TypeScript, so
 * old-style type assertions around the object (`<never>{...}`) parse correctly instead of as JSX.
 *
 * Fails closed (throws) rather than guessing on anything that could make the *runtime* id disagree
 * with what this function reports:
 *  - `id` declared more than once as a plain identifier property — JS/the runtime uses the last one.
 *  - a string-literal-named property (`'id': ...`) — legal and exactly equivalent to `id: ...` at
 *    runtime, but a manifest that reaches for this form instead of the plain identifier gets no
 *    benefit of the doubt.
 *  - a computed property name (e.g. `['id']: ...`) — same reasoning; also can't rule out it's 'id'
 *    without evaluating an arbitrary expression, which this function will never do.
 *  - a spread (`...x`) anywhere in the object — could inject or override `id` from something this
 *    function has no way to inspect.
 */
export function findManifestId(source, fileName = 'manifest.ts') {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKindFor(fileName));
  let found;
  let invalidReason = null;
  const visit = (node) => {
    if (found !== undefined || invalidReason) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'defineTemplate' && node.arguments.length > 0) {
      const arg = unwrapExpression(node.arguments[0]);
      if (arg && ts.isObjectLiteralExpression(arg)) {
        if (arg.properties.some((prop) => ts.isSpreadAssignment(prop))) {
          invalidReason = 'manifest uses a spread (...) inside defineTemplate({...}) — the id cannot be statically verified, so it is rejected';
          return;
        }
        if (arg.properties.some((prop) => prop.name && ts.isComputedPropertyName(prop.name))) {
          invalidReason = "manifest uses a computed property name (e.g. ['id']) inside defineTemplate({...}) — the id cannot be statically verified, so it is rejected";
          return;
        }
        if (arg.properties.some((prop) => ts.isPropertyAssignment(prop) && ts.isStringLiteralLike(prop.name) && prop.name.text === 'id')) {
          invalidReason = "manifest declares 'id' as a string-literal property name instead of a plain identifier — rejected";
          return;
        }
        const isIdName = (name) => (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) && name.text === 'id';
        if (arg.properties.some((prop) => (ts.isGetAccessorDeclaration(prop) || ts.isSetAccessorDeclaration(prop) || ts.isMethodDeclaration(prop) || ts.isShorthandPropertyAssignment(prop)) && isIdName(prop.name))) {
          invalidReason = 'manifest declares `id` as a getter, setter, method or shorthand property in defineTemplate({...}) — only a plain string `id: \'…\'` can be verified, so it is rejected';
          return;
        }
        const idProps = arg.properties.filter((prop) => ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'id');
        if (idProps.length > 1) { invalidReason = 'manifest declares `id` more than once in defineTemplate({...}) — the runtime would use the last one, which is rejected as ambiguous'; return; }
        const prop = idProps[0];
        if (prop && ts.isStringLiteralLike(prop.initializer)) found = prop.initializer.text;
      }
      if (found === undefined && !invalidReason) found = null;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (invalidReason) throw new Error(invalidReason);
  return found ?? undefined;
}

/** Shape + import checks for one template folder. Returns messages, empty when valid. */
export function validateTemplateDir(dir, id) {
  const symlinks = findSymlinks(dir, dir);
  if (symlinks.length > 0) return symlinks.map((rel) => `${id}: refusing symlink at ${rel} — templates may not contain symlinks`);

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
    try {
      const found = findManifestId(readFileSync(manifestPath, 'utf8'), 'manifest.ts');
      if (found !== id) errors.push(`${id}: manifest id "${found ?? '?'}" must equal the lock id "${id}"`);
    } catch (err) {
      errors.push(`${id}: ${err.message}`);
    }
  }
  for (const file of collectFiles(dir, (name) => SOURCE_FILE_RE.test(name))) {
    const bad = forbiddenImports(readFileSync(file, 'utf8'), { fileDir: path.dirname(file), templateRoot: dir, isManifest: file === manifestPath, fileName: path.basename(file) });
    for (const spec of bad) errors.push(`${id}: ${where(file)} imports "${spec}" — only @/templates/contract.ts, @/templates/define.ts, react and files inside the template are allowed`);
  }
  for (const file of collectFiles(dir, (name) => name.endsWith('.css'))) {
    const bad = forbiddenCssImports(readFileSync(file, 'utf8'), { fileDir: path.dirname(file), templateRoot: dir });
    for (const spec of bad) errors.push(`${id}: ${where(file)} references "${spec}" — CSS may only reference data: URIs or files inside the template`);
  }
  return errors;
}

export function fetchTemplates(opts = {}) {
  const { lockPath, templatesDir, log } = { ...DEFAULTS, ...opts };
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
      git(['config', 'core.symlinks', 'true'], dir, e.id);
      // '--' stops git from ever reading e.repo/e.ref as options (git option injection via repo).
      git(['fetch', '-q', '--depth', '1', '--', e.repo, e.ref], dir, e.id);
      git(['checkout', '-q', 'FETCH_HEAD'], dir, e.id);
      rmSync(path.join(dir, '.git'), { recursive: true, force: true });
      writeFileSync(refFile, `${e.ref}\n`);
      log(`fetched external/${e.id} @ ${e.ref.slice(0, 7)}`);
    }
    const dirErrors = validateTemplateDir(dir, e.id);
    if (dirErrors.length > 0) {
      rmSync(dir, { recursive: true, force: true }); // never leave a rejected template in external/
      errors.push(...dirErrors);
    }
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
