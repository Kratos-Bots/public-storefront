import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BLOCKS } from '@/builder/registry.ts';
import { checkRules } from '@/builder/rules.ts';
import { FAMILY_DOCS, type PartFamily } from '@/builder/parts.ts';
import { BOX, TEXT, VIS, type StyleKey, type StyleTarget } from '@/builder/style/model.ts';
import type { ComponentData, LayoutKind, PuckDoc } from '@/builder/types.ts';
import { cssRules } from './helpers/css-rules.ts';
import { STAGE4_PARTS } from './helpers/stage4-parts.ts';
import { STAGE5_PARTS } from './helpers/stage5-parts.ts';

const T = (target: StyleTarget, ...groups: ReadonlyArray<readonly StyleKey[]>) => ({ target, keys: groups.flat() });
/** Spec §9, exactly. Keys may be added later, never removed. */
const PARTS: Record<string, { family: PartFamily; style: { target: StyleTarget; keys: readonly StyleKey[] } }> = {
  ProductBreadcrumbs: { family: 'product', style: T('root', BOX, TEXT, VIS) },
  ProductGallery: { family: 'product', style: T('root', BOX, VIS) },
  ProductTitle: { family: 'product', style: T('root', BOX, TEXT) },
  ProductPrice: { family: 'product', style: T('root', BOX, TEXT) },
  ProductStock: { family: 'product', style: T('root', BOX, TEXT, VIS) },
  ProductAddToCart: { family: 'product', style: T('root', BOX) },
  ProductDescription: { family: 'product', style: T('root', BOX, TEXT, VIS) },
  ProductBulkPricing: { family: 'product', style: T('root', BOX, TEXT, VIS) },
  ProductProvenance: { family: 'product', style: T('root', BOX, TEXT, VIS) },
  ProductAsk: { family: 'product', style: T('root', BOX, TEXT, VIS) },
  ProductUpsells: { family: 'product', style: T('root', BOX, VIS) },
  ProductGroup: { family: 'product', style: T('root', BOX, ['align'], VIS) },
  CatalogIntro: { family: 'catalogue', style: T('wrap', BOX, VIS) },
  CatalogSearch: { family: 'catalogue', style: T('root', BOX, VIS) },
  CatalogCategories: { family: 'catalogue', style: T('pass', BOX, VIS) },
  CatalogTitle: { family: 'catalogue', style: T('root', BOX, TEXT) },
  CatalogResults: { family: 'catalogue', style: T('wrap', BOX) },
  CatalogEmpty: { family: 'catalogue', style: T('root', BOX, TEXT) },
  CardTileImage: { family: 'card-tile', style: T('root', BOX, VIS) },
  CardTileGroup: { family: 'card-tile', style: T('root', BOX, ['align'], VIS) },
  CardTileName: { family: 'card-tile', style: T('root', BOX, TEXT) },
  CardTileFlags: { family: 'card-tile', style: T('root', BOX, TEXT, VIS) },
  CardTilePrice: { family: 'card-tile', style: T('root', BOX, TEXT, VIS) },
  CardTileAdd: { family: 'card-tile', style: T('root', BOX, VIS) },
  CardRowGroup: { family: 'card-row', style: T('root', BOX, ['align'], VIS) },
  CardRowName: { family: 'card-row', style: T('root', BOX, TEXT) },
  CardRowMeta: { family: 'card-row', style: T('root', BOX, TEXT, VIS) },
  CardRowPrice: { family: 'card-row', style: T('root', BOX, TEXT, VIS) },
  CardRowAdd: { family: 'card-row', style: T('root', BOX, VIS) },
};
const CONTAINERS = ['ProductDetail', 'ProductGrid', 'ProductList', 'CardTile', 'CardRow'];
/** Where each TEXT-offering part's view reads the variables. */
const PART_CSS: Record<string, string[]> = {
  ProductBreadcrumbs: ['ProductDetailPage'], ProductTitle: ['ProductDetailPage', 'ProductDetailSheet'], ProductPrice: ['ProductDetailPage', 'ProductDetailSheet'],
  ProductStock: ['ProductDetailPage', 'ProductDetailSheet'], ProductDescription: ['ProductDetailPage', 'ProductDetailSheet'],
  ProductBulkPricing: ['ProductDetailPage', 'ProductDetailSheet'], ProductProvenance: ['ProductDetailPage', 'ProductDetailSheet'], ProductAsk: ['ProductDetailPage', 'ProductDetailSheet'],
  CatalogTitle: ['ProductGrid', 'ProductList'], CatalogEmpty: ['../../components/EmptyState'],
  CardTileName: ['ProductCard'], CardTileFlags: ['ProductCard'], CardTilePrice: ['ProductCard'],
  CardRowName: ['ProductRow'], CardRowMeta: ['ProductRow'], CardRowPrice: ['ProductRow'],
};
const sameKeys = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join();

