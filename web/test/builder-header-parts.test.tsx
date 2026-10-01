import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Suspense, type ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { StorefrontSettings } from '@/types/settings.ts';
import { STAGE4_PARTS } from './helpers/stage4-parts.ts';

const state = vi.hoisted(() => ({ features: {} as Record<string, unknown>, headerIcon: 'all' as string }));

vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [],
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
    features: state.features,
  }) as unknown as StorefrontSettings,
}));
vi.mock('@/components/Brand.tsx', () => ({ Brand: () => <span>brand</span> }));
vi.mock('@/features/notices/NoticeBanners.tsx', () => ({ NoticeBanners: () => null }));
vi.mock('@/templates/runtime.tsx', async (orig) => ({
  ...(await orig<typeof import('@/templates/runtime.tsx')>()),
  Slot: ({ name }: { name: string }) => (name === 'TopBar' ? <i data-slot="TopBar" /> : null),
}));
// The store-wide header icon mode; a block-level scope still wins over it.
vi.mock('@/templates/hooks.ts', async (orig) => {
  const real = await orig<typeof import('@/templates/hooks.ts')>();
  const { useContext } = await import('react');
  const { CoreOptionsScopeContext } = await import('@/templates/core-scope.ts');
  return {
    ...real,
    useCoreOptions: () => {
      const base = real.useCoreOptions();
      const scope = useContext(CoreOptionsScopeContext);
      return {
        ...base,
        headerAccountIcon: scope.headerAccountIcon ?? (state.headerIcon as typeof base.headerAccountIcon),
        headerCartIcon: scope.headerCartIcon ?? (state.headerIcon as typeof base.headerCartIcon),
      };
    },
  };
});

// defaults first: the registry is only ever entered through a loaded defaults table (cart drawer cycle).
import { defaultDoc } from '@/builder/defaults/index.ts';
import { RenderDoc } from '@/builder/render.tsx';
import { validateDoc } from '@/builder/guard.ts';
import { checkRules } from '@/builder/rules.ts';
import { upgradeDoc } from '@/builder/upgrade.ts';
import { prepareProps } from '@/builder/editor/prepare.ts';
import { BLOCKS } from '@/builder/registry.ts';
import { HeaderFamily } from '@/builder/family-header.ts';
import { HEADER_CONTAINER, resolveVariant } from '@/builder/blocks/_shared/header-container.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useCartStore } from '@/stores/cart.ts';
import type { ComponentData, LayoutKind, PuckDoc } from '@/builder/types.ts';
import sfCss from '@/layouts/StorefrontShell.module.css';

const HEADER_PARTS = Object.keys(STAGE4_PARTS).filter((n) => STAGE4_PARTS[n]!.family === 'header');
const LAYOUTS: LayoutKind[] = ['storefront', 'menu', 'webapp'];
const FEATURES = { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false };

afterEach(() => {
  cleanup();
  useSessionStore.setState({ token: null, customer: null });
  useCartStore.setState({ lines: [], mode: 'local' });
  state.features = { ...FEATURES };
  state.headerIcon = 'all';
});
state.features = { ...FEATURES };

const c = (type: string, id: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...props } });
const rt = (id = 'rt'): ComponentData => c('RichText', id, { bodyHtml: '<p>between</p>', width: 'narrow' });
const shellDoc = (header: ComponentData): PuckDoc => ({
  root: { props: { title: '', description: '', chrome: 'shell' } },
  content: [header, c('PageOutlet', 'PageOutlet-default')],
});
const legacyHeader = (props: Record<string, unknown> = {}): ComponentData =>
  c('Header', 'h', { variant: 'auto', topBar: true, search: true, sticky: true, accountIcon: 'inherit', cartIcon: 'inherit', nav: [], ...props });
const types = (items: unknown) => (items as ComponentData[]).map((i) => i.type);
const headerOf = (d: PuckDoc) => d.content[0]!;
const upgraded = (h: ComponentData, layout: LayoutKind) => headerOf(upgradeDoc(shellDoc(h), 'shell', layout));
const rules = (d: PuckDoc, layout: LayoutKind = 'storefront') => checkRules(d, 'shell', layout).map((i) => i.rule).filter((r) => r.startsWith('part-') || r.startsWith('hidden-required') || r.startsWith('slot-'));

