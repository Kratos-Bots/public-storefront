import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { LayoutKind, ComponentData } from '@/builder/types.ts';
import type { ServerCartLine } from '@/types/cart.ts';
import type { CoreOptions } from '@/templates/hooks.ts';

const state = vi.hoisted(() => ({
  features: {} as Record<string, unknown>,
  native: false,
  issues: [] as unknown[],
  isSyncing: false,
  options: {} as Record<string, unknown>,
}));

vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [],
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
    features: state.features,
  }) as unknown as StorefrontSettings,
}));
vi.mock('@/components/Brand.tsx', () => ({ Brand: () => <span>brand</span> }));
vi.mock('@/components/ContactLinks.tsx', () => ({ ContactLinks: () => null }));
vi.mock('@/features/notices/NoticeBanners.tsx', () => ({ NoticeBanners: ({ pinned }: { pinned?: boolean }) => (pinned ? <i data-mark="notices-pinned" /> : null) }));
vi.mock('@/features/notices/CutoffBar.tsx', () => ({ CutoffBar: () => null }));
vi.mock('@/lib/telegram-webapp.ts', async (orig) => ({ ...(await orig<typeof import('@/lib/telegram-webapp.ts')>()), isTelegramWebApp: () => state.native }));
// Only the TopBar slot is observable; Footer / Overlay / ButtonAdornment draw nothing here.
vi.mock('@/templates/runtime.tsx', async (orig) => ({
  ...(await orig<typeof import('@/templates/runtime.tsx')>()),
  Slot: ({ name }: { name: string }) => (name === 'TopBar' ? <i data-slot="TopBar" /> : null),
}));
// A store whose template option hides a header icon by default; a block-level scope still wins over it.
vi.mock('@/templates/hooks.ts', async (orig) => {
  const real = await orig<typeof import('@/templates/hooks.ts')>();
  const { useContext } = await import('react');
  const { CoreOptionsScopeContext } = await import('@/templates/core-scope.ts');
  return {
    ...real,
    useCoreOptions: () => {
      const base = real.useCoreOptions();
      const scope = useContext(CoreOptionsScopeContext);
      const o = state.options as Partial<Record<'headerAccountIcon' | 'headerCartIcon', typeof base.headerAccountIcon>>;
      return { ...base, headerAccountIcon: scope.headerAccountIcon ?? o.headerAccountIcon ?? base.headerAccountIcon, headerCartIcon: scope.headerCartIcon ?? o.headerCartIcon ?? base.headerCartIcon };
    },
  };
});
// The routed page column is not under test; the default shell document's PageOutlet draws nothing.
vi.mock('@/layouts/StorefrontShell.tsx', async (orig) => ({ ...(await orig<typeof import('@/layouts/StorefrontShell.tsx')>()), StorefrontMain: () => null }));
vi.mock('@/layouts/MenuShell.tsx', async (orig) => ({ ...(await orig<typeof import('@/layouts/MenuShell.tsx')>()), MenuMain: () => null }));
vi.mock('@/layouts/WebAppShell.tsx', async (orig) => ({ ...(await orig<typeof import('@/layouts/WebAppShell.tsx')>()), WebAppMain: () => null }));
vi.mock('@/features/cart/useServerCart.ts', () => ({
  useServerCart: () => ({
    mode: 'local', isSyncing: state.isSyncing, issues: state.issues,
    add: () => {}, setQuantity: () => {}, remove: () => {}, sync: async () => {}, refresh: async () => {},
  }),
}));

import { StorefrontHeader } from '@/layouts/StorefrontShell.tsx';
import { MenuHeader } from '@/layouts/MenuShell.tsx';
import { WebAppHeader } from '@/layouts/WebAppShell.tsx';
import { CartPage } from '@/features/cart/CartPage.tsx';
import { CartDrawer } from '@/features/cart/CartDrawer.tsx';
import { CartSummary } from '@/features/cart/CartSummary.tsx';
import { CoreOptionsScope } from '@/builder/blocks/_shared/CoreOptionsScope.tsx';
import { useSessionStore } from '@/stores/session.ts';
import { useCartStore, type LocalLine } from '@/stores/cart.ts';
import { useUiStore } from '@/stores/ui.ts';
import { expectStage4, mountAt, mountDefault, mountDoc, type Mounted } from './helpers/stage4-golden.tsx';

