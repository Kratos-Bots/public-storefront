import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseLock } from './templates-lock.mjs';
import { forbiddenCssImports, forbiddenImports } from './template-imports.mjs';
import { fetchTemplates } from './fetch-templates.mjs';
import { RESERVED_DIRS } from './template-rules.mjs';

const SHA = 'a'.repeat(40);

test('parseLock accepts an empty lock and valid entries', () => {
  assert.deepEqual(parseLock('{"templates":[]}', ['modern']), []);
  assert.deepEqual(parseLock(JSON.stringify({ templates: [{ id: 'acme', repo: 'git@github.com:o/r.git', ref: SHA }] }), ['modern']), [{ id: 'acme', repo: 'git@github.com:o/r.git', ref: SHA }]);
});

test('parseLock rejects bad refs, ids, duplicates and built-in collisions', () => {
  const bad = (templates, fragment) => assert.throws(() => parseLock(JSON.stringify({ templates }), ['modern']), (e) => e.message.includes(fragment));
  bad([{ id: 'acme', repo: 'r', ref: 'main' }], '40-char');
  bad([{ id: 'Acme', repo: 'r', ref: SHA }], 'id');
  bad([{ id: 'acme', repo: '', ref: SHA }], 'repo');
  bad([{ id: 'acme', repo: 'r', ref: SHA }, { id: 'acme', repo: 'r2', ref: SHA }], 'duplicate');
  bad([{ id: 'modern', repo: 'r', ref: SHA }], 'built-in');
  for (const id of RESERVED_DIRS) bad([{ id, repo: 'r', ref: SHA }], 'reserved');
  assert.throws(() => parseLock('{nope', ['modern']), /not valid JSON/);
});

test('parseLock rejects a repo shaped to smuggle a git option or a disallowed transport', () => {
  const bad = (repo) => assert.throws(() => parseLock(JSON.stringify({ templates: [{ id: 'acme', repo, ref: SHA }] }), ['modern']), (e) => e.message.includes('repo'));
  bad('--upload-pack=touch PWNED; false'); // git option injection: git reads this as --upload-pack, not a URL
  bad('-x');
  bad('ext::sh -c "touch PWNED"'); // the `ext::` transport helper runs an arbitrary shell command
  bad('ftp://example.invalid/repo.git'); // not on the allowlist (https/ssh/file/scp-style only)
});

test('parseLock accepts https://, ssh:// and scp-style repo URLs', () => {
  for (const repo of ['https://example.invalid/o/r.git', 'ssh://git@example.invalid/o/r.git', 'git@example.invalid:o/r.git']) {
    assert.deepEqual(parseLock(JSON.stringify({ templates: [{ id: 'acme', repo, ref: SHA }] }), ['modern']), [{ id: 'acme', repo, ref: SHA }]);
  }
});

test('parseLock rejects out-of-shape ids and refs', () => {
  const goodRepo = 'git@example.invalid:o/r.git';
  const bad = (id, ref, fragment) => assert.throws(() => parseLock(JSON.stringify({ templates: [{ id, repo: goodRepo, ref }] }), ['modern']), (e) => e.message.includes(fragment));
  bad('../x', SHA, 'id');
  bad('a/b', SHA, 'id');
  bad('acme', SHA.toUpperCase(), '40-char'); // uppercase hex is not accepted — lowercase only
  bad('acme', SHA.slice(0, 39), '40-char'); // short SHA
});

test('forbiddenImports allows only the contract, define, react and in-folder files', () => {
  const ctx = { fileDir: '/t/external/acme/slots', templateRoot: '/t/external/acme', isManifest: false };
  assert.deepEqual(forbiddenImports(`import { useTemplate } from '@/templates/contract.ts';\nimport x from 'react';\nimport './a.css';\nimport { y } from '../index.ts';\nexport { z } from './z';\nimport type { J } from 'react/jsx-runtime';`, ctx), []);
  assert.deepEqual(forbiddenImports(`import { useSettings } from '@/app/settings.ts';\nimport ky from 'ky';\nimport { q } from '../../other/x.ts';\nconst m = await import('@/api/cart.ts');`, ctx), ['@/app/settings.ts', 'ky', '../../other/x.ts', '@/api/cart.ts']);
  const manifestCtx = { ...ctx, fileDir: '/t/external/acme', isManifest: true };
  assert.deepEqual(forbiddenImports(`import { defineTemplate } from '@/templates/define.ts';`, manifestCtx), []);
  assert.deepEqual(forbiddenImports(`import { useTemplate } from '@/templates/contract.ts';`, manifestCtx), ['@/templates/contract.ts']);
});

