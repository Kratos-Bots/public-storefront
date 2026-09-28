/// <reference types="node" />
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tokenizeCss } from '../../scripts/css-tokenizer.mjs';
import { forbiddenCssImports, forbiddenImports } from '../../scripts/template-imports.mjs';
import { CSS_FILE_RE, RESERVED_DIRS, SOURCE_FILE_RE } from '../../scripts/template-rules.mjs';

const templatesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/templates');
const folders = readdirSync(templatesDir).filter((n) => lstatSync(path.join(templatesDir, n)).isDirectory() && !RESERVED_DIRS.includes(n));

function files(dir: string, filterFn: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((n) => {
    const full = path.join(dir, n);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) return [];
    return st.isDirectory() ? files(full, filterFn) : filterFn(n) ? [full] : [];
  });
}

describe('built-in templates respect the import contract', () => {
  it.each(folders)('%s', (folder) => {
    const root = path.join(templatesDir, folder);
    for (const file of files(root, (n) => SOURCE_FILE_RE.test(n))) {
      const bad = forbiddenImports(readFileSync(file, 'utf8'), { fileDir: path.dirname(file), templateRoot: root, isManifest: path.basename(file) === 'manifest.ts' && path.dirname(file) === root, fileName: path.basename(file) });
      expect(bad, path.relative(templatesDir, file)).toEqual([]);
    }
    for (const file of files(root, (n) => CSS_FILE_RE.test(n))) {
      const bad = forbiddenCssImports(readFileSync(file, 'utf8'), { fileDir: path.dirname(file), templateRoot: root });
      expect(bad, path.relative(templatesDir, file)).toEqual([]);
    }
  });
});

// Differential check of scripts/css-tokenizer.mjs (spec mode) against @csstools/css-tokenizer, a
// css-syntax-3 tokenizer that is already installed here transitively (jsdom -> cssstyle). Test-only:
// resolved at runtime so a future install without it skips this block (with a console warning) instead of breaking the suite.
type OracleToken = [string, string, number, number, Record<string, unknown> | undefined];
let oracle: ((input: { css: string }) => OracleToken[]) | null = null;
try {
  const specifier = '@csstools/css-tokenizer';
  oracle = ((await import(/* @vite-ignore */ specifier)) as { tokenize: typeof oracle }).tokenize;
} catch (err) {
  oracle = null;
  console.warn(`[template-imports.test] SKIPPING the css-tokenizer differential test: @csstools/css-tokenizer could not be loaded (${String(err)}). Run \`npm install\` in web/ to restore it.`);
}

const lowerAscii = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

function oracleKeys(css: string): string[] {
  const keys: string[] = [];
  // The reference does not apply the §3.3 NUL -> U+FFFD replacement inside url( ) (it reads NUL as a
  // non-printable and emits bad-url); browsers do replace it, so hand it NUL-replaced input. CR/FF are
  // left raw: the reference normalises those itself, which checks our preprocessing independently.
  for (const [type, raw, , , data] of oracle!({ css: css.replace(/\0/g, '\uFFFD') })) {
    const d = (data ?? {}) as { value?: unknown; unit?: string };
    switch (type) {
      case 'comment': case 'whitespace-token': case 'EOF-token': break;
      case 'ident-token': keys.push(`ident:${d.value}`); break;
      case 'function-token': keys.push(`function:${lowerAscii(String(d.value))}`); break;
      case 'at-keyword-token': keys.push(`at-keyword:${d.value}`); break;
      case 'hash-token': keys.push(`hash:${d.value}`); break;
      case 'string-token': keys.push(`string:${d.value}`); break;
      case 'url-token': keys.push(`url:${d.value}`); break;
      case 'bad-string-token': keys.push('bad-string'); break;
      case 'bad-url-token': keys.push('bad-url'); break;
      case 'number-token': keys.push(`number:${Number(d.value)}`); break;
      case 'percentage-token': keys.push(`percentage:${Number(d.value)}`); break;
      case 'dimension-token': keys.push(`dimension:${Number(d.value)}:${d.unit}`); break;
      case 'delim-token': keys.push(`delim:${d.value}`); break;
      case 'CDO-token': keys.push('cdo'); break;
      case 'CDC-token': keys.push('cdc'); break;
      default: keys.push(`punct:${raw}`);
    }
  }
  return keys;
}

