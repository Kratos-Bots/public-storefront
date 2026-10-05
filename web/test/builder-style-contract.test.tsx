/// <reference types="node" />
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { isValidElement, Suspense, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { Catalog } from '@/types/catalog.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings, catalog: undefined as Catalog | undefined }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => ({ data: state.catalog, isPending: false, isError: false, refetch: () => {} }),
  useProduct: (id: number | null) => ({ data: id == null ? undefined : state.catalog?.products.find((p) => p.id === id), isPending: false, isError: false, refetch: () => {} }),
}));

import { BLOCKS } from '@/builder/registry.ts';
import { RenderDoc } from '@/builder/render.tsx';
import { renderBlock } from '@/builder/style/apply.tsx';
import { BOX, STYLE_KEY_ORDER, STYLE_KEYS, TEXT, VIS, type StyleKey, type StyleTarget } from '@/builder/style/model.ts';
import type { AnyBlock, BlockRenderContext } from '@/builder/define.ts';
import type { ComponentData } from '@/builder/types.ts';
import { cssRules } from './helpers/css-rules.ts';

afterEach(cleanup);

state.settings = {
  currency: 'GBP', welcomeMessage: 'Packed to order', enabled: true, supportLinks: [], notices: [],
  brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: 'Small batches', links: { whatsapp: 'https://wa.me/440000000000', telegram: null } },
  features: { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
} as unknown as StorefrontSettings;
state.catalog = {
  categories: [{ id: 1, name: 'Pantry', slug: 'pantry', parentId: null, sortOrder: 0, emoji: null }],
  products: [{
    id: 7, sku: 'NB-7', name: 'Trail Oats 1kg', displayName: 'Trail Oats 1kg', shortDisplayName: null, shortDescription: null, description: null, categoryId: 1,
    categoryName: 'Pantry', sortOrder: 0, price: 12, inStock: true, lowStockAlert: false, isActive: true, isPreorder: false, preorderEta: null,
    pricingTiers: [], upsellProductIds: [], excludedFromFreeShipping: false, imageProductId: null, provenance: null,
    minOrderQuantity: null, maxOrderQuantity: null,
  }],
} as unknown as Catalog;

const minus = (keys: readonly StyleKey[], drop: readonly StyleKey[]) => keys.filter((k) => !drop.includes(k));
const ALLTEXT = [...BOX, ...TEXT, ...VIS];
const ROUTE = ['ProductGrid', 'ProductList', 'WholesaleTable', 'ProductDetail', 'CartContents', 'CartSummary', 'CheckoutFlow',
  'LoginOptions', 'OrdersList', 'OrderDetail', 'Loyalty', 'Referrals', 'Profile', 'PaymentSuccess',
  'PaymentCancel', 'OrderPlaced', 'VerifyForm', 'TrackingLookup', 'ResetPassword', 'VerifyEmail'];

/**
 * Spec §4 as a FLOOR. Allowlists only grow: a later release may add keys (update this table by
 * adding), never remove them — removing turns stored styles into blocking issues in every store.
 * Two rulings narrow the spec table: ContactStrip is `pass` (a wrapper would stop its sticky
 * strip sticking) and WholesaleTable takes only geometry-safe keys (its sticky full-bleed bar).
 */
