import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Suspense } from 'react';
import type { Catalog } from '@/types/catalog.ts';
import type { StorefrontSettings } from '@/types/settings.ts';
import { catalogOf, FULL, LEGACY_TOGGLES, MATE, SETTINGS, toggleName } from './helpers/product-fixtures.ts';
import { expectGolden } from './helpers/golden.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings, catalog: undefined as Catalog | undefined, showSku: true }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => ({ data: state.catalog, isPending: false, isError: false, refetch: () => {} }),
  useProduct: (id: number | null) => ({
    data: id == null ? undefined : state.catalog?.products.find((p) => p.id === id), isPending: false, isError: false, refetch: () => {},
  }),
}));
vi.mock('@/templates/hooks.ts', async (orig) => {
  const real = await orig<typeof import('@/templates/hooks.ts')>();
  return { ...real, useCoreOptions: () => ({ ...real.useCoreOptions(), showSku: state.showSku }) };
});

import { RenderDoc } from '@/builder/render.tsx';
import { validateDoc } from '@/builder/guard.ts';
import { checkRules } from '@/builder/rules.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { upgradeDoc } from '@/builder/upgrade.ts';
import { BLOCKS } from '@/builder/registry.ts';
import { group, part } from '@/builder/parts.ts';
import type { ComponentData, LayoutKind, PuckDoc } from '@/builder/types.ts';
import classes from '@/features/catalog/ProductDetailPage.module.css';

afterEach(() => { cleanup(); state.showSku = true; });

function renderDoc(doc: PuckDoc, path = '/p/1', layout: LayoutKind = 'storefront') {
  return render(
    <QueryClientProvider client={new QueryClient()}><MantineProvider env="test"><MemoryRouter initialEntries={[path]}><Routes>
      <Route path="/p/:id" element={<Suspense fallback={null}><RenderDoc doc={doc} docKey="product" layout={layout} /></Suspense>} />
    </Routes></MemoryRouter></MantineProvider></QueryClientProvider>,
  );
}
const legacyDoc = (t: Record<string, boolean>): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } },
  content: [{ type: 'ProductDetail', props: { id: 'ProductDetail-default', ...t, sku: 'inherit' } }] });
const slotDoc = (slots: Record<string, ComponentData[]>): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } },
  content: [{ type: 'ProductDetail', props: { id: 'pd', sku: 'inherit', ...slots } }] });
const p = (type: string, props: Record<string, unknown> = {}): ComponentData => ({ ...part(type, 'pd'), props: { ...part(type, 'pd').props, ...props } });
const richText = (html: string): ComponentData => ({ type: 'RichText', props: { id: 'rt', bodyHtml: html, width: 'narrow' } });
const guarded = (d: PuckDoc, layout: LayoutKind = 'storefront'): PuckDoc => {
  const r = validateDoc(d, 'product', layout);
  expect(r.issues.filter((i) => !i.rule.startsWith('drop:'))).toEqual([]);
  return r.doc!;
};
const sfDefault = (layout: LayoutKind = 'storefront') => structuredClone(defaultDoc('product', layout)!);
const detail = (d: PuckDoc) => d.content[0]!;
const slotOf = (d: PuckDoc, s: string) => detail(d).props[s] as ComponentData[];
const rules = (d: PuckDoc, layout: LayoutKind = 'storefront') => checkRules(d, 'product', layout).map((i) => i.rule);
const types = (items: unknown) => (items as ComponentData[]).map((c) => c.type);
const setup = (photo = true) => {
  state.settings = SETTINGS;
  state.catalog = catalogOf(photo ? FULL : { ...FULL, imageProductId: null }, MATE);
};

describe('golden legacy documents (spec §12)', () => {
  it.each(LEGACY_TOGGLES.flatMap((t) => [true, false].map((photo) => ({ t, photo }))))('$t.gallery $t.bulkPricing $t.provenance $t.upsells photo=$photo', async ({ t, photo }) => {
    setup(photo);
    const { container } = renderDoc(validateDoc(legacyDoc(t), 'product', 'storefront').doc!);
    await screen.findByRole('heading', { level: 1 });
    expectGolden(toggleName(t, photo), container.innerHTML);
  });

  it('the default document renders the all-on golden', async () => {
    setup(true);
    const { container } = renderDoc(defaultDoc('product', 'storefront')!);
    await screen.findByRole('heading', { level: 1 });
    expectGolden('product-legacy-g1b1p1u1-photo', container.innerHTML);
  });
});