function mount(ui: ReactNode, path = '/') {
  return render(
    <QueryClientProvider client={new QueryClient()}><MantineProvider env="test"><MemoryRouter initialEntries={[path]}>
      <Suspense fallback={null}>{ui}</Suspense>
    </MemoryRouter></MantineProvider></QueryClientProvider>,
  );
}
async function renderShell(d: PuckDoc, layout: LayoutKind = 'storefront', path = '/') {
  const guarded = validateDoc(d, 'shell', layout);
  expect(guarded.doc, JSON.stringify(guarded.issues)).not.toBeNull();
  const out = mount(<RenderDoc doc={guarded.doc!} docKey="shell" layout={layout} />, path);
  await vi.waitFor(() => expect(out.container.querySelector('header')).not.toBeNull());
  return out;
}

describe('contract', () => {
  it('registers exactly the six parts, in the header family, with the STAGE4_PARTS style', () => {
    expect(HEADER_PARTS).toHaveLength(6);
    for (const name of HEADER_PARTS) {
      const def = BLOCKS[name]!;
      expect(def, name).toBeDefined();
      expect(def.category).toBe('part');
      expect(def.part).toEqual({ family: 'header' });
      const want = STAGE4_PARTS[name]!.style;
      expect(def.style, name).toMatchObject({ target: want.target });
      expect([...(def.style as unknown as { keys: string[] }).keys].sort(), name).toEqual([...want.keys].sort());
    }
    expect(BLOCKS.HeaderBack!.layouts).toEqual(['webapp']);
    expect(BLOCKS.HeaderBrand!.label).toBe('Brand');
    expect(BLOCKS.HeaderBack!.label).toBe('Back button');
    expect(BLOCKS.HeaderFilter!.label).toBe('Categories button');
  });

  it('(h) BAR: no part offers vertical spacing, margins, maxWidth or textSize; HeaderBrand never hide', () => {
    for (const name of HEADER_PARTS) {
      const keys = (BLOCKS[name]!.style as unknown as { keys: string[] }).keys;
      for (const banned of ['padTop', 'padBottom', 'marginTop', 'marginBottom', 'maxWidth', 'textSize']) expect(keys, `${name} ${banned}`).not.toContain(banned);
    }
    expect((BLOCKS.HeaderBrand!.style as unknown as { keys: string[] }).keys).not.toContain('hide');
    expect((BLOCKS.HeaderSearch!.style as unknown as { keys: string[] }).keys).not.toContain('fg');
  });

  it('a PartHost outside a container renders nothing and does not throw', () => {
    const { container } = render(<HeaderFamily.PartHost name="HeaderBrand" props={{ id: 'x' }} />);
    expect(container.innerHTML).toBe('');
  });

  it('every default id is at most 64 chars and unique; the defaults pass checkRules in each layout', () => {
    for (const layout of LAYOUTS) {
      const d = defaultDoc('shell', layout)!;
      const ids = JSON.stringify(d).match(/"id":"[^"]+"/g)!.map((s) => s.slice(6, -1));
      expect(new Set(ids).size).toBe(ids.length);
      expect(Math.max(...ids.map((i) => i.length))).toBeLessThanOrEqual(64);
      expect(checkRules(d, 'shell', layout)).toEqual([]);
    }
    const long = HEADER_CONTAINER.defaultSlots({}, { layout: 'webapp', id: 'x'.repeat(64) });
    for (const items of Object.values(long)) for (const i of items) expect(String(i.props.id).length).toBeLessThanOrEqual(64);
  });

  it('the default arrangements', () => {
    const slots = (l: LayoutKind) => (headerOf(defaultDoc('shell', l)!).props);
    expect(types(slots('storefront').start)).toEqual(['HeaderBrand']);
    expect(types(slots('storefront').middle)).toEqual(['HeaderSearch']);
    expect(types(slots('storefront').end)).toEqual(['HeaderAccount', 'HeaderCart']);
    expect(types(slots('menu').end)).toEqual(['HeaderFilter', 'HeaderAccount', 'HeaderCart']);
    expect(types(slots('webapp').start)).toEqual(['HeaderBack', 'HeaderBrand']);
    expect(slots('storefront').nav).toEqual([]);
  });

  it('(d) variant webapp outside the web app resolves the menu defaults', () => {
    expect(resolveVariant('webapp', 'storefront')).toBe('menu');
    expect(resolveVariant('webapp', 'webapp')).toBe('webapp');
    expect(resolveVariant('auto', 'menu')).toBe('menu');
    expect(resolveVariant('bogus', 'storefront')).toBe('storefront');
    const d = HEADER_CONTAINER.defaultSlots({ variant: 'webapp' }, { layout: 'storefront', id: 'h' });
    expect(types(d.start)).toEqual(['HeaderBrand']);
    expect(types(d.end)[0]).toBe('HeaderFilter');
    expect(d.nav).toBeUndefined();
  });
});

