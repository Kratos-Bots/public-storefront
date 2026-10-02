import { describe, expect, it } from 'vitest';
import { BLOCKS } from '@/builder/registry.ts';
import { allowedOn, checkRules } from '@/builder/rules.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { homeDocKeys, insertableBlocks, isLockedOn, ROUTE_BOUND } from '@/builder/editor/route-bound.ts';
import { FIXED_ROUTE_KEYS, type CardKey, type ComponentData, type DocKey, type FixedRouteKey, type PuckDoc } from '@/builder/types.ts';

function strip(content: ComponentData[], names: ReadonlySet<string>): ComponentData[] {
  return content
    .filter((c) => !names.has(c.type))
    .map((c) => ({
      ...c,
      props: Object.fromEntries(Object.entries(c.props).map(([k, v]) => [k, Array.isArray(v) && v.every((x) => x && typeof x === 'object' && 'type' in x) ? strip(v as ComponentData[], names) : v])) as ComponentData['props'],
    }));
}

describe('route-bound table mirrors the renderer', () => {
  it('names exactly the blocks Plan 2 flags routeBound', () => {
    const inTable = new Set(Object.values(ROUTE_BOUND).flatMap((e) => e.blocks));
    const flagged = new Set(Object.values(BLOCKS).filter((d) => d.routeBound).map((d) => d.name));
    expect([...inTable].sort()).toEqual([...flagged].sort());
  });

  it.each(Object.entries(ROUTE_BOUND))('%s: removing its required blocks breaks the rules', (key, entry) => {
    const layout = 'storefront'; // the only layout with every fixed route (product is storefront-only)
    const doc = defaultDoc(key as DocKey, layout)!;
    expect(checkRules(doc, key as DocKey, layout)).toEqual([]);
    const broken: PuckDoc = { ...doc, content: strip(doc.content, new Set(entry.blocks)) };
    expect(checkRules(broken, key as DocKey, layout).length).toBeGreaterThan(0);
  });

  it('a custom page may not hold any route-bound block', () => {
    for (const name of Object.values(ROUTE_BOUND).flatMap((e) => e.blocks)) {
      const doc: PuckDoc = { root: { props: { title: 'x', description: '', chrome: 'shell' } }, content: [{ type: name, props: { id: `${name}-1`, ...BLOCKS[name]!.defaultProps } }] };
      expect(checkRules(doc, 'page:about', 'storefront').length, name).toBeGreaterThan(0);
    }
  });
});

describe('editor placement rules', () => {
  it('locks exactly-one blocks on their own route only', () => {
    expect(isLockedOn('CheckoutFlow', 'checkout')).toBe(true);
    expect(isLockedOn('CartContents', 'cart')).toBe(true);
    expect(isLockedOn('PageOutlet', 'shell')).toBe(true);
    expect(isLockedOn('ProductGrid', 'catalog')).toBe(false);
    expect(isLockedOn('Heading', 'checkout')).toBe(false);
    expect(isLockedOn('CheckoutFlow', 'cart')).toBe(false);
  });

  it('offers route-bound blocks only on their home route', () => {
    expect(homeDocKeys('OrderDetail')).toEqual(['account.order']);
    expect(insertableBlocks('checkout', 'storefront')).toContain('CheckoutFlow');
    expect(insertableBlocks('cart', 'storefront')).not.toContain('CheckoutFlow');
    expect(insertableBlocks('page:about', 'storefront')).not.toContain('ProductGrid');
    expect(insertableBlocks('page:about', 'storefront')).toContain('Heading');
    expect(insertableBlocks('catalog', 'storefront')).not.toContain('PageOutlet');
  });

  it('never offers a block that would raise a placement issue (F3: plan 2 allowedOn)', () => {
    const keys: DocKey[] = ['shell', ...FIXED_ROUTE_KEYS, 'page:about'];
    for (const layout of ['storefront', 'menu', 'webapp'] as const) {
      for (const key of keys) {
        for (const name of insertableBlocks(key, layout)) expect(allowedOn(name, key), `${name}@${key}`).toBe(true);
      }
    }
    // shell chrome stays in the shell; AccountNav stays in account.*
    expect(insertableBlocks('page:about', 'storefront')).not.toContain('Header');
    expect(insertableBlocks('catalog', 'storefront')).not.toContain('MobileCartBar');
    expect(insertableBlocks('shell', 'storefront')).toContain('Header');
    expect(insertableBlocks('shell', 'storefront')).not.toContain('ProductGrid');
    expect(insertableBlocks('page:about', 'storefront')).not.toContain('AccountNav');
    expect(insertableBlocks('account.orders', 'storefront')).toContain('AccountNav');
  });

  it('respects block layouts', () => {
    for (const layout of ['storefront', 'menu', 'webapp'] as const) {
      for (const name of insertableBlocks('page:about', layout)) {
        const l = BLOCKS[name]!.layouts;
        expect(l === 'all' || l.includes(layout), `${name}@${layout}`).toBe(true);
      }
    }
  });

  it('covers the shell and every fixed route', () => {
    const keys: Array<'shell' | FixedRouteKey | CardKey> = ['shell', 'catalog', 'product', 'cart', 'checkout', 'login', 'account.orders', 'account.order', 'account.loyalty', 'account.referrals', 'account.profile', 'order-status', 'payment-success', 'payment-cancel', 'order-placed', 'verify', 'tracking', 'reset-password', 'card:tile', 'card:row'];
    expect(Object.keys(ROUTE_BOUND).sort()).toEqual(keys.sort());
  });
});