describe('upgrade of legacy toggles (spec §8)', () => {
  const up = (t: Record<string, boolean>, layout: LayoutKind) => detail(upgradeDoc(legacyDoc(t), 'product', layout)).props;
  it('all on: the full storefront arrangement', () => {
    const s = up({}, 'storefront');
    expect(types(s.top)).toEqual(['ProductBreadcrumbs']);
    expect(types(s.media)).toEqual(['ProductGallery']);
    expect(types(s.main)).toEqual(['ProductTitle', 'ProductGroup', 'ProductAddToCart', 'ProductDescription', 'ProductBulkPricing', 'ProductProvenance', 'ProductAsk']);
    expect(types((s.main as ComponentData[])[1]!.props.items)).toEqual(['ProductPrice', 'ProductStock']);
    expect(types(s.below)).toEqual(['ProductUpsells']);
  });
  it('gallery: false empties media only', () => {
    const s = up({ gallery: false }, 'storefront');
    expect(s.media).toEqual([]);
    expect(types(s.main)).toContain('ProductBulkPricing');
    expect(types(s.below)).toEqual(['ProductUpsells']);
  });
  it('bulkPricing: false leaves bulk pricing out of main', () => {
    const s = up({ bulkPricing: false }, 'storefront');
    expect(types(s.main)).not.toContain('ProductBulkPricing');
    expect(types(s.main)).toContain('ProductProvenance');
    expect(types(s.media)).toEqual(['ProductGallery']);
  });
  it('provenance: false leaves provenance out of main', () => {
    const s = up({ provenance: false }, 'storefront');
    expect(types(s.main)).not.toContain('ProductProvenance');
    expect(types(s.main)).toContain('ProductBulkPricing');
  });
  it('upsells: false empties below only', () => {
    const s = up({ upsells: false }, 'storefront');
    expect(s.below).toEqual([]);
    expect(types(s.media)).toEqual(['ProductGallery']);
  });
  it.each(['menu', 'webapp'] as const)('%s ignores every toggle (the sheet default)', (layout) => {
    const off = up({ gallery: false, bulkPricing: false, provenance: false, upsells: false }, layout);
    const on = up({}, layout);
    for (const s of ['top', 'media', 'main', 'below']) expect(off[s]).toEqual(on[s]);
    expect(off.top).toEqual([]);
    expect(off.media).toEqual([]);
    expect(types(off.main)).toEqual(['ProductGroup', 'ProductDescription', 'ProductBulkPricing', 'ProductProvenance', 'ProductAsk']);
    expect(types(off.below)).toEqual(['ProductUpsells']);
  });
  it('never mutates a frozen input', () => {
    const deepFreeze = <T,>(o: T): T => {
      if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
      return o;
    };
    const input = deepFreeze(legacyDoc({ gallery: false, upsells: false }));
    const before = JSON.stringify(input);
    const out = upgradeDoc(input, 'product', 'storefront');
    expect(out).not.toBe(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(detail(out).props.media).toEqual([]);
  });
  it('derived part ids are at most 64 chars', () => {
    const long = { ...legacyDoc({}), content: [{ type: 'ProductDetail', props: { id: 'x'.repeat(64) } }] };
    const ids = JSON.stringify(upgradeDoc(long, 'product', 'storefront')).match(/"id":"[^"]+"/g)!.map((s) => s.slice(6, -1));
    expect(Math.max(...ids.map((i) => i.length))).toBeLessThanOrEqual(64);
  });
});

describe('rules with real parts (spec §4, §13)', () => {
  it('the defaults pass their own rules in every layout', () => {
    for (const l of ['storefront', 'menu', 'webapp'] as const) expect(checkRules(defaultDoc('product', l)!, 'product', l)).toEqual([]);
    const menu = JSON.stringify(defaultDoc('product', 'menu'));
    expect(menu).not.toContain('"ProductAddToCart"');
    expect(menu).not.toContain('"ProductBreadcrumbs"');
  });
  it('a missing add button is part-required', () => {
    const d = sfDefault();
    detail(d).props.main = slotOf(d, 'main').filter((c) => c.type !== 'ProductAddToCart');
    expect(rules(d)).toContain('part-required:ProductDetail.ProductAddToCart');
  });
  it('a second price is part-required', () => {
    const d = sfDefault();
    slotOf(d, 'main').push(p('ProductPrice', { id: 'pd-price-2' }));
    expect(rules(d)).toContain('part-required:ProductDetail.ProductPrice');
  });
  it('a second description is part-unique', () => {
    const d = sfDefault();
    slotOf(d, 'main').push(p('ProductDescription', { id: 'pd-desc-2' }));
    expect(rules(d)).toContain('part-unique:ProductDetail.ProductDescription');
  });
  it('a hidden Section holding the price is hidden-required', () => {
    const d = sfDefault();
    const main = slotOf(d, 'main');
    const row = main.find((c) => c.type === 'ProductGroup')!;
    const price = (row.props.items as ComponentData[]).find((c) => c.type === 'ProductPrice')!;
    row.props.items = (row.props.items as ComponentData[]).filter((c) => c !== price);
    main.push({ type: 'Section', props: { id: 'sec', padding: 'lg', backgroundToken: 'none', textToken: 'none', width: 'rail', content: [price], blockStyle: { hide: 'mobile' } } });
    expect(rules(d)).toContain('hidden-required:Section');
  });
  it('the price in a hidden column is part-required only', () => {
    const d = sfDefault();
    const main = slotOf(d, 'main');
    const row = main.find((c) => c.type === 'ProductGroup')!;
    const price = (row.props.items as ComponentData[]).find((c) => c.type === 'ProductPrice')!;
    row.props.items = (row.props.items as ComponentData[]).filter((c) => c !== price);
    main.push({ type: 'Columns', props: { id: 'cols', columns: '2', stackBelow: 'md', gap: 'md', col1: [], col2: [], col3: [price], col4: [] } });
    const r = rules(d);
    expect(r).toContain('part-required:ProductDetail.ProductPrice');
    expect(r.filter((x) => x.startsWith('hidden-required'))).toEqual([]);
  });
  it('a part at the document root is part-placement', () => {
    const d = sfDefault();
    d.content.push(p('ProductPrice', { id: 'loose' }));
    expect(rules(d)).toContain('part-placement:ProductPrice');
  });
  it('a menu document holding an add button drops it and still renders', async () => {
    setup(true);
    const d = sfDefault('menu');
    slotOf(d, 'main').push(p('ProductAddToCart'));
    const r = validateDoc(d, 'product', 'menu');
    expect(r.issues.map((i) => i.rule)).toContain('drop:layout');
    expect(r.doc).not.toBeNull();
    expect(JSON.stringify(r.doc)).not.toContain('"ProductAddToCart"');
    renderDoc(r.doc!, '/p/1', 'menu');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(FULL.displayName);
  });
});

describe('arrangement', () => {
  it('draws the slots in their stored order', async () => {
    setup(true);
    const d = guarded(slotDoc({
      top: [p('ProductBreadcrumbs')], media: [p('ProductGallery')],
      main: [p('ProductDescription'), p('ProductTitle'), group('ProductGroup', 'pd', 'priceRow', [p('ProductPrice'), p('ProductStock')]),
        p('ProductAddToCart'), richText('<p>Between</p>'), p('ProductBulkPricing')],
      below: [],
    }));
    const { container } = renderDoc(d);
    const h1 = await screen.findByRole('heading', { level: 1 });
    const desc = container.querySelector(`.${classes.description}`)!;
    const add = container.querySelector('button[data-sf-part="button"]')!;
    const between = screen.getByText('Between');
    const bulk = container.querySelector('#bulk-heading')!;
    const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(desc, h1)).toBe(true);
    expect(follows(add, between)).toBe(true);
    expect(follows(between, bulk)).toBe(true);
    expect(container.querySelector('#upsells-heading')).toBeNull();
    expect(container.querySelector('#provenance-heading')).toBeNull();
  });

  const base = { top: [], main: [p('ProductTitle'), p('ProductPrice'), p('ProductAddToCart')], below: [] };
  it('media column shows for owner content even without a photo (spec §5.1)', async () => {
    setup(false);
    const { container } = renderDoc(guarded(slotDoc({ ...base, media: [richText('<p>Made here</p>')] })));
    await screen.findByRole('heading', { level: 1 });
    expect(container.querySelector(`.${classes.media}`)).not.toBeNull();
    expect(container.querySelector(`.${classes.layout}`)!.className).not.toContain(classes.layoutNoImage);
  });
  it('a gallery without a photo hides the media column', async () => {
    setup(false);
    const { container } = renderDoc(guarded(slotDoc({ ...base, media: [p('ProductGallery')] })));
    await screen.findByRole('heading', { level: 1 });
    expect(container.querySelector(`.${classes.media}`)).toBeNull();
    expect(container.querySelector(`.${classes.layout}`)!.className).toContain(classes.layoutNoImage);
  });
});

