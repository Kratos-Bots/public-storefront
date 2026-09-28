import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { newTemplate } from './new-template.mjs';
import { forbiddenImports } from './template-imports.mjs';
import { RESERVED_DIRS } from './template-rules.mjs';
import { validateTemplateDir } from './fetch-templates.mjs';

function ws() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sf-new-'));
  const templatesDir = path.join(root, 'templates');
  mkdirSync(path.join(templatesDir, 'modern'), { recursive: true });
  return { root, templatesDir };
}

test('scaffolds a template folder with the id and name filled in', () => {
  const { root, templatesDir } = ws();
  const dir = newTemplate('acme-noir', { templatesDir });
  for (const f of ['manifest.ts', 'index.ts', 'template.css', 'README.md']) assert.ok(existsSync(path.join(dir, f)), f);
  const manifest = readFileSync(path.join(dir, 'manifest.ts'), 'utf8');
  assert.match(manifest, /id: 'acme-noir'/);
  assert.match(manifest, /name: 'Acme Noir'/);
  assert.doesNotMatch(manifest, /__ID__|__NAME__/);
  assert.match(readFileSync(path.join(dir, 'template.css'), 'utf8'), /:root\[data-sf-template="acme-noir"\]/);
  assert.deepEqual(forbiddenImports(manifest, { fileDir: dir, templateRoot: dir, isManifest: true }), []);
  assert.deepEqual(forbiddenImports(readFileSync(path.join(dir, 'index.ts'), 'utf8'), { fileDir: dir, templateRoot: dir, isManifest: false }), []);
  rmSync(root, { recursive: true, force: true });
});

test('refuses bad ids, reserved names and existing folders', () => {
  const { root, templatesDir } = ws();
  assert.throws(() => newTemplate('Bad Id', { templatesDir }), /id/);
  for (const name of RESERVED_DIRS) assert.throws(() => newTemplate(name, { templatesDir }), /reserved/);
  assert.throws(() => newTemplate('modern', { templatesDir }), /exists/);
  rmSync(root, { recursive: true, force: true });
});

test('a freshly scaffolded template passes validateTemplateDir (the same shape + import checks fetch-templates runs on an external template)', () => {
  const { root, templatesDir } = ws();
  const dir = newTemplate('acme-noir', { templatesDir });
  assert.deepEqual(validateTemplateDir(dir, 'acme-noir'), []);
  rmSync(root, { recursive: true, force: true });
});
