import { describe, expect, it } from 'vitest';
import type { Config } from '@puckeditor/core';
import { blockMenu, buildEditorConfig, editorHints, lockedPresent } from '@/builder/editor/config.ts';
import { prepareProps } from '@/builder/editor/prepare.ts';
import { insertTarget, type InsertApi } from '@/builder/editor/insert-target.ts';
import { familyOfDoc, requiredPartsOn } from '@/builder/editor/route-bound.ts';
import { BLOCK_RULE_RE } from '@/builder/editor/EditorHeader.tsx';
import { defaultDoc } from '@/builder/defaults/index.ts';
import type { ComponentData, DocKey } from '@/builder/types.ts';

const cfg = (docKey: DocKey, layout: 'storefront' | 'menu' = 'storefront') => buildEditorConfig(docKey, layout, lockedPresent(defaultDoc(docKey, layout)!, docKey));
const allow = (c: Config, type: string, slot: string) => (c.components[type]!.fields as Record<string, { allow?: string[] }>)[slot]!.allow!;

describe('route-bound family helpers', () => {
  it('familyOfDoc names the family whose container lives on the doc', () => {
    expect(familyOfDoc('product')).toBe('product');
    expect(familyOfDoc('catalog')).toBe('catalogue');
    expect(familyOfDoc('card:tile')).toBe('card-tile');
    expect(familyOfDoc('card:row')).toBe('card-row');
    expect(familyOfDoc('cart')).toBeNull();
    expect(familyOfDoc('page:about')).toBeNull();
  });
  it('requiredPartsOn collects the required parts of every container on the doc, per layout', () => {
    expect([...requiredPartsOn('product', 'storefront')].sort()).toEqual(['ProductAddToCart', 'ProductPrice', 'ProductTitle']);
    expect([...requiredPartsOn('product', 'menu')].sort()).toEqual(['ProductPrice', 'ProductTitle']);
    expect([...requiredPartsOn('catalog', 'storefront')].sort()).toEqual(['CatalogEmpty', 'CatalogResults', 'CatalogTitle']);
    expect([...requiredPartsOn('cart', 'storefront')]).toEqual([]);
  });
});

describe('palette (spec §11)', () => {
  it('parts show only on the doc where their family container lives, titled per family, first', () => {
    const product = blockMenu('product', 'storefront', new Set(['ProductDetail']));
    expect(product[0]).toMatchObject({ category: 'part', title: 'Product page parts' });
    expect(product[0]!.blocks.map((b) => b.name)).toContain('ProductPrice');
    expect(blockMenu('catalog', 'storefront', new Set()).find((g) => g.category === 'part')!.title).toBe('Catalogue parts');
    expect(blockMenu('page:about', 'storefront', new Set()).some((g) => g.category === 'part')).toBe(false);
    expect(blockMenu('card:tile', 'storefront', new Set(['CardTile']))[0]!.title).toBe('Card parts');
    expect(blockMenu('card:tile', 'storefront', new Set(['CardTile'])).flatMap((g) => g.blocks.map((b) => b.name)).every((n) => n.startsWith('CardTile'))).toBe(true);
  });
  it('ProductAddToCart is not offered in the menu layout', () => {
    expect(blockMenu('product', 'menu', new Set(['ProductDetail'])).flatMap((g) => g.blocks.map((b) => b.name))).not.toContain('ProductAddToCart');
  });
});

describe('allow lists (spec §11, §3.4)', () => {
  it('container slots take the family parts and content, never route blocks or containers', () => {
    const main = allow(cfg('product'), 'ProductDetail', 'main');
    expect(main).toEqual(expect.arrayContaining(['ProductPrice', 'ProductGroup', 'RichText', 'Section', 'Upsells', 'FeaturedProducts']));
    expect(main).not.toContain('ProductDetail');
    expect(main).not.toContain('CardTileName');
  });
  it('the grid rail takes only CatalogCategories', () => {
    expect(allow(cfg('catalog'), 'ProductGrid', 'rail')).toEqual(['CatalogCategories']);
  });
  it('a Section on the product doc accepts product parts too', () => {
    expect(allow(cfg('product'), 'Section', 'content')).toContain('ProductPrice');
  });
  it('card docs: frame and group slots take only the family parts', () => {
    const c = cfg('card:tile');
    expect(allow(c, 'CardTile', 'content').every((n) => n.startsWith('CardTile') && n !== 'CardTile')).toBe(true);
    expect(allow(c, 'CardTileGroup', 'items')).not.toContain('Heading');
  });
});