describe('style per part (spec §9)', () => {
  it('lands on each part root', async () => {
    setup(true);
    const d = guarded(slotDoc({
      top: [], media: [p('ProductGallery', { blockStyle: { hide: 'mobile' } })],
      main: [p('ProductTitle'), p('ProductPrice', { blockStyle: { fg: 'primary', textSize: 'lg' } }),
        p('ProductStock', { blockStyle: { bg: 'surface' } }), p('ProductAddToCart', { blockStyle: { padTop: 'sm' } })],
      below: [],
    }));
    const { container } = renderDoc(d);
    await screen.findByRole('heading', { level: 1 });
    expect(container.querySelector('p[data-sf-part="price"][data-sf-style="ProductPrice"][data-sfs-fg="primary"][data-sfs-text="lg"]')).not.toBeNull();
    expect(container.querySelector(`.${classes.media} > span[data-sfs-hide="mobile"]`)).not.toBeNull();
    expect(container.querySelector('button[data-sf-part="button"][data-sf-style="ProductAddToCart"][data-sfs-pt="sm"]')).not.toBeNull();
    expect(container.querySelector(`.${classes.flags}[data-sf-style="ProductStock"][data-sfs-bg="surface"]`)).not.toBeNull();
  });
  it('required parts take no hide', () => {
    for (const name of ['ProductTitle', 'ProductPrice', 'ProductAddToCart']) {
      const s = BLOCKS[name]!.style;
      expect(s && s.keys).not.toContain('hide');
    }
  });
});