const FEATURES = { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false };

afterEach(() => {
  cleanup();
  useSessionStore.setState({ token: null, customer: null });
  useCartStore.setState({ lines: [], mode: 'local' });
  useUiStore.setState({ cartOpen: false, filterOpen: false, loginOpen: false });
  state.native = false; state.issues = []; state.isSyncing = false; state.options = {};
});

/** Lazy blocks resolve a tick or two after mount: wait until the markup stops changing. */
async function settle(m: Mounted): Promise<string> {
  let prev = '';
  for (let i = 0; i < 80; i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 15)); });
    const cur = m.container.innerHTML;
    if (cur !== '' && cur === prev) return cur;
    prev = cur;
  }
  throw new Error('stage4 harness: the render never settled');
}

const line = (id: number, quantity: number, over: Partial<LocalLine> = {}): LocalLine => ({
  productId: id, displayName: `Oat Bar ${id}`, sku: `NB-${id}`, unitPrice: 4.5, basePrice: 4.5, pricingTiers: [], quantity,
  isPreorder: false, excludedFromFreeShipping: false, imageProductId: null, ...over,
});
const issue = (productId: number, over: Partial<ServerCartLine>): ServerCartLine => ({
  productId, name: `Oat Bar ${productId}`, quantity: 1, unitPrice: 4.5, lineTotal: 4.5, imageUrl: null, isPreorder: false,
  outOfStock: false, priceChanged: false, inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null, ...over,
});

function seed(opts: { features?: Record<string, unknown>; signedIn?: boolean; lines?: LocalLine[]; issues?: ServerCartLine[]; native?: boolean; syncing?: boolean }) {
  state.features = { ...FEATURES, ...opts.features };
  state.native = opts.native ?? false;
  state.issues = opts.issues ?? [];
  state.isSyncing = opts.syncing ?? false;
  useSessionStore.setState(opts.signedIn ? { token: 'tok', customer: { id: 1, nickname: 'Sam' } } : { token: null, customer: null });
  useCartStore.setState({ lines: opts.lines ?? [], mode: 'local' });
}

// ---------------------------------------------------------------- header

type Variant = 'storefront' | 'menu' | 'webapp';
type HeaderProps = { topBar?: boolean; search?: boolean; sticky?: boolean };
const ENTRY: Record<Variant, (p: HeaderProps) => ReactNode> = {
  storefront: (p) => <StorefrontHeader {...p} />,
  menu: (p) => <MenuHeader {...p} />,
  webapp: ({ search, sticky }) => <WebAppHeader search={search} sticky={sticky} />,
};

type Ov = 'inherit' | 'show' | 'hide';
interface HeaderCase {
  name: string; variant: Variant; path?: string; signedIn?: boolean; count?: number;
  features?: Record<string, unknown>; native?: boolean;
  /** Store-wide template options (a store that hides an icon by default). */
  options?: Record<string, unknown>;
  /** Stored Header props (v0.7.0 shape); the same choice becomes component props / a core-option scope for the entry. */
  props?: HeaderProps & { accountIcon?: Ov; cartIcon?: Ov };
  /** The default document cannot carry a prop tweak. */
  noDefault?: boolean;
}

const ICON: Record<string, CoreOptions['headerAccountIcon']> = { show: 'all', hide: 'none' };