describe('locks and root fields', () => {
  it('required parts cannot be deleted or duplicated; optional parts cannot be duplicated', () => {
    const c = cfg('product');
    expect(c.components.ProductPrice!.permissions).toEqual({ delete: false, duplicate: false });
    expect(c.components.ProductAddToCart!.permissions).toEqual({ delete: false, duplicate: false });
    expect(c.components.ProductDescription!.permissions).toEqual({ duplicate: false });
    expect(cfg('product', 'menu').components.ProductTitle!.permissions).toEqual({ delete: false, duplicate: false });
    expect(cfg('card:tile').components.CardTileName!.permissions).toEqual({ delete: false, duplicate: false });
    expect(cfg('card:tile').components.CardTile!.permissions).toEqual({ delete: false, duplicate: false });
  });
  it('card docs and the menu product sheet have no page settings', () => {
    expect(cfg('card:tile').root!.fields).toEqual({});
    expect(cfg('product', 'menu').root!.fields).toEqual({});
    expect(Object.keys(cfg('product').root!.fields!)).toEqual(['title', 'description', 'chrome']);
  });
  it('a container inserted from the drawer gets its default arrangement', async () => {
    const resolve = cfg('catalog').components.ProductGrid!.resolveData!;
    const out = await resolve({ props: { id: 'g9', top: [], rail: [], main: [] } } as never, { trigger: 'insert' } as never);
    expect(((out as { props: Record<string, unknown> }).props.main as ComponentData[]).map((c) => c.type)).toEqual(['CatalogTitle', 'CatalogEmpty', 'CatalogResults']);
    const kept = await resolve({ props: { id: 'g9', top: [], rail: [], main: [] } } as never, { trigger: 'load' } as never);
    expect((kept as { props: Record<string, unknown> }).props.main).toEqual([]);
  });
  it('a ProductDetail inserted from the drawer gets the layout\'s arrangement, so no part-required issue', async () => {
    const resolve = cfg('product').components.ProductDetail!.resolveData!;
    const out = await resolve({ props: { id: 'pd', top: [], media: [], main: [], below: [] } } as never, { trigger: 'insert' } as never);
    const props = (out as { props: Record<string, unknown> }).props;
    expect((props.main as ComponentData[]).map((c) => c.type)).toContain('ProductAddToCart');
    expect((props.top as ComponentData[]).map((c) => c.type)).toEqual(['ProductBreadcrumbs']);
    expect(props.id).toBe('pd');
  });
});

describe('fields and emitted props (spec §8)', () => {
  it('legacy props are not fields', () => {
    expect(Object.keys(cfg('product').components.ProductDetail!.fields!)).not.toContain('gallery');
  });
  it('prepareProps drops legacy props only once every slot is present, and never touches slots', () => {
    const partial = { id: 'd', gallery: false, main: [] };
    expect(prepareProps('ProductDetail', partial)).toBe(partial);
    const full = { id: 'd', gallery: false, bulkPricing: true, top: [], media: [], main: [], below: [] };
    expect(prepareProps('ProductDetail', full)).toEqual({ id: 'd', top: [], media: [], main: [], below: [] });
    const clean = { id: 'd', top: [], media: [], main: [], below: [] };
    expect(prepareProps('ProductDetail', clean)).toBe(clean);
  });
});

describe('Add block with nothing selected inside the container (spec §11)', () => {
  const grid: ComponentData = { type: 'ProductGrid', props: { id: 'g', top: [], rail: [], main: [{ type: 'CatalogTitle', props: { id: 't' } }] } };
  const api = (sel: InsertApi['appState']['ui']['itemSelector']): InsertApi => ({
    config: cfg('catalog'),
    appState: { ui: { itemSelector: sel }, data: { content: [{ type: 'Heading', props: { id: 'h' } }, grid] } },
    getItemById: (id: string) => (id === 'g' ? grid : undefined),
    getParentById: () => undefined,
    getSelectorForId: (id: string) => (id === 'h' ? { index: 0, zone: 'root:default-zone' } : { index: 1, zone: 'root:default-zone' }),
  } as unknown as InsertApi);
  it('nothing selected → end of the container insert slot', () => {
    expect(insertTarget(api(null), 'CatalogSearch')).toEqual({ zone: 'g:main', index: 1, nested: true });
  });
  it('a root block selected → still the container, never the root', () => {
    expect(insertTarget(api({ index: 0, zone: 'root:default-zone' }), 'CatalogSearch')).toEqual({ zone: 'g:main', index: 1, nested: true });
  });
  it('a part selected inside the container → right after it', () => {
    expect(insertTarget(api({ index: 0, zone: 'g:main' }), 'CatalogSearch')).toEqual({ zone: 'g:main', index: 1, nested: true });
  });
  it('a content block keeps today\'s behaviour', () => {
    expect(insertTarget(api(null), 'Heading')).toEqual({ zone: 'root:default-zone', index: 2, nested: false });
  });
});

describe('hints', () => {
  it('double intro looks for a CatalogIntro part in a list container whose intro is not hidden', () => {
    const doc = { root: { props: { title: '', description: '', chrome: 'shell' as const } }, content: [
      { type: 'CatalogHero', props: { id: 'h', variant: 'custom' } },
      { type: 'ProductList', props: { id: 'l', intro: 'inherit', content: [{ type: 'CatalogTitle', props: { id: 't' } }] } },
    ] };
    expect(editorHints(doc, 'catalog').some((h) => h.id === 'double-intro')).toBe(false);
    (doc.content[1]!.props.content as ComponentData[]).push({ type: 'CatalogIntro', props: { id: 'i' } });
    expect(editorHints(doc, 'catalog').some((h) => h.id === 'double-intro')).toBe(true);
    (doc.content[1]!.props as Record<string, unknown>).intro = 'hide';
    expect(editorHints(doc, 'catalog').some((h) => h.id === 'double-intro')).toBe(false);
  });
});

describe('issue names in the header (ledger CARRY)', () => {
  it('part and slot rule ids name their block', () => {
    const name = (rule: string) => BLOCK_RULE_RE.exec(rule)?.[1];
    expect(name('part-required:ProductDetail.ProductTitle')).toBe('ProductDetail');
    expect(name('part-unique:ProductGrid.CatalogSearch')).toBe('ProductGrid');
    expect(name('part-requires:CardTileAdd.CardTilePrice')).toBe('CardTileAdd');
    expect(name('part-placement:ProductPrice')).toBe('ProductPrice');
    expect(name('slot-accepts:ProductGrid.rail')).toBe('ProductGrid');
    expect(name('hidden-required:Section')).toBe('Section');
    expect(name('placement:CartSummary')).toBe('CartSummary');
    expect(name('limit:title')).toBeUndefined();
  });
});