describe('upgrade of the v0.7.0 header (spec §8)', () => {
  it('(a) storefront: search false and cartIcon hide become parts; nav untouched', () => {
    const h = upgraded(legacyHeader({ search: false, cartIcon: 'hide', nav: [rt('n')] }), 'storefront');
    expect(types(h.props.start)).toEqual(['HeaderBrand']);
    expect(h.props.middle).toEqual([]);
    expect(types(h.props.end)).toEqual(['HeaderAccount', 'HeaderCart']);
    const [acc, cart] = h.props.end as ComponentData[];
    expect(acc!.props.icon).toBe('inherit');
    expect(cart!.props.icon).toBe('hide');
    expect(types(h.props.nav)).toEqual(['RichText']);
  });
  it('(a) web app gains HeaderBack; menu gains HeaderFilter first', () => {
    expect(types(upgraded(legacyHeader({ variant: 'webapp' }), 'webapp').props.start)).toEqual(['HeaderBack', 'HeaderBrand']);
    expect(types(upgraded(legacyHeader(), 'menu').props.end)[0]).toBe('HeaderFilter');
  });
  it('(b) a header with no search key still gets the search part', () => {
    const { search: _s, ...rest } = legacyHeader().props;
    void _s;
    expect(types(upgraded({ type: 'Header', props: rest as ComponentData['props'] }, 'storefront').props.middle)).toEqual(['HeaderSearch']);
  });
  it('present slots (even []) are untouched; a second pass is the same object', () => {
    const h = legacyHeader({ search: false, start: [], middle: [], end: [] });
    const once = upgradeDoc(shellDoc(h), 'shell', 'storefront');
    expect(headerOf(once).props.start).toEqual([]);
    expect(headerOf(once).props.end).toEqual([]);
    const full = upgradeDoc(shellDoc(legacyHeader()), 'shell', 'storefront');
    expect(upgradeDoc(full, 'shell', 'storefront')).toBe(full);
  });
  it('(c) prepareProps keeps absent slots absent; drops legacy props once start/middle/end are all present', () => {
    const partial = { id: 'h', nav: [], start: [], middle: [], search: false, accountIcon: 'inherit', cartIcon: 'hide' };
    expect(prepareProps('Header', partial)).toEqual(partial);
    const done = prepareProps('Header', { ...partial, end: [] });
    expect(Object.keys(done).sort()).toEqual(['end', 'id', 'middle', 'nav', 'start']);
  });
});