function ourKeys(css: string): string[] {
  return tokenizeCss(css, { nonAsciiIdent: 'spec' }).map((t) => {
    if (t.type === 'bad-string' || t.type === 'bad-url' || t.type === 'cdo' || t.type === 'cdc') return t.type;
    if (t.type === 'number' || t.type === 'percentage') return `${t.type}:${Number(t.value)}`;
    if (t.type === 'dimension') return `dimension:${Number(t.value)}:${t.unit}`;
    return `${t.type}:${t.value}`;
  });
}

const EVIL = 'https://evil.example/x.png';
const CORPUS = [
  `a{content:"\r} b{background:url(${EVIL})} c{content:"}`,
  `a{content:"\f} b{background:url(${EVIL})} c{content:"}`,
  `a{content:"x\\\r\n"} b{background:image-set("${EVIL}" 1x)}`,
  `a{content:"\\""} b{background:image-set("${EVIL}" 1x)}`,
  `x{y:1url(a"b) "); } q{background:url(${EVIL})} r{s:" "}`,
  `x{y:#url(a"b) "); } q{background:url(${EVIL})} r{s:" "}`,
  `x{y:.5url(a"b) "); } q{background:url(${EVIL})} r{s:" "}`,
  `x{y:\u00d7url(a"b) "); } q{background:url(${EVIL})} r{s:" "}`,
  `a{background:url("h\tttps://evil.example/x.png")}`,
  `a{background:url(h\\9ttps://evil.example/x.png)}`,
  `a{background:url(\\1 https://evil.example/x.png)}`,
  `a{background:url(.\\9./.\\9./secret.png)}`,
  `a{background:url(${EVIL}#\\')} b{background:url(${EVIL}?\\27)}`,
  `@import"x.css";@IMPORT url( "y.css" ) layer(a) supports(display:grid);@\\69mport 'z';`,
  `a{margin:.5rem 1e3px -2.5% +1 1e 3E+2 -.5;color:#fff;x:u+1url(x)} <!-- --> @1 \\\n`,
  `a{background:url(a b\\) c) d; b:url(a\u0001b); c:url("x) y`,
  `@font-face{src:local("T"),url(./t.woff2) format("woff2");unicode-range:U+0025-00FF}`,
  `a\0b "\0" url(\0) \\0 \\110000 \\d800 #\\ -\\31 --x -- ->`,
];

/** Deterministic fuzz inputs over the characters that steer tokenization. */
function fuzzCorpus(count: number): string[] {
  const alphabet = ['url(', 'u', 'r', 'l', '(', ')', '"', "'", '\\', '\n', '\r', '\f', '\t', ' ', '1', '.', '#', '-', '+', 'e', 'E', '%', '/', '*', '@', 'a', ':', ';', '{', '}', '[', ']', '<!--', '-->', '9', '\u00d7', '\u00e9', '\0', 'f'];
  let seed = 0x2f6b1d;
  const next = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
  const out: string[] = [];
  for (let k = 0; k < count; k++) {
    let css = '';
    const len = next() % 24;
    for (let j = 0; j < len; j++) css += alphabet[next() % alphabet.length];
    out.push(css);
  }
  return out;
}

describe.skipIf(!oracle)(`css tokenizer matches a css-syntax-3 reference tokenizer${oracle ? '' : ' (SKIPPED: @csstools/css-tokenizer not loadable)'}`, () => {
  it('on the bypass payload corpus and the built-in templates', () => {
    const templateCss = folders.flatMap((f) => files(path.join(templatesDir, f), (n) => CSS_FILE_RE.test(n))).map((f) => readFileSync(f, 'utf8'));
    for (const css of [...CORPUS, ...templateCss]) expect(ourKeys(css), JSON.stringify(css.slice(0, 120))).toEqual(oracleKeys(css));
  });

  it('on 5000 deterministic fuzz inputs', () => {
    for (const css of fuzzCorpus(5000)) expect(ourKeys(css), JSON.stringify(css)).toEqual(oracleKeys(css));
  });
});
