/// <reference types="node" />
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderBlockStyleCss } from '@/builder/style/css.ts';
import { STYLE_ATTR, STYLE_KEY_ORDER, STYLE_KEYS } from '@/builder/style/model.ts';
import { cssRules } from './helpers/css-rules.ts';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(testDir, '../src/builder/style/block-style.css');

/** [ids, classes/attributes/pseudo-classes, elements] for the selector shapes the generator writes. */
function specificity(selector: string): [number, number, number] {
  let s = selector;
  let b = 0;
  s = s.replace(/:not\(([^)]*)\)/g, (_m, inner: string) => {
    b += Math.max(...inner.split(',').map((x) => specificity(x.trim())[1]));
    return '';
  });
  b += (s.match(/\[[^\]]*\]/g) ?? []).length;
  s = s.replace(/\[[^\]]*\]/g, '');
  b += (s.match(/:(?!:)[a-z-]+/g) ?? []).length;
  const c = (s.replace(/:[a-z-]+/g, '').match(/(^|[\s>+~])[a-z]+/g) ?? []).length;
  return [0, b, c];
}

describe('block-style.css (spec §5.2)', () => {
  const css = renderBlockStyleCss();
  const rules = cssRules(css);

  it('the committed file is current (UPDATE_BLOCK_STYLE_CSS=1 npm --prefix web test -- test/block-style-css.test.ts rewrites it)', () => {
    if (process.env.UPDATE_BLOCK_STYLE_CSS === '1') writeFileSync(FILE, css);
    expect(readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n')).toBe(css);
  });

  it('has a rule for every key × value', () => {
    for (const key of STYLE_KEY_ORDER) {
      for (const value of STYLE_KEYS[key]) expect(css, `${key}=${value}`).toContain(`[data-sfs-${STYLE_ATTR[key]}="${value}"]`);
    }
  });

  it('every selector is (0,4,0)', () => {
    for (const r of rules) for (const sel of r.selector.split(/,(?![^(]*\))/)) expect(specificity(sel.trim()), sel).toEqual([0, 4, 0]);
  });

  it('has no motion', () => {
    expect(css).not.toMatch(/transition|animation/);
  });

  it('resets the private border variables on every marker, before any key rule', () => {
    const first = rules.findIndex((r) => /--sfs-bc:\s*initial/.test(r.body) && /--sfs-bs:\s*initial/.test(r.body));
    const firstKey = rules.findIndex((r) => r.selector.includes('[data-sfs-'));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(firstKey);
    expect(rules[first]!.body).toMatch(/box-sizing:\s*border-box/);
    expect(rules[first]!.body).toMatch(/min-width:\s*0/);
  });

  it('writes the §3.2 declarations', () => {
    const body = (sel: string) => rules.find((r) => r.atRule === null && r.selector.endsWith(sel))?.body ?? '';
    expect(body('[data-sfs-bg="surface-2"]')).toMatch(/background:\s*var\(--sf-surface-2\)/);
    expect(body('[data-sfs-fg="muted"]')).toMatch(/--sf-block-fg:\s*var\(--sf-muted\)/);
    expect(body('[data-sfs-pt="lg"]')).toMatch(/padding-block-start:\s*2\.5rem/);
    expect(body('[data-sfs-border="thin"]')).toMatch(/border:\s*1px var\(--sfs-bs, solid\) var\(--sfs-bc, var\(--sf-line\)\)/);
    expect(body('[data-sfs-bc="primary"]')).toMatch(/--sfs-bc:\s*var\(--sf-primary\)/);
    expect(body('[data-sfs-radius="card"]')).toMatch(/border-radius:\s*var\(--sf-card-radius\)/);
    expect(body('[data-sfs-shadow="raised"]')).toMatch(/box-shadow:\s*var\(--sf-card-shadow-hover\)/);
    expect(body('[data-sfs-text="lg"]')).toMatch(/--sf-text-scale:\s*1\.125/);
    expect(body('[data-sfs-max="text"]')).toMatch(/max-width:\s*min\(68ch, 100%\)/);
  });

  it('bg alone never insets the WholesaleTable, whose cart bar is full-bleed', () => {
    const inset = rules.find((r) => r.selector.includes('[data-sfs-bg]:not(') && /padding-inline:\s*1rem/.test(r.body));
    expect(inset?.selector).toMatch(/:not\([^)]*\[data-sf-style="WholesaleTable"\][^)]*\)/);
  });

  it('bg alone insets the text (never on the header part); align places a max-width box', () => {
    expect(rules.some((r) => r.selector.includes('[data-sfs-bg]:not([data-sfs-px], [data-sf-part], [data-sf-style="WholesaleTable"])') && /padding-inline:\s*1rem/.test(r.body))).toBe(true);
    expect(rules.some((r) => r.selector.includes('[data-sfs-max][data-sfs-align="center"]') && /margin-inline:\s*auto/.test(r.body))).toBe(true);
    expect(rules.some((r) => r.selector.includes('[data-sfs-max][data-sfs-align="end"]') && /margin-inline-start:\s*auto/.test(r.body))).toBe(true);
  });

  it('hides at the 62em breakpoint, with !important', () => {
    expect(rules.some((r) => r.atRule === '@media (max-width: 61.99em)' && r.selector.includes('[data-sfs-hide="mobile"]') && /display:\s*none !important/.test(r.body))).toBe(true);
    expect(rules.some((r) => r.atRule === '@media (min-width: 62em)' && r.selector.includes('[data-sfs-hide="desktop"]') && /display:\s*none !important/.test(r.body))).toBe(true);
  });

  it('caps large steps on phones and zeroes the third nested side padding, last', () => {
    const phone = rules.filter((r) => r.atRule === '@media (max-width: 47.99em)');
    const find = (sel: string) => phone.find((r) => r.selector.endsWith(sel))?.body ?? '';
    expect(find('[data-sfs-pt="lg"]')).toMatch(/1\.5rem/);
    expect(find('[data-sfs-mb="xl"]')).toMatch(/2\.5rem/);
    expect(find('[data-sfs-px="md"]')).toMatch(/padding-inline:\s*1rem/);
    expect(find('[data-sfs-px="xl"]')).toMatch(/padding-inline:\s*1rem/);
    expect(find('[data-sfs-text="xl"]')).toMatch(/--sf-text-scale:\s*1\.125/);
    const nested = phone.at(-1)!;
    expect(nested.selector).toBe(':root [data-sfs-px] [data-sfs-px] [data-sfs-px]');
    expect(nested.body).toMatch(/padding-inline:\s*0/);
  });

  it('an empty wrapper (a marker with no block of its own) shows no box', () => {
    expect(rules.some((r) => r.selector === ':root [data-sf-style]:not([data-sf-block]):empty' && /display:\s*none/.test(r.body))).toBe(true);
  });
});
