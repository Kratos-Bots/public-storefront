import { describe, expect, it } from 'vitest';
import { buildDefaultTable } from '@/builder/defaults/index.ts';
import type { PuckDoc } from '@/builder/types.ts';
import { toPageSet } from '@/api/pages.ts';

const empty: PuckDoc = { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [] };

describe('buildDefaultTable', () => {
  it('expands "all" to the three layouts', () => {
    const t = buildDefaultTable({ './groups/a.ts': { DEFAULTS: [{ docKey: 'checkout', layouts: 'all', doc: empty }] } });
    expect([...t.keys()].sort()).toEqual(['menu|checkout', 'storefront|checkout', 'webapp|checkout']);
  });
  it('refuses two defaults for the same key', () => {
    expect(() => buildDefaultTable({
      './groups/a.ts': { DEFAULTS: [{ docKey: 'cart', layouts: ['menu'], doc: empty }] },
      './groups/b.ts': { DEFAULTS: [{ docKey: 'cart', layouts: 'all', doc: empty }] },
    })).toThrow(/menu\|cart/);
  });
});

describe('toPageSet', () => {
  it('accepts only a schema-1 set', () => {
    expect(toPageSet(null)).toBeNull();
    expect(toPageSet({ version: 3, data: { schemaVersion: 2, shell: {}, pages: {} } })).toBeNull();
    expect(toPageSet({ version: 3, data: { schemaVersion: 1, shell: empty, pages: {} } })).toEqual({ schemaVersion: 1, shell: empty, pages: {} });
  });
});