test('forbiddenImports accepts in-folder .ts/.tsx specifiers and type-only react imports', () => {
  const ctx = { fileDir: '/t/external/acme/slots', templateRoot: '/t/external/acme', isManifest: false };
  const src = [
    `import type { SVGProps } from 'react';`,
    `import type { ReactNode, ComponentType } from 'react';`,
    `import { useState, type ReactElement } from 'react';`,
    `import { Arrow } from './Arrow.tsx';`,
    `import { nodeName, readoutLines } from './readout.ts';`,
    `import { LuxuryFooter } from '../slots/LuxuryFooter.tsx';`,
    `import {\n  formatClock,\n  useServerClock,\n  type TopBarProps,\n} from '@/templates/contract.ts';`,
    `import { useCutoffInfo, useOrderingState, type CatalogHeroProps } from '@/templates/contract.ts';`,
    `export type { FooterProps } from '@/templates/contract.ts';`,
  ].join('\n');
  assert.deepEqual(forbiddenImports(src, ctx), []);
  // …but a type-only import is still an import: other packages stay forbidden
  assert.deepEqual(forbiddenImports(`import type { Theme } from '@/types/settings.ts';\nimport type { Options } from 'ky';`, ctx), ['@/types/settings.ts', 'ky']);
});

test('forbiddenImports resists formatting/construct bypasses a regex scanner would miss', () => {
  const ctx = { fileDir: '/t/external/acme', templateRoot: '/t/external/acme', isManifest: false };
  // no space between keywords and braces/quotes
  assert.deepEqual(forbiddenImports(`import{useSettings}from'@/app/settings.ts';`, ctx), ['@/app/settings.ts']);
  // comment immediately before the keyword, and the import nested inside blocks (not flush to statement start)
  assert.deepEqual(forbiddenImports(`function f() {\n  /* c */ if (true) { const m = require('@/api/cart.ts'); }\n}`, ctx), ['@/api/cart.ts']);
  // dynamic import with a spread-out / commented call — still just import('literal')
  assert.deepEqual(forbiddenImports(`import ( /* c */ '@/app/settings.ts' )`, ctx), ['@/app/settings.ts']);
  // template-literal dynamic import: a real substitution can't be statically verified — rejected outright
  const dyn = forbiddenImports('const x = 1;\nimport(`./${x}`);', ctx);
  assert.equal(dyn.length, 1);
  assert.match(dyn[0], /^import\(/);
  // a no-substitution template literal is just a string in disguise — normal allowlist rules apply
  assert.deepEqual(forbiddenImports('import(`./index.ts`);', ctx), []);
  // require(...) of a forbidden vs. an allowed (in-folder) module
  assert.deepEqual(forbiddenImports(`const a = require('ky');`, ctx), ['ky']);
  assert.deepEqual(forbiddenImports(`const a = require('./index.ts');`, ctx), []);
  // `import x = require(...)` (TS's other module-reaching form)
  assert.deepEqual(forbiddenImports(`import cart = require('@/api/cart.ts');`, ctx), ['@/api/cart.ts']);
  // import.meta.glob / globEager — Vite's own bundler-level module discovery, whether called or just referenced
  assert.deepEqual(forbiddenImports(`const m = import.meta.glob('./*.ts');`, ctx), ['import.meta.glob']);
  assert.deepEqual(forbiddenImports(`const m = import.meta.globEager('./*.ts');`, ctx), ['import.meta.globEager']);
  assert.deepEqual(forbiddenImports(`const g = import.meta.glob;`, ctx), ['import.meta.glob']);
  // new URL(x, import.meta.url): in-folder allowed, outside-folder or non-literal rejected
  assert.deepEqual(forbiddenImports(`new URL('./asset.png', import.meta.url);`, ctx), []);
  assert.deepEqual(forbiddenImports(`new URL('../../secret.txt', import.meta.url);`, ctx), ['../../secret.txt']);
  const dynUrl = forbiddenImports(`new URL(path, import.meta.url);`, ctx);
  assert.equal(dynUrl.length, 1);
  assert.match(dynUrl[0], /^new URL\(/);
});

test('forbiddenCssImports allows in-folder files and data: URIs, rejects remote/absolute/escaping refs', () => {
  const ctx = { fileDir: '/t/external/acme', templateRoot: '/t/external/acme' };
  assert.deepEqual(forbiddenCssImports(`@import './other.css';`, ctx), []);
  assert.deepEqual(forbiddenCssImports(`:root { background: url('./slots/bg.png'); }`, ctx), []);
  assert.deepEqual(forbiddenCssImports(`:root { background: url(data:image/png;base64,AAAA); }`, ctx), []);
  assert.deepEqual(forbiddenCssImports(`@import '../../evil.css';`, ctx), ['../../evil.css']);
  assert.deepEqual(forbiddenCssImports(`@import url('https://evil.example/x.css');`, ctx), ['https://evil.example/x.css']);
  assert.deepEqual(forbiddenCssImports(`:root { background: url('//evil.example/x.png'); }`, ctx), ['//evil.example/x.png']);
  assert.deepEqual(forbiddenCssImports(`:root { background: url('/etc/passwd'); }`, ctx), ['/etc/passwd']);
});

function sh(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); }

function fixtureRepo(files, { symlinks = {} } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sf-tpl-src-'));
  for (const [name, body] of Object.entries(files)) { mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); writeFileSync(path.join(dir, name), body); }
  for (const [name, target] of Object.entries(symlinks)) { mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); symlinkSync(target, path.join(dir, name)); }
  sh(dir, 'init', '-q');
  sh(dir, 'config', 'core.symlinks', 'true'); // so a fixture symlink round-trips as a real symlink on checkout, on every OS
  sh(dir, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  sh(dir, 'add', '.');
  sh(dir, '-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '-m', 'fixture');
  return { dir, sha: sh(dir, 'rev-parse', 'HEAD'), url: pathToFileURL(dir).href };
}

const GOOD = {
  'manifest.ts': `import { defineTemplate } from '@/templates/define.ts';\nexport default defineTemplate({ contractVersion: 1, id: 'acme' } as never);\n`,
  'index.ts': `import './template.css';\nimport type { TemplateSlots } from '@/templates/contract.ts';\nexport const slots: TemplateSlots = {};\n`,
  'template.css': '',
};

function workspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sf-tpl-ws-'));
  const templatesDir = path.join(root, 'templates');
  mkdirSync(path.join(templatesDir, 'modern'), { recursive: true });
  return { root, templatesDir, lockPath: path.join(root, 'templates.lock.json') };
}