describe('parts contract (spec §9, §13)', () => {
  it('the registered parts are exactly the stage 3 table, STAGE4_PARTS and STAGE5_PARTS', () => {
    const expected = new Set([...Object.keys(PARTS), ...Object.keys(STAGE4_PARTS), ...Object.keys(STAGE5_PARTS)]);
    expect(Object.values(BLOCKS).filter((x) => x.part).map((d) => d.name).sort()).toEqual([...expected].sort());
  });
  it.each(Object.keys(PARTS))('%s: family, target and keys', (name) => {
    const def = BLOCKS[name]!;
    expect(def.part).toEqual({ family: PARTS[name]!.family });
    expect(def.container).toBeUndefined();
    expect(def.category).toBe('part');
    expect(def.style && def.style.target).toBe(PARTS[name]!.style.target);
    expect(sameKeys(def.style ? def.style.keys : [], PARTS[name]!.style.keys)).toBe(true);
  });
  it.each(Object.keys(STAGE4_PARTS))('%s (stage 4): family, target and keys', (name) => {
    const def = BLOCKS[name]!;
    expect(def.part).toEqual({ family: STAGE4_PARTS[name]!.family });
    expect(def.container).toBeUndefined();
    expect(def.category).toBe('part');
    expect(def.style && def.style.target).toBe(STAGE4_PARTS[name]!.style.target);
    expect(sameKeys(def.style ? def.style.keys : [], STAGE4_PARTS[name]!.style.keys)).toBe(true);
  });
  it('every part whose spec declares TEXT reach declares the site-text keys it renders', () => {
    // These render product data only (a name, a price): no useText call, so no site-text keys to declare.
    const DATA_ONLY = new Set(['ProductTitle', 'CardTileName', 'CardTilePrice', 'CardRowName', 'CardRowPrice']);
    const missing = Object.entries(PARTS)
      .filter(([, spec]) => TEXT.every((k) => spec.style.keys.includes(k)))
      .filter(([name]) => !DATA_ONLY.has(name))
      .filter(([name]) => !(BLOCKS[name]!.text && BLOCKS[name]!.text!.length > 0))
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });
  it('stage-4 families with TEXT parts read --sf-block-fg and --sf-text-scale in their view CSS', () => {
    const FAMILY_CSS: Partial<Record<PartFamily, string[]>> = {
      cart: ['cart/CartPage'], 'cart-summary': ['cart/CartSummary'], account: ['account/Account'], orders: ['account/Account'], order: ['account/Account'],
      loyalty: ['account/Account'], referrals: ['account/Account'], profile: ['account/Account'], login: ['auth/LoginPage'],
      payment: ['payment-redirect/PaymentRedirect'], tracking: ['tracking/Tracking'], verify: ['verify/VerifyPage'],
    };
    const families = new Set(Object.values(STAGE4_PARTS).filter((s) => TEXT.every((k) => s.style.keys.includes(k))).map((s) => s.family));
    for (const family of families) {
      const files = FAMILY_CSS[family];
      expect(files, family).toBeDefined();
      const rules = files!.flatMap((f) => cssRules(readFileSync(resolve(__dirname, `../src/features/${f}.module.css`), 'utf8')));
      expect(rules.some((r) => /var\(--sf-block-fg,/.test(r.body)), `${family} fg`).toBe(true);
      expect(rules.some((r) => /var\(--sf-text-scale, 1\)/.test(r.body)), `${family} textSize`).toBe(true);
    }
  });
  it('required parts accept no hide; no part holding an input accepts textSize', () => {
    for (const c of CONTAINERS) for (const r of BLOCKS[c]!.container!.required) expect((BLOCKS[r]!.style || { keys: [] }).keys, r).not.toContain('hide');
    for (const n of ['CatalogSearch', 'ProductAddToCart', 'CardTileAdd', 'CardRowAdd']) expect((BLOCKS[n]!.style || { keys: [] }).keys, n).not.toContain('textSize');
  });
  it('TEXT parts read --sf-block-fg and --sf-text-scale in their views\' CSS', () => {
    for (const [name, files] of Object.entries(PART_CSS)) {
      const rules = files.flatMap((f) => cssRules(readFileSync(resolve(__dirname, `../src/features/catalog/${f}.module.css`), 'utf8')));
      expect(rules.some((r) => /color:\s*var\(--sf-block-fg,/.test(r.body)), `${name} fg`).toBe(true);
      expect(rules.some((r) => /font-size:\s*calc\([^;]*var\(--sf-text-scale, 1\)/.test(r.body)), `${name} textSize`).toBe(true);
    }
  });
  it.each(CONTAINERS)('%s: a ContainerSpec whose defaults pass its own rules in every layout', (name) => {
    const def = BLOCKS[name]!;
    expect(def.container).toBeDefined();
    expect(def.part).toBeUndefined();
    for (const layout of ['storefront', 'menu', 'webapp'] as LayoutKind[]) {
      const id = `${name}-contract`;
      const item: ComponentData = { type: name, props: { id, ...def.container!.defaultSlots({}, { layout, id }) } };
      const doc: PuckDoc = { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [item] };
      // The container's home document (FAMILY_DOCS[family][0]; ledger CARRY: never the old FAMILY_DOC).
      expect(checkRules(doc, FAMILY_DOCS[def.container!.family][0]!, layout), `${name} ${layout}`).toEqual([]);
      const ids = JSON.stringify(item).match(/"id":"([^"]+)"/g)!.map((s) => s.slice(6, -1));
      expect(ids.every((i) => i.length <= 64)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it('every part and every container slot is reachable: legacy props are schema keys', () => {
    const pd = BLOCKS.ProductDetail!;
    for (const k of pd.container!.legacyProps ?? []) expect(Object.keys((pd.schema as unknown as { shape: object }).shape)).toContain(k);
  });
});
