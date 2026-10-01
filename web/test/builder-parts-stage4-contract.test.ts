/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { BLOCKS } from '@/builder/registry.ts';
import { allowedOn, checkRules } from '@/builder/rules.ts';
import { FAMILY_DOCS } from '@/builder/parts.ts';
import { PREVIEW_STATE_IDS } from '@/builder/mode.ts';
import type { ComponentData, LayoutKind, PuckDoc } from '@/builder/types.ts';
import { STAGE4_CONTAINERS, STAGE4_PARTS } from './helpers/stage4-parts.ts';

const SRC = resolve(__dirname, '../src');
const LAYOUTS: LayoutKind[] = ['storefront', 'menu', 'webapp'];
/** Required in one container, optional in another (the payment trio): hide stays offered, the rules reject a hidden one where it is required. */
const CONDITIONALLY_REQUIRED = ['PaymentActions', 'PaymentReference'];

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const docFor = (item: ComponentData): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content: [item] });

describe('stage-4 parts contract (spec §9, §12, §13)', () => {
  it('the stage-4 tables match the registry', () => {
    for (const [name, spec] of Object.entries(STAGE4_PARTS)) {
      const def = BLOCKS[name]!;
      expect(def, name).toBeDefined();
      expect(def.part, name).toEqual({ family: spec.family });
      expect(def.container, name).toBeUndefined();
      expect(def.style && def.style.target, name).toBe(spec.style.target);
      expect([...(def.style ? def.style.keys : [])].sort().join(), name).toBe([...spec.style.keys].sort().join());
    }
    for (const [name, family] of Object.entries(STAGE4_CONTAINERS)) {
      const def = BLOCKS[name]!;
      expect(def.container, name).toBeDefined();
      expect(def.container!.family, name).toBe(family);
      expect(def.part, name).toBeUndefined();
    }
  });

  it('part keys are at most 19 characters (partId budget: 40 + 1 + 18 keeps ids under 64)', () => {
    for (const name of Object.keys(STAGE4_PARTS)) expect(name.length, name).toBeLessThanOrEqual(19);
  });

  describe.each(Object.keys(STAGE4_CONTAINERS))('%s', (name) => {
    const def = BLOCKS[name]!;
    const family = STAGE4_CONTAINERS[name]!;
    const docs = FAMILY_DOCS[family].filter((d) => allowedOn(name, d));
    const variants: unknown[] = name === 'Header' ? ['auto', 'storefront', 'menu', 'webapp'] : [undefined];

    it('lives on at least one document', () => expect(docs.length).toBeGreaterThan(0));

    it('its defaults pass its own rules in every layout, document and header variant', () => {
      for (const layout of LAYOUTS) {
        if (def.layouts !== 'all' && !def.layouts.includes(layout)) continue;
        for (const docKey of docs) {
          for (const variant of variants) {
            const props = variant === undefined ? {} : { variant };
            const id = `${name}-contract`;
            const item: ComponentData = { type: name, props: { id, ...props, ...def.container!.defaultSlots(props, { layout, id }) } };
            // The page's own route-bound block (a doc this container only shares) is out of scope here.
            const issues = checkRules(docFor(item), docKey, layout).filter((i) => !i.rule.startsWith('exactly-one:') || i.rule === `exactly-one:${name}`);
            expect(issues, `${name} ${docKey} ${layout} ${String(variant)}`).toEqual([]);
            const ids = JSON.stringify(item).match(/"id":"([^"]+)"/g)!.map((s) => s.slice(6, -1));
            expect(ids.every((i) => i.length <= 64)).toBe(true);
            expect(new Set(ids).size).toBe(ids.length);
          }
        }
      }
    });

    it('offers and requires only parts of its own family', () => {
      const spec = def.container!;
      for (const t of [...spec.required, ...spec.unique, ...(spec.offers ?? [])]) {
        expect(BLOCKS[t]!.part && BLOCKS[t]!.part!.family, `${name} ${t}`).toBe(family);
      }
    });
  });

  it('no part required by a container accepts hide, except the conditionally required payment parts', () => {
    const offending: string[] = [];
    for (const name of Object.keys(STAGE4_CONTAINERS)) {
      for (const r of BLOCKS[name]!.container!.required) {
        const keys = BLOCKS[r]!.style ? BLOCKS[r]!.style!.keys : [];
        if (keys.includes('hide') && !CONDITIONALLY_REQUIRED.includes(r)) offending.push(`${name}.${r}`);
      }
    }
    expect(offending).toEqual([]);
    // The two exceptions really are required somewhere and optional elsewhere.
    for (const r of CONDITIONALLY_REQUIRED) {
      const holders = Object.keys(STAGE4_CONTAINERS).filter((n) => STAGE4_CONTAINERS[n] === 'payment');
      expect(holders.some((n) => BLOCKS[n]!.container!.required.includes(r)), r).toBe(true);
      expect(holders.some((n) => !BLOCKS[n]!.container!.required.includes(r)), r).toBe(true);
    }
  });

  it('PREVIEW_STATE_IDS keys are real containers', () => {
    // OrderStatus (stage 5) gains its container in Task 5; Task 8 removes this exemption.
    for (const name of Object.keys(PREVIEW_STATE_IDS).filter((n) => n !== 'OrderStatus')) expect(BLOCKS[name] && BLOCKS[name]!.container, name).toBeDefined();
  });

  it('the editor fixtures module is imported only from builder/editor', () => {
    const editor = join(SRC, 'builder', 'editor') + sep;
    const importers = files(SRC)
      .filter((f) => !f.startsWith(editor))
      .filter((f) => /from\s+['"][^'"]*\/fixtures(\.ts)?['"]/.test(readFileSync(f, 'utf8')));
    expect(importers.map((f) => relative(SRC, f))).toEqual([]);
    expect(existsSync(join(editor, 'fixtures.ts'))).toBe(true);
  });

  it('no part block file imports from @/features/ or @/layouts/', () => {
    const bad: string[] = [];
    for (const name of Object.keys(STAGE4_PARTS)) {
      const file = join(SRC, 'builder', 'blocks', `${name}.tsx`);
      expect(existsSync(file), name).toBe(true);
      if (/from\s+['"]@\/(features|layouts)\//.test(readFileSync(file, 'utf8'))) bad.push(name);
    }
    expect(bad).toEqual([]);
  });
});
