import { describe, expect, it } from 'vitest';
import { BLOCKS } from '@/builder/registry.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { validateDoc } from '@/builder/guard.ts';
import { allowedOn, checkRules, countBlocks } from '@/builder/rules.ts';
import { FIXED_ROUTE_KEYS, isRecord, type ComponentData, type DocKey, type LayoutKind } from '@/builder/types.ts';

const LAYOUTS: LayoutKind[] = ['storefront', 'menu', 'webapp'];
const KEYS: DocKey[] = ['shell', ...FIXED_ROUTE_KEYS];
// Controller ruling F1 (Task 9): the catalogue list blocks are route-bound too — a broken grid takes the page to its default.
const ROUTE_BLOCKS = ['PageOutlet', 'ProductGrid', 'ProductList', 'WholesaleTable', 'ProductDetail', 'CartContents', 'CartSummary', 'CheckoutFlow', 'LoginOptions', 'OrdersList', 'OrderDetail',
  'Loyalty', 'Referrals', 'Profile', 'PaymentSuccess', 'PaymentCancel', 'OrderPlaced', 'VerifyForm', 'TrackingLookup', 'ResetPassword', 'VerifyEmail', 'CardTile', 'CardRow'];

function ids(items: ComponentData[], out: string[] = []): string[] {
  for (const c of items) {
    out.push(c.props.id);
    for (const s of BLOCKS[c.type]!.slots) ids(c.props[s] as ComponentData[], out);
  }
  return out;
}

/** The backend treats any {type, props} object inside an array as a component (Plan 1 contract). */
function looksLikeComponent(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(looksLikeComponent);
  if (!isRecord(value)) return false;
  if (typeof value.type === 'string' && isRecord(value.props)) return true;
  return Object.values(value).some(looksLikeComponent);
}

describe('default documents', () => {
  it.each(LAYOUTS)('%s: every route has one, it passes its own rules and survives the guard unchanged', (layout) => {
    for (const key of KEYS) {
      const doc = defaultDoc(key, layout);
      expect(doc, `${layout}/${key}`).not.toBeNull();
      expect(checkRules(doc!, key, layout), `${layout}/${key}`).toEqual([]);
      const guarded = validateDoc(structuredClone(doc), key, layout);
      expect(guarded.issues, `${layout}/${key}`).toEqual([]);
      expect(guarded.doc, `${layout}/${key}`).toEqual(doc);
      const all = ids(doc!.content);
      expect(new Set(all).size, `${layout}/${key} ids`).toBe(all.length);
    }
  });
  it('a shell never holds a MobileCartBar by default (the frame mounts it — v0.6.0 order)', () => {
    for (const layout of LAYOUTS) expect(countBlocks(defaultDoc('shell', layout)!).has('MobileCartBar')).toBe(false);
  });
  it('every default page renders inside the shop chrome in every layout', () => {
    for (const layout of LAYOUTS) for (const key of FIXED_ROUTE_KEYS) expect(defaultDoc(key, layout)!.root.props.chrome, `${layout}/${key}`).toBe('shell');
  });
});

describe('shell rules', () => {
  it('refuses a second phone cart bar (two fixed tabs would stack at the foot)', () => {
    const shell = defaultDoc('shell', 'storefront')!;
    const bar = (id: string): ComponentData => ({ type: 'MobileCartBar', props: { id } });
    expect(checkRules({ ...shell, content: [...shell.content, bar('bar-1')] }, 'shell', 'storefront')).toEqual([]);
    expect(checkRules({ ...shell, content: [...shell.content, bar('bar-1'), bar('bar-2')] }, 'shell', 'storefront').map((i) => i.rule))
      .toEqual(['at-most-one:MobileCartBar']);
  });
});

describe('every block', () => {
  it('round-trips its default props through its schema', () => {
    for (const def of Object.values(BLOCKS)) {
      const parsed = def.schema.safeParse(def.defaultProps);
      expect(parsed.success, def.name).toBe(true);
      expect(parsed.data, def.name).toEqual(def.defaultProps);
    }
  });
  it('is routeBound exactly when it is a §5.3 route block, a catalogue list, PageOutlet or ProductDetail', () => {
    const bound = Object.values(BLOCKS).filter((b) => b.routeBound).map((b) => b.name).sort();
    expect(bound).toEqual([...ROUTE_BLOCKS].sort());
  });
  it('never puts a {type, props} object in a non-slot prop', () => {
    for (const def of Object.values(BLOCKS)) {
      for (const [key, value] of Object.entries(def.defaultProps as Record<string, unknown>)) {
        if ((def.slots as readonly string[]).includes(key)) continue;
        expect(looksLikeComponent(value), `${def.name}.${key}`).toBe(false);
      }
    }
  });
  it('suspends only below a <Suspense>: a block allowed in the shell never lazy-loads (page blocks sit under the outlet\'s boundary)', () => {
    // Every routed page renders inside PageOutlet's <main> (or Chromeless) whose <Outlet/> is wrapped
    // in <Suspense>; the shell document itself has no boundary above it, so it must never suspend.
    const sources = import.meta.glob<string>('/src/builder/blocks/*.tsx', { query: '?raw', import: 'default', eager: true });
    for (const def of Object.values(BLOCKS)) {
      if (!allowedOn(def.name, 'shell')) continue;
      const source = sources[`/src/builder/blocks/${def.name}.tsx`];
      expect(source, def.name).toBeTypeOf('string');
      expect(source, def.name).not.toMatch(/\blazy\(/);
    }
  });
  it('names richtext props *Html and keeps them strings', () => {
    for (const def of Object.values(BLOCKS)) {
      for (const [key, value] of Object.entries(def.defaultProps as Record<string, unknown>)) {
        if (key.endsWith('Html')) expect(typeof value, `${def.name}.${key}`).toBe('string');
      }
    }
  });
});