function headerCases(): HeaderCase[] {
  const out: HeaderCase[] = [];
  for (const variant of ['storefront', 'menu', 'webapp'] as const) {
    for (const signedIn of [false, true]) for (const count of [0, 3]) {
      out.push({ name: `header-${variant}-${signedIn ? 'in' : 'out'}-cart${count}`, variant, signedIn, count });
    }
    const tweak = (suffix: string, extra: Partial<HeaderCase>, prop = false) =>
      out.push({ name: `header-${variant}-in-cart3-${suffix}`, variant, signedIn: true, count: 3, ...extra, ...(prop ? { noDefault: true } : {}) });
    tweak('nosearch', { props: { search: false } }, true);
    tweak('unsticky', { props: { sticky: false } }, true);
    if (variant !== 'webapp') tweak('notopbar', { props: { topBar: false } }, true);
    tweak('account-show', { props: { accountIcon: 'show' } }, true);
    tweak('account-hide', { props: { accountIcon: 'hide' } }, true);
    tweak('cart-show', { props: { cartIcon: 'show' } }, true);
    tweak('cart-hide', { props: { cartIcon: 'hide' } }, true);
    // `show` only means something where the store-wide option would hide the icon.
    tweak('account-show-over-none', { options: { headerAccountIcon: 'none' }, props: { accountIcon: 'show' } }, true);
    tweak('cart-show-over-none', { options: { headerCartIcon: 'none' }, props: { cartIcon: 'show' } }, true);
    tweak('account-inherit-none', { options: { headerAccountIcon: 'none' } });
    tweak('cart-inherit-none', { options: { headerCartIcon: 'none' } });
    tweak('accounts-off', { features: { accounts: false } });
    tweak('ordering-off', { features: { ordering: false } });
    if (variant !== 'storefront') {
      tweak('filtered', { path: '/c/oats' });
      tweak('wholesale', { features: { wholesale: true } });
      tweak('cart-page', { path: '/cart' });
    }
  }
  // Web app: Telegram-native or not, signed in or out, with and without the back chevron.
  for (const native of [true, false]) for (const signedIn of [true, false]) for (const [seg, path] of [['home', '/'], ['cart', '/cart']] as const) {
    out.push({ name: `header-webapp-${native ? 'native' : 'web'}-${signedIn ? 'in' : 'out'}-${seg}`, variant: 'webapp', signedIn, count: signedIn ? 3 : 0, native, path });
  }
  return out;
}

const storedHeader = (c: HeaderCase): ComponentData => ({
  type: 'Header',
  props: {
    id: 'Header-default', variant: c.variant,
    topBar: c.props?.topBar ?? true, search: c.props?.search ?? true, sticky: c.props?.sticky ?? true,
    accountIcon: c.props?.accountIcon ?? 'inherit', cartIcon: c.props?.cartIcon ?? 'inherit', nav: [],
  },
});

describe('stage 4 header goldens (v0.7.0)', () => {
  it.each(headerCases())('$name', async (c) => {
    const path = c.path ?? '/';
    state.options = c.options ?? {};
    seed({ features: { layout: c.variant, ...c.features }, signedIn: c.signedIn, native: c.native, lines: (c.count ?? 0) > 0 ? [line(1, c.count!)] : [] });

    const scope: Partial<CoreOptions> = {};
    if (c.props?.accountIcon && c.props.accountIcon !== 'inherit') scope.headerAccountIcon = ICON[c.props.accountIcon]!;
    if (c.props?.cartIcon && c.props.cartIcon !== 'inherit') scope.headerCartIcon = ICON[c.props.cartIcon]!;
    const entry = mountAt(
      <CoreOptionsScope value={scope}>{ENTRY[c.variant]({ topBar: c.props?.topBar, search: c.props?.search, sticky: c.props?.sticky })}</CoreOptionsScope>,
      { path },
    );
    expectStage4(c.name, await settle(entry));
    cleanup();

    if (!c.noDefault) {
      expectStage4(c.name, await settle(mountDefault('shell', c.variant, { path })));
      cleanup();
    }

    expectStage4(c.name, await settle(mountDoc('shell', c.variant, [storedHeader(c)], { path })));
  });
});

// ---------------------------------------------------------------- cart

interface CartCase {
  name: string; layout?: LayoutKind; signedIn?: boolean; features?: Record<string, unknown>;
  lines: LocalLine[]; issues?: ServerCartLine[]; syncing?: boolean;
}

const ONE = [line(1, 1)];
const THREE = [line(1, 2), line(2, 1, { unitPrice: 3, basePrice: 4, displayName: 'Hazel Spread' }), line(3, 1)];
const MIXED = [line(1, 1), line(2, 1, { isPreorder: true })];