describe('rules (e)', () => {
  const withHeader = (over: Record<string, unknown>): PuckDoc => {
    const base = HEADER_CONTAINER.defaultSlots({}, { layout: 'storefront', id: 'h' });
    return shellDoc(c('Header', 'h', { variant: 'auto', topBar: true, sticky: true, nav: [], ...base, ...over }));
  };
  it('a missing HeaderBrand is part-required; a duplicate too', () => {
    expect(rules(withHeader({ start: [] }))).toContain('part-required:Header.HeaderBrand');
    expect(rules(withHeader({ start: [c('HeaderBrand', 'b1'), c('HeaderBrand', 'b2')] }))).toContain('part-required:Header.HeaderBrand');
  });
  it('part-unique for each optional part', () => {
    for (const p of ['HeaderSearch', 'HeaderFilter', 'HeaderAccount', 'HeaderCart']) {
      const base = HEADER_CONTAINER.defaultSlots({}, { layout: 'storefront', id: 'h' });
      const d = withHeader({ end: [...(base.end as ComponentData[]), c(p, 'dup-1'), c(p, 'dup-2')] });
      expect(rules(d), p).toContain(`part-unique:Header.${p}`);
    }
  });
  it('a hidden Section in end holding HeaderBrand is hidden-required:Section', () => {
    const d = withHeader({ start: [], end: [c('Section', 's', { blockStyle: { hide: 'mobile' }, content: [c('HeaderBrand', 'b')] })] });
    expect(rules(d)).toContain('hidden-required:Section');
  });
  it('a hidden Header raises no issue', () => {
    const d = withHeader({ blockStyle: { hide: 'mobile' } });
    expect(checkRules(d, 'shell', 'storefront')).toEqual([]);
  });
  it('a header part in another family container is part-placement', () => {
    const grid: PuckDoc = { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [
      c('ProductGrid', 'pg', { top: [c('HeaderBrand', 'b')], rail: [], main: [] })] };
    expect(checkRules(grid, 'catalog', 'storefront').map((i) => i.rule)).toContain('part-placement:HeaderBrand');
    // And on the shell, a header part at the root is misplaced too.
    expect(rules(shellDoc(c('HeaderCart', 'x', { icon: 'inherit' })))).toContain('part-placement:HeaderCart');
  });
});

