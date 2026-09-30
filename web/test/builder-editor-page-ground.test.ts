import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PageGround.module.css copies the custom properties each shell publishes on `.shell`
 * (--sf-rail-max, --sf-bar-h, --sf-main-pad), at rest and from 62em. This guard fails when a
 * shell changes one and the copy doesn't follow.
 */
const PROPS = ['--sf-rail-max', '--sf-bar-h', '--sf-main-pad'] as const;
const WIDE = '(min-width: 62em)';
type Layout = 'storefront' | 'menu' | 'webapp';

interface Rule { media: string | null; selectors: string[]; decls: Record<string, string> }

const read = (rel: string) => readFileSync(resolve(__dirname, '../src', rel), 'utf8');

/** Flat rules (one level of @media) with their custom-property declarations, in source order. */
function parse(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  const walk = (text: string, media: string | null) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      const prelude = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth += 1;
        else if (text[j] === '}') depth -= 1;
        j += 1;
      }
      const body = text.slice(open + 1, j - 1);
      if (prelude.startsWith('@media')) walk(body, prelude.replace(/^@media\s*/, '').trim());
      else {
        const decls: Record<string, string> = {};
        for (const m of body.matchAll(/(--sf-[a-z-]+)\s*:\s*([^;]+);/g)) decls[m[1]!] = m[2]!.trim();
        rules.push({ media, selectors: prelude.split(',').map((s) => s.trim()), decls });
      }
      i = j;
    }
  };
  walk(src, null);
  return rules;
}

/** Values at rest and from 62em, applying the rules whose selector matches, in order. */
function resolveProps(sources: Array<{ rules: Rule[]; matches: (sel: string) => boolean }>): { rest: Record<string, string>; wide: Record<string, string> } {
  const rest: Record<string, string> = {};
  const wide: Record<string, string> = {};
  for (const phase of [null, WIDE] as const) {
    for (const { rules, matches } of sources) {
      for (const r of rules) {
        if (r.media !== phase || !r.selectors.some(matches)) continue;
        for (const p of PROPS) {
          if (r.decls[p] === undefined) continue;
          if (phase === null) rest[p] = r.decls[p]!;
          wide[p] = r.decls[p]!;
        }
      }
    }
  }
  return { rest, wide };
}

const storefront = parse(read('layouts/StorefrontShell.module.css'));
const menu = parse(read('layouts/MenuShell.module.css'));
const webapp = parse(read('layouts/WebAppShell.module.css'));
const ground = parse(read('builder/editor/PageGround.module.css'));

const isShell = (sel: string) => sel === '.shell';
const SHELLS: Record<Layout, Array<{ rules: Rule[]; matches: (sel: string) => boolean }>> = {
  storefront: [{ rules: storefront, matches: isShell }],
  menu: [{ rules: menu, matches: isShell }],
  // WebAppShell's .shell composes the menu's and overrides on top.
  webapp: [{ rules: menu, matches: isShell }, { rules: webapp, matches: isShell }],
};
const groundFor = (layout: Layout) => [{ rules: ground, matches: (sel: string) => sel === '.ground' || sel === `.ground[data-layout='${layout}']` }];

describe('PageGround mirrors the shells', () => {
  for (const layout of ['storefront', 'menu', 'webapp'] as const) {
    it(`${layout}: the same rail, bar height and content inset, at rest and from 62em`, () => {
      const shell = resolveProps(SHELLS[layout]);
      for (const p of PROPS) expect(shell.rest[p], `${layout} shell publishes ${p}`).toBeDefined();
      expect(resolveProps(groundFor(layout))).toEqual(shell);
    });
  }

  it('the column uses the shells\' main recipe: max width and inline inset from the published values', () => {
    const column = ground.find((r) => r.selectors.includes('.column'))!;
    expect(column).toBeDefined();
    const css = read('builder/editor/PageGround.module.css');
    expect(css).toMatch(/\.column\s*\{[^}]*max-inline-size:\s*var\(--sf-rail-max\)/);
    expect(css).toMatch(/\.column\s*\{[^}]*padding-inline:\s*var\(--sf-main-pad\)/);
    for (const rel of ['layouts/StorefrontShell.module.css', 'layouts/MenuShell.module.css']) {
      expect(read(rel)).toMatch(/\.main\s*\{[^}]*max-width:\s*var\(--sf-rail-max\)[^}]*padding:\s*0 var\(--sf-main-pad\)/);
    }
  });
});
