import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseLock } from './templates-lock.mjs';
import { forbiddenImports } from './template-imports.mjs';
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

function sh(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); }

function fixtureRepo(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sf-tpl-src-'));
  for (const [name, body] of Object.entries(files)) { mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); writeFileSync(path.join(dir, name), body); }
  sh(dir, 'init', '-q');
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

test('rejects a template that reaches outside the contract, or whose id disagrees', () => {
  const sneaky = fixtureRepo({ ...GOOD, 'slots/Top.tsx': `import { useSettings } from '@/app/settings.ts';\nexport const Top = () => null;\n` });
  const ws = workspace();
  writeFileSync(ws.lockPath, JSON.stringify({ templates: [{ id: 'acme', repo: sneaky.url, ref: sneaky.sha }] }));
  assert.throws(() => fetchTemplates({ ...ws, log: () => {} }), /slots[\\/]Top\.tsx.*@\/app\/settings\.ts/);

  const wrongId = fixtureRepo(GOOD);
  writeFileSync(ws.lockPath, JSON.stringify({ templates: [{ id: 'other', repo: wrongId.url, ref: wrongId.sha }] }));
  assert.throws(() => fetchTemplates({ ...ws, log: () => {} }), /manifest id/);

  const withDeps = fixtureRepo({ ...GOOD, 'package.json': JSON.stringify({ dependencies: { lodash: '1' } }) });
  writeFileSync(ws.lockPath, JSON.stringify({ templates: [{ id: 'acme', repo: withDeps.url, ref: withDeps.sha }] }));
  assert.throws(() => fetchTemplates({ ...ws, log: () => {} }), /dependencies/);
  for (const d of [ws.root, sneaky.dir, wrongId.dir, withDeps.dir]) rmSync(d, { recursive: true, force: true });
});

test('names the template when git cannot fetch it', () => {
  const ws = workspace();
  writeFileSync(ws.lockPath, JSON.stringify({ templates: [{ id: 'acme', repo: pathToFileURL(path.join(ws.root, 'missing')).href, ref: SHA }] }));
  assert.throws(() => fetchTemplates({ ...ws, log: () => {} }), /acme/);
  rmSync(ws.root, { recursive: true, force: true });
});
