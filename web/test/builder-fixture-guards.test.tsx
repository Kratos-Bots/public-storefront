// The builder-mode guards in shopper code (Plan 3 Task 7): inside the editor frame nothing may
// load a third-party script, open a tab, navigate the frame away or read builder overrides
// outside builder mode. Every guard is a no-op for shoppers — the `builder: false` cases pin that.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRef, forwardRef, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { PaymentMethod } from '@/types/checkout.ts';
import type { PublicOrder } from '@/types/public-order.ts';

const g = vi.hoisted(() => ({
  builder: true,
  turnstiles: 0,
  pageFetches: [] as string[],
  settings: {
    enabled: true,
    currency: 'GBP',
    features: { layout: 'menu' },
    telegramWebApp: { mode: 'off' },
    turnstile: { siteKey: '1x00000000000000000000AA' },
    brand: { name: 'Northbound Supply', shortName: 'Northbound', links: { whatsapp: null, telegram: null } },
    supportLinks: [],
  },
}));

vi.mock('@/app/builder-gate.ts', async (orig) => ({ ...(await orig<typeof import('@/app/builder-gate.ts')>()), isBuilderMode: () => g.builder }));
vi.mock('@/app/settings.ts', async (orig) => ({ ...(await orig<typeof import('@/app/settings.ts')>()), useSettings: () => g.settings }));
vi.mock('@/lib/telegram-webapp.ts', async (orig) => ({ ...(await orig<typeof import('@/lib/telegram-webapp.ts')>()), isTelegramWebApp: () => false }));
vi.mock('@/api/pages.ts', () => ({ fetchPageSet: (layout: string) => { g.pageFetches.push(layout); return Promise.resolve(null); }, fetchPublished: (layout: string) => { g.pageFetches.push(layout); return Promise.resolve({ pageSet: null, text: null }); } }));
vi.mock('@/api/auth.ts', async (orig) => ({ ...(await orig<typeof import('@/api/auth.ts')>()), logout: vi.fn(() => Promise.reject(new Error('Preview only'))) }));
vi.mock('@/api/public-order.ts', () => ({
  PaymentConflictError: class PaymentConflictError extends Error {},
  fetchPaymentOptions: vi.fn(),
  selectPaymentMethod: vi.fn(() => Promise.reject(new Error('Preview only'))),
}));
vi.mock('@/api/tracking.ts', async (orig) => ({ ...(await orig<typeof import('@/api/tracking.ts')>()), lookupTracking: vi.fn(() => new Promise(() => undefined)) }));
vi.mock('@/features/account/queries.ts', () => ({
  useProfile: () => ({
    isPending: false,
    isError: false,
    data: { nickname: 'Morgan', memberSince: '2026-03-02T09:00:00.000Z', totalOrders: 2, totalSpend: 40, identities: { telegram: false, whatsapp: true, email: true } },
  }),
}));
vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: forwardRef(function Turnstile() {
    g.turnstiles += 1;
    return <div data-testid="turnstile" />;
  }),
}));

import { builderOverrides } from '@/app/builder-gate.ts';
import { useEffectiveLayout } from '@/app/layout.ts';
import { usePrefetchPageSet } from '@/app/App.tsx';
import { logout } from '@/api/auth.ts';
import { fetchPaymentOptions, selectPaymentMethod } from '@/api/public-order.ts';
import { lookupTracking } from '@/api/tracking.ts';
import { TELEGRAM_WIDGET_SRC, TelegramLogin } from '@/features/auth/TelegramLogin.tsx';
import { GuestTurnstile, type GuestTurnstileHandle } from '@/features/checkout/GuestTurnstile.tsx';
import { ProfilePage } from '@/features/account/ProfilePage.tsx';
import { MethodPicker } from '@/features/order-status/MethodPicker.tsx';
import { TrackingPage } from '@/features/tracking/TrackingPage.tsx';
import { loadTelegramSdk, TELEGRAM_SDK_SRC } from '@/lib/telegram-webapp.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useCartStore } from '@/stores/cart.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

const wrap = (children: ReactNode) => (
  <MantineProvider>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
  </MantineProvider>
);
const scriptWith = (src: string) => [...document.querySelectorAll('script')].some((s) => s.src === src);
const settle = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  g.builder = true;
  g.turnstiles = 0;
  g.pageFetches = [];
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  act(() => builderOverrides.setState({ theme: null, layout: null }));
  document.head.querySelectorAll('script').forEach((s) => s.remove());
  sessionStorage.clear();
});

describe('builder overrides are read only in builder mode', () => {
  it('useEffectiveLayout ignores a builder layout outside builder mode', () => {
    act(() => builderOverrides.setState({ layout: 'webapp' }));
    g.builder = false;
    expect(renderHook(() => useEffectiveLayout()).result.current).toBe('menu');
    g.builder = true;
    expect(renderHook(() => useEffectiveLayout()).result.current).toBe('webapp');
  });

  it('usePrefetchPageSet skips in builder mode even after in-frame navigation left /__builder', async () => {
    window.history.replaceState(null, '', '/');
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    renderHook(() => usePrefetchPageSet(g.settings as unknown as StorefrontSettings), { wrapper });
    await settle();
    expect(g.pageFetches).toEqual([]);

    g.builder = false;
    renderHook(() => usePrefetchPageSet(g.settings as unknown as StorefrontSettings), { wrapper });
    await waitFor(() => expect(g.pageFetches).toEqual(['menu']));
  });
});

