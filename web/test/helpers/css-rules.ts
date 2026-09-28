/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CssRule {
  /** The rule's selector list, verbatim (comments stripped). */
  selector: string;
  /** Declarations between the braces. */
  body: string;
  /** The enclosing @media/@supports prelude, or null at top level. */
  atRule: string | null;
}

/** Flat style rules: @media/@supports bodies are descended into, @keyframes are skipped. */
export function cssRules(css: string): CssRule[] {
  const out: CssRule[] = [];
  walk(css.replace(/\/\*[\s\S]*?\*\//g, ''), null, out);
  return out;
}

function walk(src: string, atRule: string | null, out: CssRule[]): void {
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1) return;
    const prelude = src.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
      j++;
    }
    const body = src.slice(open + 1, j - 1);
    if (prelude.startsWith('@keyframes')) {
      /* skip */
    } else if (prelude.startsWith('@media') || prelude.startsWith('@supports')) {
      walk(body, prelude, out);
    } else if (prelude) {
      out.push({ selector: prelude, body: body.trim(), atRule });
    }
    i = j;
  }
}

/** Split a selector list on top-level commas (commas inside :is()/:not() stay put). */
export function splitSelectors(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of selector) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/** web/test/ — this file lives in web/test/helpers/. Resolved with path, never `new URL('../', import.meta.url)`:
 *  Vite's asset-import-meta-url transform rewrites that inside vitest (see vocabulary.test.ts). */
const TEST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Read a file relative to web/test/ (e.g. '../src/templates/x/template.css'). */
export function readFromTest(rel: string): string {
  return readFileSync(path.resolve(TEST_DIR, rel), 'utf8');
}
