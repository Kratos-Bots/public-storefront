import { describe, expect, it } from 'vitest';
import type { Fields } from '@puckeditor/core';
import { BLOCKS } from '@/builder/registry.ts';
import { allowedOn } from '@/builder/rules.ts';
import { insertableBlocks } from '@/builder/editor/route-bound.ts';
import { FIXED_ROUTE_KEYS, type DocKey } from '@/builder/types.ts';
import { schemaKeys, scopeFields, slotAllowEverywhere, slotAllowFor } from '@/builder/editor/derive-fields.ts';

const modules = import.meta.glob<{ fields: Fields }>('../src/builder/editor/fields/*.ts', { eager: true });
const byName = Object.fromEntries(Object.entries(modules).map(([path, m]) => [path.slice(path.lastIndexOf('/') + 1, -3), m.fields]));

type AnyField = { type: string; [k: string]: unknown };
const field = (name: string, key: string) => byName[name]![key] as unknown as AnyField;
const ALL_DOCS: DocKey[] = ['shell', ...FIXED_ROUTE_KEYS, 'page:about'];

describe('per-block editor fields', () => {
  it('has exactly one fields file per registered block', () => {
    expect(Object.keys(byName).sort()).toEqual(Object.keys(BLOCKS).sort());
  });

  it.each(Object.keys(BLOCKS))('%s: every schema key and slot has a field', (name) => {
    const def = BLOCKS[name]!;
    for (const key of [...schemaKeys(def), ...def.slots]) expect(byName[name], `${name}.${key}`).toHaveProperty(key);
  });

  it.each(Object.keys(BLOCKS))('%s: slots are slot fields', (name) => {
    for (const slot of BLOCKS[name]!.slots) expect(byName[name]![slot]).toMatchObject({ type: 'slot' });
  });

  it.each(Object.keys(BLOCKS))('%s: slots only accept blocks every doc and layout of the block accepts', (name) => {
    const def = BLOCKS[name]!;
    const homes = ALL_DOCS.filter((k) => allowedOn(name, k));
    const layouts = (['storefront', 'menu', 'webapp'] as const).filter((l) => def.layouts === 'all' || def.layouts.includes(l));
    for (const slot of def.slots) {
      const allow = field(name, slot).allow as string[];
      expect(allow).toEqual(slotAllowFor(name));
      for (const child of allow) {
        for (const k of homes) expect(allowedOn(child, k), `${name}.${slot} ← ${child} on ${k}`).toBe(true);
        for (const l of layouts) expect(insertableBlocks(homes[0]!, l), `${child} in ${l}`).toContain(child);
      }
    }
  });

  it('static slot lists: anywhere-blocks get the everywhere list, route blocks their route\'s own blocks', () => {
    for (const n of ['Section', 'Columns']) expect(slotAllowFor(n)).toEqual(slotAllowEverywhere());
    expect(field('CartContents', 'summary').allow).toContain('CartSummary');
    expect(field('Header', 'nav').allow).toContain('NavLinks');
    expect(field('Section', 'content').allow).not.toContain('CartSummary');
    // AccountNav spans five account docs: each doc's route block needs scopeFields.
    expect(field('AccountNav', 'body').allow).not.toContain('OrdersList');
    expect((scopeFields('AccountNav', byName.AccountNav!, 'account.orders', 'storefront').body as unknown as AnyField).allow).toContain('OrdersList');
  });

  it('the static slot allow list is exactly the blocks no doc or layout refuses', () => {
    const allow = slotAllowEverywhere();
    expect(allow.length).toBeGreaterThan(0);
    for (const def of Object.values(BLOCKS)) {
      const everywhere = def.layouts === 'all' && ALL_DOCS.every((k) => allowedOn(def.name, k));
      expect(allow.includes(def.name), def.name).toBe(everywhere);
    }
    for (const n of ['PageOutlet', 'Header', 'Footer', 'ProductGrid', 'CheckoutFlow', 'AccountNav']) expect(allow).not.toContain(n);
    for (const n of ['Heading', 'RichText', 'Button', 'Section', 'NavLinks']) expect(allow).toContain(n);
  });

  it('scopeFields widens slot allow lists to what the doc accepts in the layout', () => {
    const catalog = scopeFields('Section', byName.Section!, 'catalog', 'storefront');
    expect((catalog.content as unknown as AnyField).allow).toEqual(insertableBlocks('catalog', 'storefront'));
    expect((catalog.content as unknown as AnyField).allow).toContain('ProductGrid');
    const about = scopeFields('Section', byName.Section!, 'page:about', 'storefront');
    expect((about.content as unknown as AnyField).allow).not.toContain('ProductGrid');
    // Non-slot fields pass through untouched.
    expect(catalog.padding).toBe(byName.Section!.padding);
  });

  it('scopeFields offers each Header variant only in a layout that renders it', () => {
    const values = (layout: 'storefront' | 'menu' | 'webapp') =>
      ((scopeFields('Header', byName.Header!, 'shell', layout).variant as unknown as { options: Array<{ value: string }> }).options).map((o) => o.value);
    expect(values('webapp')).toEqual(['auto', 'menu', 'webapp']);
    expect(values('storefront')).toEqual(['auto', 'storefront', 'menu']);
    expect(values('menu')).toEqual(['auto', 'storefront', 'menu']);
    // The static (layout-agnostic) field still offers every value the schema accepts.
    expect((field('Header', 'variant').options as Array<{ value: string }>).map((o) => o.value)).toEqual(['auto', 'storefront', 'menu', 'webapp']);
  });

  it('FeaturedProducts: a new picked row carries no product id until one is picked', () => {
    const items = field('FeaturedProducts', 'items');
    expect(items).toMatchObject({ type: 'array', max: 24, arrayFields: { productId: { type: 'external' } } });
    expect(items.defaultItemProps).toEqual({});
    const summary = items.getItemSummary as (row: Record<string, unknown>, i?: number) => unknown;
    expect(summary({}, 0)).toBe('Pick a product');
    expect(summary({ productId: 7 }, 0)).toBe('Product #7');
    expect(field('FeaturedProducts', 'categoryId')).toMatchObject({ type: 'external' });
  });

  it('maps the named props to their custom fields', () => {
    expect(field('Divider', 'toneToken')).toMatchObject({ type: 'custom', label: 'Tone' });
    expect(field('Section', 'backgroundToken')).toMatchObject({ type: 'custom' });
    expect(field('Section', 'textToken')).toMatchObject({ type: 'custom' });
    expect(field('NavLinks', 'items')).toMatchObject({ type: 'array', max: 12, arrayFields: { label: { type: 'text' }, href: { type: 'custom' } } });
    expect(field('FAQ', 'items')).toMatchObject({ type: 'array', arrayFields: { answerHtml: { type: 'richtext' } } });
    expect(field('Upsells', 'productId')).toMatchObject({ type: 'external' });
    expect(field('Video', 'provider')).toMatchObject({ type: 'radio' });
    expect(field('Video', 'videoId')).toMatchObject({ type: 'text', label: 'Video ID' });
  });

  it('no non-slot array field can emit a row shaped like a component', () => {
    for (const [name, fields] of Object.entries(byName)) {
      for (const [key, f] of Object.entries(fields)) {
        const af = f as unknown as AnyField;
        if (af.type !== 'array') continue;
        const cols = Object.keys(af.arrayFields as object);
        expect(cols.includes('type') && cols.includes('props'), `${name}.${key}`).toBe(false);
      }
    }
  });
});

describe('the Style group (block-styling spec §9.1)', () => {
  it.each(Object.keys(BLOCKS))('%s: fields end with blockStyle exactly when the block is stylable', (name) => {
    const keys = Object.keys(byName[name]!);
    if (BLOCKS[name]!.style) expect(keys.at(-1)).toBe('blockStyle');
    else expect(keys).not.toContain('blockStyle');
  });
  it('blockStyle is a custom field and is never a schema key', () => {
    expect(byName.Heading!.blockStyle).toMatchObject({ type: 'custom', label: 'Style' });
    for (const def of Object.values(BLOCKS)) expect(schemaKeys(def)).not.toContain('blockStyle');
  });
});