const FLOOR: Record<string, { target: StyleTarget; keys: readonly StyleKey[] } | false> = {
  Section: { target: 'root', keys: [...minus(BOX, ['bg', 'padTop', 'padBottom', 'maxWidth']), 'textSize', 'align', 'hide'] },
  Heading: { target: 'root', keys: [...BOX, 'fg', 'textSize', 'hide'] },
  RichText: { target: 'root', keys: minus(ALLTEXT, ['maxWidth']) },
  Image: { target: 'root', keys: [...minus(BOX, ['maxWidth']), 'hide'] },
  Button: { target: 'root', keys: [...BOX, 'hide'] },
  Divider: { target: 'root', keys: ['maxWidth', 'align', 'hide'] },
  Spacer: { target: 'root', keys: ['hide'] },
  Columns: { target: 'root', keys: ALLTEXT }, FAQ: { target: 'root', keys: ALLTEXT },
  Testimonial: { target: 'root', keys: ALLTEXT }, NavLinks: { target: 'root', keys: ALLTEXT },
  Video: { target: 'root', keys: [...BOX, 'hide'] }, CatalogHero: { target: 'root', keys: [...BOX, 'hide'] },
  CategoryNav: { target: 'root', keys: [...BOX, 'hide'] }, SearchField: { target: 'root', keys: [...BOX, 'hide'] },
  FeaturedProducts: { target: 'root', keys: [...BOX, 'hide'] },
  Upsells: { target: 'wrap', keys: [...BOX, 'hide'] }, TopBar: { target: 'wrap', keys: [...BOX, 'hide'] },
  NoticeBanners: { target: 'wrap', keys: [...BOX, 'hide'] }, CutoffBar: { target: 'wrap', keys: [...BOX, 'hide'] },
  ContactStrip: { target: 'pass', keys: [...BOX, 'hide'] }, Footer: { target: 'wrap', keys: [...BOX, 'hide'] },
  Header: { target: 'pass', keys: ['bg', 'shadow', 'hide'] },
  ...Object.fromEntries([...ROUTE, 'AccountNav'].map((n) => [n, { target: 'wrap' as const, keys: [...BOX] }])),
  // Stage 4: the cart summary owns its root div (its parts sit inside it).
  CartSummary: { target: 'root', keys: [...BOX] },
  WholesaleTable: { target: 'wrap', keys: ['bg', 'padTop', 'marginTop', 'marginBottom', 'shadow'] },
  PageOutlet: false,
  MobileCartBar: false,
  CardTile: { target: 'root', keys: [...BOX] }, CardRow: { target: 'root', keys: [...BOX] },
};

