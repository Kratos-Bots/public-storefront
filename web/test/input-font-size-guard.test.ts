/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// iOS zooms the page when a focused field's font size is under 16px. The global rule in global.css covers a bare
// element, but any class on the field outranks it, so each field's own class is read here.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(testDir, '../src');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'builder') walk(p, out);
    } else out.push(p);
  }
  return out;
}

interface Rule { selector: string; decls: string; media: string }

/** A flat CSS reader: rules with their enclosing @media prelude (one level is all the modules use). */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /@media([^{]+)\{|([^{}]+)\{([^{}]*)\}|\}/g;
  const stack: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1] !== undefined) stack.push(m[1].trim());
    else if (m[2] === undefined) stack.pop();
    else out.push({ selector: m[2].trim(), decls: m[3], media: stack.join(' and ') });
  }
  return out;
}

/** The px a font-size value resolves to at scale 1, or null when it is not a length this guard can read. */
function px(value: string): number | null {
  const v = value.trim();
  let m = /^([\d.]+)px$/.exec(v);
  if (m) return Number(m[1]);
  m = /^([\d.]+)rem$/.exec(v);
  if (m) return Number(m[1]) * 16;
  m = /^calc\(\s*([\d.]+)rem\s*\*\s*var\(--sf-text-scale[^)]*\)\s*\)$/.exec(v);
  if (m) return Number(m[1]) * 16;
  m = /^max\(\s*([\d.]+)px\b/.exec(v);
  if (m) return Number(m[1]);
  return null;
}

/** Media that only reach a wide screen: a smaller desktop size is deliberate there. */
const desktopOnly = (media: string) => /min-width:\s*(6[2-9]|[7-9]\d)em/.test(media) && !/max-width/.test(media);

const fontSize = (decls: string) => /(?:^|;|\s)font-size:\s*([^;]+)/.exec(decls)?.[1];

describe('input font sizes', () => {
  const all = walk(src);
  const cssFiles = all.filter((f) => f.endsWith('.css'));
  const tsx = all.filter((f) => f.endsWith('.tsx'));

  it('no CSS rule targets a bare input, select or textarea below 16px on a phone', () => {
    const bad: string[] = [];
    for (const f of cssFiles) {
      for (const r of rules(readFileSync(f, 'utf8'))) {
        if (!/(^|[\s>,+~])(input|select|textarea)(?![\w-])|sf-input|data-sf-part=['"]input['"]/.test(r.selector)) continue;
        if (/::placeholder/.test(r.selector)) continue;
        const fs = fontSize(r.decls);
        if (!fs || desktopOnly(r.media)) continue;
        const v = px(fs);
        if (v === null || v < 16) bad.push(`${path.relative(src, f)}: ${r.selector} { font-size: ${fs.trim()} }`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('every text field a shopper can focus gets 16px or more from its own class', () => {
    const bad: string[] = [];
    let checked = 0;
    for (const f of tsx) {
      const code = readFileSync(f, 'utf8');
      const tags = code.match(/<(?:input|textarea|select|TextInput)\b[^>]*>/g) ?? [];
      for (const tag of tags) {
        if (/type=["'](radio|checkbox|hidden|range|file)["']/.test(tag)) continue;
        const cls = [...tag.matchAll(/(?:className=\{|input:\s*)\w+\.(\w+)/g)].map((x) => x[1]);
        if (cls.length === 0) continue; // unclassed: the global rule applies
        checked++;
        const dir = path.dirname(f);
        const sheets = readdirSync(dir).filter((n) => n.endsWith('.module.css')).map((n) => path.join(dir, n));
        for (const sheet of sheets) {
          for (const r of rules(readFileSync(sheet, 'utf8'))) {
            if (!cls.some((c) => new RegExp(`\\.${c}(?![\\w-])`).test(r.selector))) continue;
            if (/::placeholder/.test(r.selector) || desktopOnly(r.media)) continue;
            const fs = fontSize(r.decls);
            if (!fs) continue;
            const v = px(fs);
            if (v === null || v < 16) bad.push(`${path.relative(src, f)} -> ${path.basename(sheet)}: ${r.selector} { font-size: ${fs.trim()} }`);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(8);
    expect(bad).toEqual([]);
  });

  it('the header search (a Mantine input at size sm, 14px by default) is raised to 16px on phones', () => {
    const css = readFileSync(path.join(src, 'layouts/SearchField.module.css'), 'utf8');
    const hit = rules(css).filter((r) => /\.input\b/.test(r.selector) && fontSize(r.decls)?.trim() === '16px' && !desktopOnly(r.media));
    expect(hit.length).toBeGreaterThan(0);
  });

  it('the global floor stays in place', () => {
    const css = readFileSync(path.join(src, 'styles/global.css'), 'utf8');
    expect(css).toMatch(/input,\s*select,\s*textarea\s*\{\s*font-size:\s*16px/);
  });
});