const CART_CASES: CartCase[] = [
  { name: 'empty', lines: [] },
  { name: 'one', lines: ONE },
  { name: 'three', lines: THREE },
  { name: 'inactive', lines: THREE, issues: [issue(2, { inactive: true })] },
  { name: 'belowmin', lines: ONE, issues: [issue(1, { belowMin: true, minOrderQuantity: 5 })] },
  { name: 'abovemax', lines: ONE, issues: [issue(1, { aboveMax: true, maxOrderQuantity: 2 })] },
  { name: 'outofstock-not-blocked', lines: ONE, issues: [issue(1, { outOfStock: true, priceChanged: true })] },
  { name: 'mixed-preorder', lines: MIXED },
  { name: 'syncing', lines: THREE, syncing: true },
  { name: 'webapp-blocked', lines: THREE, layout: 'webapp', issues: [issue(2, { inactive: true })] },
  { name: 'webapp-open', lines: THREE, layout: 'webapp' },
  { name: 'guest-on-out', lines: ONE, features: { guestCheckout: true } },
  { name: 'guest-off-out', lines: ONE, features: { guestCheckout: false } },
  { name: 'guest-off-in', lines: ONE, signedIn: true },
];

const seedCart = (c: CartCase) => seed({
  features: { layout: c.layout ?? 'storefront', ...c.features }, signedIn: c.signedIn, lines: c.lines, issues: c.issues, syncing: c.syncing,
});
/** The v0.7.0-stored cart document: legacy props, the summary slot present. */
const storedCart = (): ComponentData => ({
  type: 'CartContents', props: { id: 'CartContents-default', summary: [{ type: 'CartSummary', props: { id: 'CartSummary-default' } }] },
});

describe('stage 4 cart page goldens (v0.7.0)', () => {
  it.each(CART_CASES)('cart-page-$name', async (c) => {
    const layout = c.layout ?? 'storefront';
    const name = `cart-page-${c.name}`;
    seedCart(c);
    expectStage4(name, await settle(mountAt(<CartPage />, { path: '/cart' })));
    cleanup();
    expectStage4(name, await settle(mountDefault('cart', layout, { path: '/cart' })));
    cleanup();
    expectStage4(name, await settle(mountDoc('cart', layout, [storedCart()], { path: '/cart' })));
  });
});

describe('stage 4 cart drawer goldens (v0.7.0)', () => {
  it.each(CART_CASES.filter((c) => c.layout !== 'webapp'))('cart-drawer-$name', async (c) => {
    seedCart(c);
    useUiStore.setState({ cartOpen: true });
    const m = mountAt(<CartDrawer />, { path: '/' });
    // The drawer's panel is a dynamic chunk requested on mount: the first case pays the cold import.
    await waitFor(() => expect(m.baseElement.querySelector('[data-sf-part="drawer"]')).not.toBeNull(), { timeout: 10000 });
    await settle({ container: m.baseElement, baseElement: m.baseElement });
    const drawer = m.baseElement.querySelector('[data-sf-part="drawer"]');
    expect(drawer, 'no [data-sf-part="drawer"] root rendered').not.toBeNull();
    expectStage4(`cart-drawer-${c.name}`, drawer!.outerHTML);
  });
});

describe('stage 4 cart summary goldens (v0.7.0)', () => {
  const SUMMARY_CASES: (CartCase & { blocked: boolean })[] = [
    { name: 'open', lines: THREE, blocked: false },
    { name: 'blocked', lines: THREE, blocked: true },
    { name: 'mixed', lines: MIXED, blocked: false },
    { name: 'mixed-blocked', lines: MIXED, blocked: true },
    { name: 'webapp-open', lines: THREE, layout: 'webapp', blocked: false },
    { name: 'webapp-blocked', lines: THREE, layout: 'webapp', blocked: true },
    { name: 'guest-on-out', lines: ONE, features: { guestCheckout: true }, blocked: false },
    { name: 'guest-off-out', lines: ONE, blocked: false },
    { name: 'guest-off-in', lines: ONE, signedIn: true, blocked: false },
  ];
  it.each(SUMMARY_CASES)('cart-summary-$name', async (c) => {
    seedCart(c);
    const m = mountAt(<CartSummary blocked={c.blocked} onNavigate={() => {}} />, { path: '/cart' });
    expectStage4(`cart-summary-${c.name}`, await settle(m));
  });
});