describe('style support contract (spec §4, §12)', () => {
  it('every registered block declares style, and the table covers them all', () => {
    expect(Object.keys(FLOOR).sort()).toEqual(Object.keys(BLOCKS).filter((n) => !BLOCKS[n]!.part).sort());
    for (const def of Object.values(BLOCKS)) expect(def.style, def.name).not.toBeUndefined();
  });
  it('false exactly for PageOutlet and MobileCartBar', () => {
    expect(Object.values(BLOCKS).filter((d) => d.style === false).map((d) => d.name).sort()).toEqual(['MobileCartBar', 'PageOutlet']);
  });
  it.each(Object.keys(FLOOR))('%s: target and key floor', (name) => {
    const want = FLOOR[name]!;
    const got = BLOCKS[name]!.style;
    if (want === false) return expect(got).toBe(false);
    expect(got && got.target).toBe(want.target);
    expect(got && [...got.keys]).toEqual(expect.arrayContaining([...want.keys]));
    expect(got && [...got.keys]).toEqual(STYLE_KEY_ORDER.filter((k) => got && got.keys.includes(k)));
  });
  it('route-bound blocks and AccountNav: box keys only, never hide (spec §2 #6)', () => {
    const bound = Object.values(BLOCKS).filter((d) => d.routeBound || d.name === 'AccountNav');
    expect(bound.length).toBeGreaterThan(ROUTE.length);
    for (const def of bound) {
      if (def.name === 'PageOutlet') { expect(def.style).toBe(false); continue; }
      expect(def.style, def.name).not.toBe(false);
      for (const k of (def.style || { keys: [] }).keys) expect(BOX, `${def.name}.${k}`).toContain(k);
      expect((def.style || { keys: [] }).keys, def.name).not.toContain('hide');
    }
  });
  it('no block containing an input accepts textSize', () => {
    for (const name of ['SearchField', ...ROUTE]) expect((BLOCKS[name]!.style || { keys: [] }).keys).not.toContain('textSize');
  });
  it('every block offering fg / textSize (and owning its text) reads the variables in real rules', () => {
    const owners: string[] = [];
    for (const def of Object.values(BLOCKS)) {
      if (!def.style || def.slots.length > 0 || def.part) continue; // containers set the variables for their children
      const file = resolve(__dirname, `../src/builder/blocks/${def.name}.module.css`);
      const rules = existsSync(file) ? cssRules(readFileSync(file, 'utf8')) : [];
      if (def.style.keys.includes('fg')) expect(rules.some((r) => /(^|;|\s)color:\s*var\(--sf-block-fg,/.test(r.body)), `${def.name} fg`).toBe(true);
      if (def.style.keys.includes('textSize')) expect(rules.some((r) => /font-size:\s*calc\([^;]*var\(--sf-text-scale, 1\)/.test(r.body)), `${def.name} textSize`).toBe(true);
      if (def.style.keys.includes('fg') || def.style.keys.includes('textSize')) owners.push(def.name);
    }
    // The content text blocks (spec choice 5) — a vacuous pass would hide a lost declaration.
    expect(owners.sort()).toEqual(expect.arrayContaining(['FAQ', 'Heading', 'NavLinks', 'RichText', 'Testimonial']));
  });
});

const ctx: BlockRenderContext = { editing: false, docKey: 'page:x', layout: 'storefront' };
const c = (type: string, props: Record<string, unknown>, id = type): ComponentData => ({ type, props: { id, ...props } });
const IMAGE = `/media/storefront-pages/media/${'a'.repeat(32)}.png`;
const CONTENT: ComponentData[] = [
  c('Heading', { text: 'Small batches', eyebrow: 'New', level: 'h2', align: 'start' }),
  c('RichText', { bodyHtml: '<p>Packed to order.</p>', width: 'narrow' }),
  c('Image', { src: IMAGE, alt: 'Oats', caption: 'Trail oats', width: 'rail', aspect: '16/9' }),
  c('Button', { label: 'Shop now', href: '/', variant: 'filled', align: 'start' }),
  c('Columns', { columns: '2', stackBelow: 'md', gap: 'md', col1: [c('Heading', { text: 'Fast' }, 'k1')], col2: [], col3: [], col4: [] }),
  c('Section', { padding: 'md', backgroundToken: 'surface', textToken: 'none', width: 'rail', content: [c('Heading', { text: 'In' }, 'k2')] }),
  c('Spacer', { size: 'sm' }), c('Divider', { spacing: 'md', toneToken: 'line' }),
  c('FAQ', { title: 'Questions', items: [{ question: 'How fast?', answerHtml: '<p>Same day.</p>' }] }),
  c('Testimonial', { quote: 'Arrived next morning.', author: 'Sam', detail: 'Leeds' }),
  c('NavLinks', { items: [{ label: 'Shop', href: '/' }], ariaLabel: 'Site', direction: 'row' }),
  c('Video', { provider: 'youtube', videoId: 'aB3_dE-fG9h', title: 'How we pack' }),
];

function tree(content: ComponentData[]) {
  return (<QueryClientProvider client={new QueryClient()}><MantineProvider env="test"><MemoryRouter><Suspense fallback={null}>
    <RenderDoc doc={{ root: { props: { title: '', description: '', chrome: 'shell' } }, content }} docKey="page:x" layout="storefront" />
  </Suspense></MemoryRouter></MantineProvider></QueryClientProvider>);
}
function markup(content: ComponentData[]): string {
  const html = render(tree(content)).container.innerHTML;
  cleanup();
  return html;
}

describe('every stylable block carries the marker when styled (spec §5.1)', () => {
  /** One allowed value — a non-hide key where there is one, so the element stays in the DOM. */
  function oneStyle(def: AnyBlock): Record<string, string> {
    const keys = def.style ? def.style.keys : [];
    const k = keys.find((x) => x !== 'hide') ?? keys[0]!;
    return { [k]: STYLE_KEYS[k][0] };
  }
  const stylable = Object.values(BLOCKS).filter((d) => d.style && !d.part);
  // A card frame renders only inside a card context: its marker is asserted in builder-card-parts.test.tsx.
  const owned = stylable.filter((d) => d.style && d.style.target !== 'wrap' && !['CardTile', 'CardRow'].includes(d.name)).map((d) => d.name);
  const wrapped = stylable.filter((d) => d.style && d.style.target === 'wrap').map((d) => d.name);
  /** Root/pass blocks: the real render must spread `puck.style` onto the element it owns. */
  const SAMPLE: Record<string, ComponentData> = {
    ...Object.fromEntries(CONTENT.map((it) => [it.type, it])),
    CatalogHero: c('CatalogHero', { ...BLOCKS.CatalogHero!.defaultProps }),
    CategoryNav: c('CategoryNav', {}),
    SearchField: c('SearchField', { placeholder: 'Find it' }),
    FeaturedProducts: c('FeaturedProducts', { ...BLOCKS.FeaturedProducts!.defaultProps, source: 'picked', items: [{ productId: 7 }] }),
    Header: c('Header', { ...BLOCKS.Header!.defaultProps, nav: [] }),
    ContactStrip: c('ContactStrip', { catalogOnly: false }),
    CartSummary: c('CartSummary', {}),
  };
  it('the sample covers every root/pass block', () => {
    expect(Object.keys(SAMPLE).sort()).toEqual([...owned].sort());
  });
  it.each(owned)('%s (root/pass): rendered DOM has [data-sf-style]', async (name) => {
    const def = BLOCKS[name]!;
    const sample = SAMPLE[name]!;
    const { container } = render(tree([{ ...sample, props: { ...sample.props, blockStyle: oneStyle(def) } }]));
    // Lazy feature components suspend first; wait for the block to mount.
    await waitFor(() => expect(container.querySelector(`[data-sf-style="${name}"]`), name).not.toBeNull());
  });
  it.each(wrapped)('%s (wrap): renderBlock adds one marked div', (name) => {
    const def = BLOCKS[name]!;
    const p: Record<string, unknown> = { id: 'b', ...def.defaultProps, blockStyle: oneStyle(def) };
    for (const s of def.slots) p[s] = () => null;
    const out = renderBlock({ ...def, render: () => 'inner' } as AnyBlock, p, ctx) as ReactElement<Record<string, unknown>>;
    expect(isValidElement(out) && out.type).toBe('div');
    expect(out.props['data-sf-style']).toBe(name);
  });
});

describe('parity (spec §6)', () => {
  /** A valid value for a key the block does NOT accept, or null when it accepts all 16. */
  function disallowed(def: AnyBlock): Record<string, string> | null {
    const keys = def.style ? def.style.keys : [];
    const k = STYLE_KEY_ORDER.find((x) => !keys.includes(x));
    return k ? { [k]: STYLE_KEYS[k][0] } : null;
  }
  it.each(Object.keys(BLOCKS))('%s: absent, {} and disallowed-only styles make the identical render call', (name) => {
    const def = BLOCKS[name]!;
    const calls: Array<Record<string, unknown>> = [];
    const spy = { ...def, render: (p: Record<string, unknown>) => { calls.push(p); return 'out'; } } as unknown as AnyBlock;
    const base: Record<string, unknown> = { id: 'b', ...def.defaultProps };
    for (const s of def.slots) base[s] = () => null;
    const dis = disallowed(def);
    const outs = [renderBlock(spy, base, ctx), renderBlock(spy, { ...base, blockStyle: {} }, ctx), ...(dis ? [renderBlock(spy, { ...base, blockStyle: dis }, ctx)] : [])];
    for (const o of outs) expect(o).toBe('out');
    for (const p of calls) {
      expect(p.puck).toBe(ctx);
      expect(p).toEqual(calls[0]);
      expect(Object.hasOwn(p, 'blockStyle')).toBe(false);
    }
  });

  const withStyle = (items: ComponentData[], style: (type: string) => unknown): ComponentData[] => items.map((it) => {
    const props: Record<string, unknown> = { ...it.props, blockStyle: style(it.type) };
    for (const s of BLOCKS[it.type]!.slots) if (Array.isArray(props[s])) props[s] = withStyle(props[s] as ComponentData[], style);
    return { ...it, props: props as ComponentData['props'] };
  });
  it('content blocks: identical markup for absent, {} and disallowed-only styles', () => {
    const plain = markup(CONTENT);
    expect(markup(withStyle(CONTENT, () => ({})))).toBe(plain);
    expect(markup(withStyle(CONTENT, (t) => disallowed(BLOCKS[t]!) ?? {}))).toBe(plain);
  });
});