describe('ProfilePage sign-out', () => {
  it('in builder mode: the refused logout keeps the fixture session and never navigates the frame', async () => {
    useSessionStore.setState({ token: 'sf-builder-fixture-token', customer: { id: 900001, nickname: 'Morgan' } });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(wrap(<MemoryRouter><ProfilePage /></MemoryRouter>));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled());
    expect(logout).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().token).toBe('sf-builder-fixture-token');
    // jsdom reports window.location.assign as a not-implemented navigation.
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/navigation/i);
    errors.mockRestore();
    useSessionStore.setState({ token: null, customer: null });
  });
});

describe('ProfilePage sign-out for shoppers', () => {
  // jsdom's window.location is unforgeable and its navigation is silent, so the reload itself
  // can't be observed here; it is the unconditional statement right after these clears.
  it('still clears the session and the cart', async () => {
    g.builder = false;
    useSessionStore.setState({ token: 'shopper-token', customer: { id: 7, nickname: 'Morgan' } });
    useCartStore.setState({ mode: 'server', lines: [{ productId: 1, displayName: 'Northbound Field Kit', sku: 'NB-FK-01', unitPrice: 48, basePrice: 48, pricingTiers: [], quantity: 1, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null }] });
    render(wrap(<MemoryRouter><ProfilePage /></MemoryRouter>));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(useSessionStore.getState().token).toBeNull());
    expect(useCartStore.getState()).toMatchObject({ lines: [], mode: 'local' });
    expect(logout).toHaveBeenCalledTimes(1);
    // The builder guard did not fire: the button stays in its signing-out state until the reload.
    expect(screen.getByRole('button', { name: 'Signing out' })).toBeDisabled();
  });
});

describe('MethodPicker hosted checkout', () => {
  const card: PaymentMethod = {
    slot: 'card', method: 'card', displayName: 'Card payment', type: 'gateway', details: null,
    feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 64.9,
  };
  const order = {
    reference: 'NB0977', status: 'pending', createdAt: '2026-09-02T10:15:00.000Z', deliveredAt: null, isPreorder: false, currency: 'GBP',
    items: [], totals: { subtotal: 62, shippingAmount: 2.9, discountAmount: 0, taxAmount: 0, totalAmount: 64.9 },
    shippingAddress: null, shipments: [], payment: { canPay: true, payBy: null, activePayment: null },
  } as unknown as PublicOrder;

  async function pickCard() {
    vi.mocked(fetchPaymentOptions).mockResolvedValue([card]);
    render(wrap(<MethodPicker order={order} reference="NB0977" accessKey="preview" />));
    fireEvent.click((await screen.findAllByRole('button', { name: /^Card/ }))[0]!);
    await waitFor(() => expect(selectPaymentMethod).toHaveBeenCalled());
  }

  it('in builder mode: never opens a blank tab before the (refused) mutation', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await pickCard();
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('for shoppers: still opens the tab on the click itself', async () => {
    g.builder = false;
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await pickCard();
    expect(open).toHaveBeenCalledWith('', '_blank');
    open.mockRestore();
  });
});

describe('no third-party scripts in the editor frame', () => {
  it('TelegramLogin shows a preview placeholder instead of loading the widget', () => {
    render(wrap(<TelegramLogin botUsername="northbound_bot" onAuth={vi.fn()} />));
    expect(scriptWith(TELEGRAM_WIDGET_SRC)).toBe(false);
    expect(screen.getByText(/Preview/)).toBeInTheDocument();
  });

  it('TelegramLogin still loads the widget for shoppers', () => {
    g.builder = false;
    render(wrap(<TelegramLogin botUsername="northbound_bot" onAuth={vi.fn()} />));
    expect(scriptWith(TELEGRAM_WIDGET_SRC)).toBe(true);
    expect(screen.queryByText(/Preview/)).toBeNull();
  });

  it('loadTelegramSdk never loads the Mini App SDK in builder mode, even after a Telegram launch on this origin', async () => {
    sessionStorage.setItem('__telegram__initParams', '{}');
    await loadTelegramSdk(10);
    expect(scriptWith(TELEGRAM_SDK_SRC)).toBe(false);
    g.builder = false;
    await loadTelegramSdk(10);
    expect(scriptWith(TELEGRAM_SDK_SRC)).toBe(true);
  });

  it('GuestTurnstile renders no widget in builder mode and mints a preview token at once', async () => {
    const ref = createRef<GuestTurnstileHandle>();
    render(wrap(<GuestTurnstile ref={ref} siteKey="1x00000000000000000000AA" />));
    expect(g.turnstiles).toBe(0);
    await expect(ref.current!.mint()).resolves.toEqual(expect.any(String));
  });

  it('GuestTurnstile still renders the widget for shoppers', () => {
    g.builder = false;
    render(wrap(<GuestTurnstile siteKey="1x00000000000000000000AA" />));
    expect(g.turnstiles).toBeGreaterThan(0);
  });

  it('TrackingPage renders no widget in builder mode and goes straight to the (intercepted) lookup', async () => {
    render(wrap(
      <MemoryRouter initialEntries={['/tracking/NB0977']}>
        <Routes><Route path="/tracking/:reference" element={<TrackingPage />} /></Routes>
      </MemoryRouter>,
    ));
    await waitFor(() => expect(lookupTracking).toHaveBeenCalledWith(expect.objectContaining({ reference: 'NB0977' })));
    expect(g.turnstiles).toBe(0);
  });

  it('TrackingPage still renders the widget and waits for its token for shoppers', async () => {
    g.builder = false;
    render(wrap(
      <MemoryRouter initialEntries={['/tracking/NB0977']}>
        <Routes><Route path="/tracking/:reference" element={<TrackingPage />} /></Routes>
      </MemoryRouter>,
    ));
    await settle();
    expect(g.turnstiles).toBeGreaterThan(0);
    expect(lookupTracking).not.toHaveBeenCalled();
  });
});