test('fetches a pinned template, skips it when current, removes it when unlocked', () => {
  const repo = fixtureRepo(GOOD);
  const ws = workspace();
  const logs = [];
  writeFileSync(ws.lockPath, JSON.stringify({ templates: [{ id: 'acme', repo: repo.url, ref: repo.sha }] }));
  assert.deepEqual(fetchTemplates({ ...ws, log: (m) => logs.push(m) }), ['acme']);
  const dir = path.join(ws.templatesDir, 'external', 'acme');
  assert.ok(existsSync(path.join(dir, 'manifest.ts')));
  assert.ok(!existsSync(path.join(dir, '.git')));
  assert.equal(readFileSync(path.join(dir, '.template-ref'), 'utf8').trim(), repo.sha);

  fetchTemplates({ ...ws, log: (m) => logs.push(m) });
  assert.ok(logs.some((m) => m.includes('up to date')));

  writeFileSync(ws.lockPath, JSON.stringify({ templates: [] }));
  fetchTemplates({ ...ws, log: (m) => logs.push(m) });
  assert.ok(!existsSync(dir));
  rmSync(ws.root, { recursive: true, force: true });
  rmSync(repo.dir, { recursive: true, force: true });
});

test('rejects a template that reaches outside the contract, or whose id disagrees, and never leaves it in external/', () => {
  const extDir = (ws) => path.join(ws.templatesDir, 'external', 'acme');

  const sneaky = fixtureRepo({ ...GOOD, 'slots/Top.tsx': `import { useSettings } from '@/app/settings.ts';\nexport const Top = () => null;\n` });
  const ws1 = workspace();
  writeFileSync(ws1.lockPath, JSON.stringify({ templates: [{ id: 'acme', repo: sneaky.url, ref: sneaky.sha }] }));
  assert.throws(() => fetchTemplates({ ...ws1, log: () => {} }), /slots[\\/]Top\.tsx.*@\/app\/settings\.ts/);
  assert.ok(!existsSync(extDir(ws1)), 'a rejected template must not stay in external/');

  const wrongId = fixtureRepo(GOOD);
  const ws2 = workspace();
  writeFileSync(ws2.lockPath, JSON.stringify({ templates: [{ id: 'other', repo: wrongId.url, ref: wrongId.sha }] }));
  assert.throws(() => fetchTemplates({ ...ws2, log: () => {} }), /manifest id/);

  const withDeps = fixtureRepo({ ...GOOD, 'package.json': JSON.stringify({ dependencies: { lodash: '1' } }) });
  const ws3 = workspace();
  writeFileSync(ws3.lockPath, JSON.stringify({ templates: [{ id: 'acme', repo: withDeps.url, ref: withDeps.sha }] }));
  assert.throws(() => fetchTemplates({ ...ws3, log: () => {} }), /dependencies/);
  assert.ok(!existsSync(extDir(ws3)));

  for (const d of [ws1.root, ws2.root, ws3.root, sneaky.dir, wrongId.dir, withDeps.dir]) rmSync(d, { recursive: true, force: true });
});

