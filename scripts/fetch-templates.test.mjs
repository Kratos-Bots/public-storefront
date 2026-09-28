import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseLock } from './templates-lock.mjs';
import { forbiddenCssImports, forbiddenImports } from './template-imports.mjs';
import { fetchTemplates, findManifestId } from './fetch-templates.mjs';
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

test('parseLock rejects a repo whose host itself starts with "-" (ssh/scp option injection one level down)', () => {
  const bad = (repo) => assert.throws(() => parseLock(JSON.stringify({ templates: [{ id: 'acme', repo, ref: SHA }] }), ['modern']), (e) => e.message.includes('repo'));
  bad('git@-evil.com:x'); // git invokes ssh, which would read "-evil.com" as an ssh option
  bad('ssh://-evil.com/x');
  bad('ssh://user@-evil.com/x'); // a userinfo prefix must not let the dash-host slip past the check
  bad('https://-evil.com/x');
  bad('https://user@-evil.com/x');
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

test('forbiddenImports parses by the real file extension, not always as TSX', () => {
  // <any>expr and <T>(x: T) => … are legal only outside .tsx (there, `<` starts a JSX element).
  // Parsing every file as TSX (round 1) silently read these as JSX text, hiding the call inside.
  const ctx = { fileDir: '/t/external/acme', templateRoot: '/t/external/acme', isManifest: false, fileName: 'index.ts' };
  assert.deepEqual(forbiddenImports(`const m = <any>import('@/api/cart.ts');`, ctx), ['@/api/cart.ts']);
  assert.deepEqual(forbiddenImports(`const f = <T>(x: T) => import('@/api/cart.ts');`, ctx), ['@/api/cart.ts']);
  assert.deepEqual(forbiddenImports(`const r = <any>require('@/api/cart.ts');`, ctx), ['@/api/cart.ts']);
  // sanity check that the mode really is extension-driven: a genuine .tsx file can't use this
  // syntax at all (TypeScript itself requires `as never` there instead of `<never>x`), so there's
  // no equivalent bypass for .tsx — parsing it as TSX for a .tsx file is correct, not a gap.
  assert.deepEqual(forbiddenImports(`const m = <any>import('@/api/cart.ts');`, { ...ctx, fileName: 'index.tsx' }), []);
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

test('forbiddenCssImports resists no-space/comment/case/escape bypasses and non-url() functions', () => {
  const ctx = { fileDir: '/t/external/acme', templateRoot: '/t/external/acme' };
  assert.deepEqual(forbiddenCssImports(`@import"../../../app/secret.css";`, ctx), ['../../../app/secret.css']);
  assert.deepEqual(forbiddenCssImports(`@import/**/"../../secret.css";`, ctx), ['../../secret.css']);
  assert.deepEqual(forbiddenCssImports(`@IMPORT "https://evil.example/x.css";`, ctx), ['https://evil.example/x.css']);
  assert.deepEqual(forbiddenCssImports(`body { background: URL(../../../../secret.png); }`, ctx), ['../../../../secret.png']);
  assert.deepEqual(forbiddenCssImports(`body { background: image-set("../../../../../secret.png" 1x); }`, ctx), ['../../../../../secret.png']);
  assert.deepEqual(forbiddenCssImports(`body { background: -webkit-image-set("../../../../../secret.png" 1x); }`, ctx), ['../../../../../secret.png']);
  assert.deepEqual(forbiddenCssImports(`body { background: image-set("https://evil.example/x.png" 1x); }`, ctx), ['https://evil.example/x.png']);
  assert.deepEqual(forbiddenCssImports(`@font-face { src: src("../../../secret.woff2"); }`, ctx), ['../../../secret.woff2']);
  // \2e = '.', \2f = '/' (CSS hex escapes); the trailing space after \2f is consumed by the escape, not emitted
  assert.deepEqual(forbiddenCssImports(`body { background: url(.\\2e/.\\2e/secret.png); }`, ctx), ['../../secret.png']);
  assert.deepEqual(forbiddenCssImports(`body { background: url(\\2f\\2f evil.example/x.png); }`, ctx), ['//evil.example/x.png']);
  // ordinary CSS text that happens to be quoted must not be flagged
  assert.deepEqual(forbiddenCssImports(`font-family: 'Space Grotesk', sans-serif;`, ctx), []);
});

test('forbiddenCssImports resists escape-based desync bypasses (round 3: decode-then-regex was unsound)', () => {
  const ctx = { fileDir: '/t/external/acme', templateRoot: '/t/external/acme' };
  // an escaped quote inside an *unquoted* url(...) token must decode without prematurely ending the token
  assert.deepEqual(forbiddenCssImports(`body { background: url(https://evil.example/x.png#\\'); }`, ctx), ["https://evil.example/x.png#'"]);
  assert.deepEqual(forbiddenCssImports(`body { background: url(https://evil.example/x.png?a=\\"); }`, ctx), ['https://evil.example/x.png?a="']);
  assert.deepEqual(forbiddenCssImports(`body { background: url(https://evil.example/x.png?\\27); }`, ctx), ["https://evil.example/x.png?'"]);
  // an escaped quote inside one string (here, a `content` value, which must stay ignored) must not
  // desync the pairing of quotes in whatever follows — the actual attack payload is the image-set(...)
  assert.deepEqual(forbiddenCssImports(`a{content:"\\""} b{background:image-set("https://evil.example/x.png" 1x)}`, ctx), ['https://evil.example/x.png']);
  assert.deepEqual(forbiddenCssImports(`a{content:"\\22"} b{background:image-set("https://evil.example/x.png" 1x)}`, ctx), ['https://evil.example/x.png']);
  // percent-encoded traversal (%2e = '.', %2f = '/') must decode before the containment check
  assert.deepEqual(forbiddenCssImports(`body { background: url(%2e%2e/%2e%2e/secret.png); }`, ctx), ['../../secret.png']);
});

test('forbiddenCssImports ignores ordinary CSS text that is not a URL-taking position (round 3 false positives)', () => {
  const ctx = { fileDir: '/t/external/acme', templateRoot: '/t/external/acme' };
  assert.deepEqual(forbiddenCssImports(`a::before { content: "Price: "; }`, ctx), []);
  assert.deepEqual(forbiddenCssImports(`a::after { content: "/"; }`, ctx), []);
  assert.deepEqual(forbiddenCssImports(`a[href^="https://"] { color: red; }`, ctx), []);
  assert.deepEqual(forbiddenCssImports(`a[href^="mailto:"] { color: blue; }`, ctx), []);
  // a string inside an untracked function (e.g. a pseudo-class, or var()'s fallback) is ignored too
  assert.deepEqual(forbiddenCssImports(`a:not("https://evil.example") { color: red; }`, ctx), []);
  assert.deepEqual(forbiddenCssImports(`a { color: var(--x, "https://evil.example"); }`, ctx), []);
});

const EVIL = 'https://evil.example/x.png';

test('forbiddenCssImports normalises CR/CRLF/FF like a browser before tokenizing (round 4)', () => {
  const ctx = { fileDir: '/t/external/acme', templateRoot: '/t/external/acme' };
  // a raw CR / FF inside a string is a newline: the string ends there, so the url() that follows is live CSS
  assert.deepEqual(forbiddenCssImports(`a{content:"\r} b{background:url(${EVIL})} c{content:"}`, ctx), [EVIL]);
  assert.deepEqual(forbiddenCssImports(`a{content:"\f} b{background:url(${EVIL})} c{content:"}`, ctx), [EVIL]);
  // backslash-CRLF is one line continuation, so the string closes at the next quote
  assert.deepEqual(forbiddenCssImports(`a{content:"x\\\r\n"} b{background:image-set("${EVIL}" 1x)}`, ctx), [EVIL]);
  assert.deepEqual(forbiddenCssImports(`a{content:"x\\\r"} b{background:image-set("${EVIL}" 1x)}`, ctx), [EVIL]);
});

test('forbiddenCssImports models numbers/dimensions/hashes, so "1url(" cannot open a fake bad-url (round 4)', () => {
  const ctx = { fileDir: '/t/external/acme', templateRoot: '/t/external/acme' };
  for (const prefix of ['1', '#', '.5', '-1', '+.5e2']) {
    assert.deepEqual(forbiddenCssImports(`x{y:${prefix}url(a"b) "); } q{background:url(${EVIL})} r{s:" "}`, ctx), [EVIL], prefix);
  }
  // …while ordinary numbers, dimensions and colours are untouched
  assert.deepEqual(forbiddenCssImports(`a{margin:.5rem 1e3px -2.5%;color:#fff;border:1px solid #1a2b3c;z-index:+1}`, ctx), []);
});

test('forbiddenCssImports unions browser and spec non-ASCII ident rules (a divergence cannot hide a url)', () => {
  const ctx = { fileDir: '/t/external/acme', templateRoot: '/t/external/acme' };
  // browsers treat every non-ASCII code point as an ident char: "\u00d7url(" is a function, the quote opens a string
  // in spec mode, "\u00d7" is a delim and url( starts a bad-url — each hides the payload from the other reading
  assert.deepEqual(forbiddenCssImports(`x{y:\u00d7url(a"b) "); } q{background:url(${EVIL})} r{s:" "}`, ctx), [EVIL]);
  assert.deepEqual(forbiddenCssImports(`x{y:\u00d7url(x ") q{background:url(${EVIL})} r{s:"}`, ctx), [EVIL]);
  assert.deepEqual(forbiddenCssImports(`a{font-family:"\u00c9l\u00e9gante";content:"\u00d7"}`, ctx), []);
});

test('forbiddenCssImports applies WHATWG URL whitespace/C0 stripping before the check (round 4)', () => {
  const ctx = { fileDir: '/t/external/acme', templateRoot: '/t/external/acme' };
  assert.deepEqual(forbiddenCssImports(`a{background:url("h\tttps://evil.example/x.png")}`, ctx), [EVIL]); // raw tab in a string
  assert.deepEqual(forbiddenCssImports(`a{background:url(h\\9ttps://evil.example/x.png)}`, ctx), [EVIL]); // \9 = tab
  assert.deepEqual(forbiddenCssImports(`a{background:url(h\\attps://evil.example/x.png)}`, ctx), [EVIL]); // \a = LF
  assert.deepEqual(forbiddenCssImports(`a{background:url(h\\d ttps://evil.example/x.png)}`, ctx), [EVIL]); // \d = CR
  assert.deepEqual(forbiddenCssImports(`a{background:url(\\1 https://evil.example/x.png)}`, ctx), [EVIL]); // leading C0
  assert.deepEqual(forbiddenCssImports(`a{background:image-set("${EVIL}\\1f  " 1x)}`, ctx), [EVIL]); // trailing C0 + space
  assert.deepEqual(forbiddenCssImports(`a{background:url(.\\9./.\\9./secret.png)}`, ctx), ['../../secret.png']);
  assert.deepEqual(forbiddenCssImports(`a{background:url(/\\9/evil.example/x.png)}`, ctx), ['//evil.example/x.png']);
  // data: survives normalisation; an in-folder path with a stripped tab stays allowed
  assert.deepEqual(forbiddenCssImports(`a{background:url(d\\9 ata:image/png;base64,AAAA)}`, ctx), []);
  assert.deepEqual(forbiddenCssImports(`a{background:url(./a\\9.png)}`, ctx), []);
});

test('forbiddenCssImports keeps ignoring ordinary CSS (round 4 regression guard)', () => {
  const ctx = { fileDir: '/t/external/acme', templateRoot: '/t/external/acme' };
  for (const css of [
    `a::before{content:"Price: "}`,
    `a[href^="https://"]::after{content:"\\2197"}`,
    `a{font:700 1rem/1.2 "Tektur", sans-serif}`,
    `.g{grid-template-areas:"head head" "side main"}`,
    `a{filter:url(#blur)}`,
    `@font-face{font-family:x;src:local("Tektur"),url(./t.woff2) format("woff2")}`,
    `a{background:url(DATA:image/png;base64,AAAA)}`,
    `a{background:url(./a.png?v=1#x)}`,
    `@media (min-width:40em){a{margin:calc(100% - .5rem)}}`,
  ]) assert.deepEqual(forbiddenCssImports(css, ctx), [], css);
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

test('rejects a template whose index.ts hides a forbidden import behind a type assertion', () => {
  // Round-2 finding: parsing every file as TSX let `<any>require(...)` slip past the scanner in a
  // real .ts file (the mode must be picked from the actual extension). This exercises the full
  // fetch → validateTemplateDir → forbiddenImports wiring, not just the unit-level function.
  const sneaky = fixtureRepo({ ...GOOD, 'index.ts': `import './template.css';\nimport type { TemplateSlots } from '@/templates/contract.ts';\nconst hidden = <any>require('@/app/settings.ts');\nexport const slots: TemplateSlots = {};\n` });
  const ws = workspace();
  writeFileSync(ws.lockPath, JSON.stringify({ templates: [{ id: 'acme', repo: sneaky.url, ref: sneaky.sha }] }));
  assert.throws(() => fetchTemplates({ ...ws, log: () => {} }), /@\/app\/settings\.ts/);
  assert.ok(!existsSync(path.join(ws.templatesDir, 'external', 'acme')));
  rmSync(ws.root, { recursive: true, force: true });
  rmSync(sneaky.dir, { recursive: true, force: true });
});

test('findManifestId rejects a manifest that declares `id` more than once', () => {
  const src = `import { defineTemplate } from '@/templates/define.ts';\nexport default defineTemplate({ contractVersion: 1, id: 'acme', id: 'evil' } as never);\n`;
  assert.throws(() => findManifestId(src, 'manifest.ts'), /more than once/);
});

test('findManifestId fails closed on a spread, a computed property name, or a string-literal id key', () => {
  const wrap = (obj) => `import { defineTemplate } from '@/templates/define.ts';\nexport default defineTemplate({ contractVersion: 1, ${obj} } as never);\n`;
  assert.throws(() => findManifestId(wrap(`id: 'acme', ...extra`), 'manifest.ts'), /spread/);
  assert.throws(() => findManifestId(wrap(`['id']: 'acme'`), 'manifest.ts'), /computed property/);
  assert.throws(() => findManifestId(wrap(`'id': 'acme'`), 'manifest.ts'), /string-literal property name/);
  // a normal id alongside an unrelated computed/spread property is rejected too — presence alone is disqualifying
  assert.throws(() => findManifestId(wrap(`id: 'acme', [computedKey]: 'x'`), 'manifest.ts'), /computed property/);
});

test('findManifestId fails closed on an accessor, method or shorthand named id', () => {
  const wrap = (obj) => `import { defineTemplate } from '@/templates/define.ts';\nexport default defineTemplate({ contractVersion: 1, ${obj} } as never);\n`;
  for (const obj of [
    `id: 'acme', get id() { return 'evil'; }`,
    `id: 'acme', set id(v) {}`,
    `id: 'acme', id() { return 'evil'; }`,
    `get id() { return 'acme'; }`,
    `id`,
    `id: 'acme', get 'id'() { return 'evil'; }`,
    `id: 'acme', get ['id']() { return 'evil'; }`,
  ]) assert.throws(() => findManifestId(wrap(obj), 'manifest.ts'), /id/, obj);
  // unrelated accessors/methods/shorthands are fine
  assert.equal(findManifestId(wrap(`id: 'acme', get name() { return 'x'; }, render() {}, slots`), 'manifest.ts'), 'acme');
});

test('rejects a template whose manifest declares `id` more than once', () => {
  const dup = fixtureRepo({ ...GOOD, 'manifest.ts': `import { defineTemplate } from '@/templates/define.ts';\nexport default defineTemplate({ contractVersion: 1, id: 'acme', id: 'evil' } as never);\n` });
  const ws = workspace();
  writeFileSync(ws.lockPath, JSON.stringify({ templates: [{ id: 'acme', repo: dup.url, ref: dup.sha }] }));
  assert.throws(() => fetchTemplates({ ...ws, log: () => {} }), /more than once/);
  assert.ok(!existsSync(path.join(ws.templatesDir, 'external', 'acme')));
  rmSync(ws.root, { recursive: true, force: true });
  rmSync(dup.dir, { recursive: true, force: true });
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
