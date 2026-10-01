/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { BLOCKS } from '@/builder/registry.ts';
import { allowedOn, checkRules } from '@/builder/rules.ts';
import { FAMILY_DOCS } from '@/builder/parts.ts';
import { PREVIEW_STATE_IDS } from '@/builder/mode.ts';
import { TEXT_ENTRIES, isTextKey, matchesTextPattern } from '@/text/registry.ts';
import type { ComponentData, LayoutKind, PuckDoc } from '@/builder/types.ts';
import { STAGE5_CONTAINERS, STAGE5_PARTS } from './helpers/stage5-parts.ts';

const SRC = resolve(__dirname, '../src');
const LAYOUTS: LayoutKind[] = ['storefront', 'menu', 'webapp'];

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}
const docFor = (item: ComponentData): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content: [item] });
const idsOf = (item: ComponentData) => JSON.stringify(item).match(/"id":"([^"]+)"/g)!.map((s) => s.slice(6, -1));

describe('stage-5 parts contract (checkout parts spec §9, §12, §13)', () => {
  it('the stage-5 tables match the registry', () => {
    for (const [name, spec] of Object.entries(STAGE5_PARTS)) {
      const def = BLOCKS[name]!;
      expect(def, name).toBeDefined();
      expect(def.part && def.part.family, name).toBe(spec.family);
      expect(def.container, name).toBeUndefined();
      expect(def.category, name).toBe('part');
      expect(def.style && def.style.target, name).toBe(spec.style.target);
      expect([...(def.style ? def.style.keys : [])].sort().join(), name).toBe([...spec.style.keys].sort().join());
    }
    for (const [name, family] of Object.entries(STAGE5_CONTAINERS)) {
      const def = BLOCKS[name]!;
      expect(def.container, name).toBeDefined();
      expect(def.container!.family, name).toBe(family);
      expect(def.part, name).toBeUndefined();
    }
  });

  it('part keys are at most 23 characters (partId budget: 40 + 1 + 23 keeps ids under 64)', () => {
    for (const name of Object.keys(STAGE5_PARTS)) expect(name.length, name).toBeLessThanOrEqual(23);
  });

  describe.each(Object.keys(STAGE5_CONTAINERS))('%s', (name) => {
    const def = BLOCKS[name]!;
    const family = STAGE5_CONTAINERS[name]!;
    const docs = FAMILY_DOCS[family].filter((d) => allowedOn(name, d));

    it('lives on at least one document', () => expect(docs.length).toBeGreaterThan(0));

    it('its defaults pass its own rules in every layout and document', () => {
      for (const layout of LAYOUTS) {
        if (def.layouts !== 'all' && !def.layouts.includes(layout)) continue;
        for (const docKey of docs) {
          const id = `${name}-contract`;
          const item: ComponentData = { type: name, props: { id, ...def.container!.defaultSlots({}, { layout, id }) } };
          const issues = checkRules(docFor(item), docKey, layout).filter((i) => !i.rule.startsWith('exactly-one:') || i.rule === `exactly-one:${name}`);
          expect(issues, `${name} ${docKey} ${layout}`).toEqual([]);
          const ids = idsOf(item);
          expect(ids.every((i) => i.length <= 64)).toBe(true);
          expect(new Set(ids).size).toBe(ids.length);
        }
      }
    });

    it('offers and requires only parts of its own family; every required part has a home', () => {
      const spec = def.container!;
      for (const t of [...spec.required, ...spec.unique, ...(spec.offers ?? [])]) expect(BLOCKS[t]!.part && BLOCKS[t]!.part!.family, `${name} ${t}`).toBe(family);
      for (const t of spec.required) expect(spec.homes && spec.homes[t], `${name} ${t} home`).toBeDefined();
    });

    it('required parts accept no hide, and noHide covers every required part that does not carry its own guard', () => {
      const spec = def.container!;
      for (const r of spec.required) expect((BLOCKS[r]!.style || { keys: [] }).keys, r).not.toContain('hide');
      for (const t of spec.noHide ?? []) expect(spec.unique, t).toContain(t);
      // Anything a shopper must see is either required (always guarded) or listed in noHide.
      for (const t of spec.unique) {
        const hideable = ((BLOCKS[t]!.style ? BLOCKS[t]!.style!.keys : []) as readonly string[]).includes('hide');
        if (!spec.required.includes(t) && !hideable) expect(spec.noHide ?? [], t).toContain(t);
      }
    });
  });

  it('PREVIEW_STATE_IDS.OrderStatus is a registered container', () => {
    expect(Object.keys(PREVIEW_STATE_IDS)).toContain('OrderStatus');
    for (const name of Object.keys(PREVIEW_STATE_IDS)) expect(BLOCKS[name] && BLOCKS[name]!.container, name).toBeDefined();
  });

  it('the editor fixtures module is imported only from builder/editor', () => {
    const editor = join(SRC, 'builder', 'editor') + sep;
    const importers = files(SRC)
      .filter((f) => !f.startsWith(editor))
      .filter((f) => /from\s+['"][^'"]*\/fixtures(\.ts)?['"]/.test(readFileSync(f, 'utf8')));
    expect(importers.map((f) => relative(SRC, f))).toEqual([]);
    expect(existsSync(join(editor, 'fixtures.ts'))).toBe(true);
  });

  it('no part block, shared container or family file imports from features, layouts, rules, registry or render', () => {
    const blocks = join(SRC, 'builder', 'blocks');
    const targets = [
      ...Object.keys(STAGE5_PARTS).map((n) => join(blocks, `${n}.tsx`)),
      join(blocks, '_shared', 'checkout-container.ts'), join(blocks, '_shared', 'order-status-container.ts'),
      join(SRC, 'builder', 'family-checkout.ts'), join(SRC, 'builder', 'family-order-status.ts'),
    ];
    const bad: string[] = [];
    for (const file of targets) {
      expect(existsSync(file), relative(SRC, file)).toBe(true);
      // Type-only imports are erased at build time (family-checkout.ts reads the form types); value imports would pull views into the entry.
      const src = readFileSync(file, 'utf8').replace(/^import type [^;]*;$/gm, '');
      if (/from\s+['"]@\/(features|layouts)\//.test(src) || /from\s+['"]@\/builder\/(rules|registry|render)(\.tsx?)?['"]/.test(src)) bad.push(relative(SRC, file));
    }
    expect(bad).toEqual([]);
  });

  describe('text', () => {
    const owners = [...Object.keys(STAGE5_PARTS), ...Object.keys(STAGE5_CONTAINERS)];
    it('every pattern of both containers and all sixteen parts is a valid TextKeyPattern', () => {
      for (const name of owners) {
        for (const p of BLOCKS[name]!.text ?? []) {
          const ok = p.endsWith('.*') ? Object.keys(TEXT_ENTRIES).some((k) => matchesTextPattern(k, p)) : isTextKey(p);
          expect(ok, `${name}: ${p}`).toBe(true);
        }
      }
    });
    it('every checkout and order key in the registry is covered by some block\'s text', () => {
      const patterns = Object.values(BLOCKS).flatMap((b) => b.text ?? []);
      const uncovered = Object.keys(TEXT_ENTRIES).filter((k) => /^(checkout|order)\./.test(k) && !TEXT_ENTRIES[k]!.fixed && !patterns.some((p) => matchesTextPattern(k, p)));
      expect(uncovered).toEqual([]);
    });
  });
});