test('rejects a template containing a symlink, and removes the folder', (t) => {
  const probe = mkdtempSync(path.join(os.tmpdir(), 'sf-tpl-symprobe-'));
  let canSymlink = true;
  try { symlinkSync(probe, path.join(probe, 'self')); } catch { canSymlink = false; }
  rmSync(probe, { recursive: true, force: true });
  if (!canSymlink) { t.skip('this OS/user is not permitted to create symlinks'); return; }

  const evil = fixtureRepo(GOOD, { symlinks: { 'slots/evil-link': '.' } });
  const ws = workspace();
  writeFileSync(ws.lockPath, JSON.stringify({ templates: [{ id: 'acme', repo: evil.url, ref: evil.sha }] }));
  assert.throws(() => fetchTemplates({ ...ws, log: () => {} }), /refusing symlink at slots[\\/]evil-link/);
  assert.ok(!existsSync(path.join(ws.templatesDir, 'external', 'acme')));
  rmSync(ws.root, { recursive: true, force: true });
  rmSync(evil.dir, { recursive: true, force: true });
});

test('names the template when git cannot fetch it', () => {
  const ws = workspace();
  writeFileSync(ws.lockPath, JSON.stringify({ templates: [{ id: 'acme', repo: pathToFileURL(path.join(ws.root, 'missing')).href, ref: SHA }] }));
  assert.throws(() => fetchTemplates({ ...ws, log: () => {} }), /acme/);
  rmSync(ws.root, { recursive: true, force: true });
});

test('fetchTemplates(opts) fills in missing keys from DEFAULTS individually, not only when opts itself is omitted', () => {
  const ws = workspace();
  mkdirSync(path.join(ws.templatesDir, 'external', 'stale'), { recursive: true });
  writeFileSync(ws.lockPath, JSON.stringify({ templates: [] }));
  // `log` is intentionally omitted (not just the whole options object) — this must still log
  // (a stale external/ folder needs removing) via the default console logger, not throw.
  assert.deepEqual(fetchTemplates({ lockPath: ws.lockPath, templatesDir: ws.templatesDir }), []);
  assert.ok(!existsSync(path.join(ws.templatesDir, 'external', 'stale')));
  rmSync(ws.root, { recursive: true, force: true });
});