describe('arrangement (f)', () => {
  it('cart moved to start, search removed, a NavLinks between brand and account render in that DOM order', async () => {
    useSessionStore.setState({ token: 'tok', customer: { id: 1, nickname: 'Sam' } } as never);
    const d = shellDoc(c('Header', 'h', {
      variant: 'storefront', topBar: true, sticky: true,
      start: [c('HeaderBrand', 'h-b'), c('HeaderCart', 'h-c', { icon: 'inherit' })],
      nav: [c('NavLinks', 'nl', { items: [{ label: 'Docs', href: '/docs' }], ariaLabel: '', direction: 'row' })],
      middle: [], end: [c('HeaderAccount', 'h-a', { icon: 'inherit' })],
    }));
    const { container } = await renderShell(d);
    const inner = container.querySelector('header > div')!;
    expect(container.querySelector('header')!.getAttribute('data-sf-part')).toBe('header');
    const hrefs = [...inner.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/', '/cart', '/docs', '/account']);
    expect(inner.querySelector('input')).toBeNull();
    for (const el of container.querySelectorAll('header, header a')) {
      expect([...el.attributes].some((a) => a.name.startsWith('data-sf-style') || a.name.startsWith('data-sfs'))).toBe(false);
    }
    // `.actions` still renders when the end slot is empty.
    cleanup();
    const { container: c2 } = await renderShell(shellDoc(c('Header', 'h', { variant: 'storefront', start: [c('HeaderBrand', 'b')], nav: [], middle: [], end: [] })));
    expect(c2.querySelector(`.${sfCss.actions!.split(' ')[0]}`)).not.toBeNull();
  });

  it('sticky false still produces .unstuck; sticky true does not', async () => {
    const mk = (sticky: boolean) => shellDoc(c('Header', 'h', { variant: 'storefront', sticky, topBar: false, start: [c('HeaderBrand', 'b')], nav: [], middle: [], end: [] }));
    const off = await renderShell(mk(false));
    expect(off.container.querySelector('header')!.className).toContain(sfCss.unstuck!);
    cleanup();
    const on = await renderShell(mk(true));
    expect(on.container.querySelector('header')!.className).not.toContain(sfCss.unstuck!);
  });

  it('a styled HeaderCart carries the style attributes on its own link; its sibling stays bare', async () => {
    const d = shellDoc(c('Header', 'h', { variant: 'storefront', start: [c('HeaderBrand', 'b')], nav: [], middle: [], end: [
      c('HeaderAccount', 'a', { icon: 'inherit' }), c('HeaderCart', 'cc', { icon: 'inherit', blockStyle: { bg: 'primary' } })] }));
    const { container } = await renderShell(d);
    const cart = container.querySelector('a[href="/cart"]')!;
    expect(cart.getAttribute('data-sf-style')).not.toBeNull();
    expect(container.querySelector('a[href="/login"]')!.getAttribute('data-sf-style')).toBeNull();
  });
});

describe('visibility (g)', () => {
  const hdr = (variant: string, end: ComponentData[], start: ComponentData[] = [c('HeaderBrand', 'b')]) =>
    shellDoc(c('Header', 'h', { variant, start, nav: [], middle: [], end }));

  it.each(['all', 'desktop', 'mobile'])('HeaderCart icon=hide renders nothing under store mode %s', async (mode) => {
    state.headerIcon = mode;
    const { container } = await renderShell(hdr('storefront', [c('HeaderCart', 'cc', { icon: 'hide' })]));
    expect(container.querySelector('a[href="/cart"]')).toBeNull();
  });
  it('HeaderCart icon=show beats a store-wide none; inherit does not', async () => {
    state.headerIcon = 'none';
    const shown = await renderShell(hdr('storefront', [c('HeaderCart', 'cc', { icon: 'show' })]));
    expect(shown.container.querySelector('a[href="/cart"]')).not.toBeNull();
    cleanup();
    const inherited = await renderShell(hdr('storefront', [c('HeaderCart', 'cc', { icon: 'inherit' })]));
    expect(inherited.container.querySelector('a[href="/cart"]')).toBeNull();
  });
  it('the features gate the account and cart parts', async () => {
    state.features = { ...FEATURES, accounts: false, ordering: false };
    const { container } = await renderShell(hdr('storefront', [c('HeaderAccount', 'a', { icon: 'inherit' }), c('HeaderCart', 'cc', { icon: 'inherit' })]));
    expect(container.querySelector('a[href="/cart"]')).toBeNull();
    expect(container.querySelector('a[href="/login"]')).toBeNull();
  });
  it('HeaderFilter renders nothing in the storefront variant, a button in menu on the catalogue', async () => {
    const sf = await renderShell(hdr('storefront', [c('HeaderFilter', 'f')]));
    expect(sf.container.querySelector('header button')).toBeNull();
    cleanup();
    state.features = { ...FEATURES, layout: 'menu' };
    const menu = await renderShell(hdr('menu', [c('HeaderFilter', 'f')]), 'menu', '/');
    expect(menu.container.querySelector('header button')).not.toBeNull();
  });
  it('HeaderBack renders nothing outside the web app, a button in it off the catalogue', async () => {
    const out = await renderShell(hdr('storefront', [], [c('HeaderBack', 'k'), c('HeaderBrand', 'b')]), 'storefront', '/cart');
    expect(out.container.querySelector('header button')).toBeNull();
    cleanup();
    state.features = { ...FEATURES, layout: 'webapp' };
    const wa = await renderShell(hdr('webapp', [], [c('HeaderBack', 'k'), c('HeaderBrand', 'b')]), 'webapp', '/cart');
    expect(wa.container.querySelector('header button')).not.toBeNull();
    cleanup();
    const home = await renderShell(hdr('webapp', [], [c('HeaderBack', 'k'), c('HeaderBrand', 'b')]), 'webapp', '/');
    expect(home.container.querySelector('header button')).toBeNull();
  });
});

describe('CSS (i)', () => {
  const read = (f: string) => readFileSync(resolve(process.cwd(), 'src/layouts', f), 'utf8');
  const rule = (css: string, selector: string) => {
    const i = css.indexOf(`\n${selector} {`);
    expect(i, selector).toBeGreaterThan(-1);
    return css.slice(i, css.indexOf('}', i));
  };
  it('each header part offering fg has --sf-block-fg in its module rule', () => {
    for (const f of ['StorefrontShell.module.css', 'MenuShell.module.css']) {
      const css = read(f);
      expect(rule(css, '.home')).toContain('--sf-block-fg');
      expect(rule(css, '.action')).toContain('var(--sf-block-fg');
      expect(rule(css, '.action:hover')).toContain('var(--sf-block-fg');
    }
    expect(rule(read('StorefrontShell.module.css'), '.signIn')).toContain('var(--sf-block-fg');
    // The web app composes the menu's classes.
    const wa = read('WebAppShell.module.css');
    expect(wa).toContain("composes: action from './MenuShell.module.css'");
    expect(wa).toContain("composes: home from './MenuShell.module.css'");
    expect(readFileSync(resolve(process.cwd(), 'src/components/Brand.module.css'), 'utf8')).toContain('--sf-brand-fg');
  });
});
