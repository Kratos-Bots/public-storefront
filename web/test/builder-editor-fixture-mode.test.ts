import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

// setApiInterceptor (and enterFixtureMode) refuse to run outside a framed /__builder.
vi.mock('@/app/builder-gate.ts', async (orig) => ({ ...(await orig<typeof import('@/app/builder-gate.ts')>()), isBuilderMode: () => true }));
const notificationsShow = vi.hoisted(() => vi.fn());
vi.mock('@mantine/notifications', () => ({ notifications: { show: notificationsShow } }));

import { api, setApiInterceptor, unwrap } from '@/api/client.ts';
import { useCartStore } from '@/stores/cart.ts';
import { useSessionStore } from '@/stores/session.ts';
import { saveOrder } from '@/stores/saved-orders.ts';
import { DEFAULT_FORM, clearPersistedCheckout, persistForm } from '@/features/checkout/form-state.ts';
import { applyPreviewAs, enterFixtureMode, PREVIEW_ONLY_MESSAGE } from '@/builder/editor/fixture-mode.ts';
import { createFixtureInterceptor } from '@/builder/editor/fixture-api.ts';
import { FIXTURE_ACCESS_KEY, FIXTURE_CUSTOMER, FIXTURE_ORDER_REF, FIXTURE_TOKEN } from '@/builder/editor/fixtures.ts';
import type { PreviewAs } from '@/builder/mode.ts';
import type { Product } from '@/types/catalog.ts';

// enterFixtureMode shadows the storage globals: keep hold of the shopper's real ones.
const REAL_LOCAL = window.localStorage;
const REAL_SESSION = window.sessionStorage;

function snapshot(s: Storage): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < s.length; i++) out[s.key(i)!] = s.getItem(s.key(i)!)!;
  return out;
}

function seedShopper() {
  REAL_LOCAL.setItem('sf-session-v1', JSON.stringify({ state: { token: 'real-shopper', customer: { id: 7, nickname: 'Real' } }, version: 0 }));
  REAL_LOCAL.setItem('sf-cart-v1', JSON.stringify({ state: { lines: [] }, version: 0 }));
  REAL_LOCAL.setItem('sf-orders-v1', JSON.stringify([{ reference: 'NB0001', accessKey: 'k', savedAt: '2026-09-01T00:00:00.000Z' }]));
  REAL_LOCAL.setItem('sf-checkout-v1', JSON.stringify({ ...DEFAULT_FORM, email: 'shopper@shop.example' }));
  REAL_LOCAL.setItem('sf-theme-v2', '{"v":2}');
  REAL_SESSION.setItem('sf-shopper-tab', 'kept');
}

describe('fixture mode', () => {
  beforeEach(() => {
    REAL_LOCAL.clear();
    REAL_SESSION.clear();
    notificationsShow.mockClear();
  });

  it('never writes the session or cart to the shop origin, and ignores the admin\'s own stored shopper', () => {
    REAL_LOCAL.setItem('sf-session-v1', JSON.stringify({ state: { token: 'real-shopper', customer: { id: 7, nickname: 'Real' } }, version: 0 }));
    const before = REAL_LOCAL.getItem('sf-session-v1');
    enterFixtureMode();
    expect(useSessionStore.getState().token).toBeNull();
    applyPreviewAs({ session: 'signed-in-orders', cart: 'items' }, new QueryClient());
    expect(useSessionStore.getState()).toMatchObject({ token: FIXTURE_TOKEN, customer: FIXTURE_CUSTOMER });
    expect(useCartStore.getState().lines).toHaveLength(2);
    expect(REAL_LOCAL.getItem('sf-session-v1')).toBe(before);
    expect(REAL_LOCAL.getItem('sf-cart-v1')).toBeNull();
  });

  it('is idempotent', () => {
    enterFixtureMode();
    applyPreviewAs({ session: 'signed-in', cart: 'items' }, new QueryClient());
    const storage = window.localStorage;
    enterFixtureMode();
    expect(window.localStorage).toBe(storage);
    expect(useSessionStore.getState().token).toBe(FIXTURE_TOKEN);
  });

  it('makes cart and session actions inert, and says so for the cart', () => {
    enterFixtureMode();
    applyPreviewAs({ session: 'signed-in', cart: 'items' }, new QueryClient());
    // OrderPlacedPage / PaymentSuccessPage clear the cart on mount: no toast without a user action.
    useCartStore.getState().clear();
    expect(notificationsShow).not.toHaveBeenCalled();
    useCartStore.getState().remove(900101);
    useCartStore.getState().add({ id: 5 } as Product);
    useCartStore.getState().clear();
    useCartStore.getState().setMode('server');
    useSessionStore.getState().clear();
    useSessionStore.getState().setSession('other', { id: 1, nickname: null });
    expect(useCartStore.getState()).toMatchObject({ mode: 'local' });
    expect(useCartStore.getState().lines).toHaveLength(2);
    expect(useSessionStore.getState().token).toBe(FIXTURE_TOKEN);
    expect(notificationsShow).toHaveBeenCalledWith({ id: 'sf-builder-preview-only', message: PREVIEW_ONLY_MESSAGE });
  });

  it('applyPreviewAs refuses to run before fixture mode is entered', async () => {
    vi.resetModules();
    const fresh = await import('@/builder/editor/fixture-mode.ts');
    const session = await import('@/stores/session.ts');
    expect(() => fresh.applyPreviewAs({ session: 'signed-in', cart: 'items' }, new QueryClient())).toThrow(/fixture mode/);
    expect(session.useSessionStore.getState().token).toBeNull();
    expect(REAL_LOCAL.getItem('sf-session-v1')).toBeNull();
  });

  it('a fixture 401 does not sign the fixture out', async () => {
    enterFixtureMode();
    let as: PreviewAs = { session: 'signed-in', cart: 'empty' };
    applyPreviewAs(as, new QueryClient());
    const off = setApiInterceptor(createFixtureInterceptor(() => as, vi.fn()));
    try {
      as = { session: 'signed-out', cart: 'empty' };
      await expect(unwrap(api.get('storefront/profile'))).rejects.toMatchObject({ status: 401 });
      as = { session: 'signed-in', cart: 'empty' };
      expect(useSessionStore.getState().token).toBe(FIXTURE_TOKEN);
    } finally {
      off();
    }
  });

  it('switching Preview as resets fixture-backed queries but keeps live ones', () => {
    const client = new QueryClient();
    client.setQueryData(['settings'], { live: true });
    client.setQueryData(['catalog', null], { live: true });
    client.setQueryData(['pages', 'storefront'], { live: true });
    client.setQueryData(['profile'], { fixture: true });
    client.setQueryData(['cart'], { fixture: true });
    enterFixtureMode();
    applyPreviewAs({ session: 'signed-out', cart: 'empty' }, client);
    expect(client.getQueryData(['settings'])).toEqual({ live: true });
    expect(client.getQueryData(['catalog', null])).toEqual({ live: true });
    expect(client.getQueryData(['pages', 'storefront'])).toEqual({ live: true });
    expect(client.getQueryData(['profile'])).toBeUndefined();
    expect(client.getQueryData(['cart'])).toBeUndefined();
    expect(useSessionStore.getState().token).toBeNull();
    expect(useCartStore.getState().lines).toEqual([]);
  });

  it('a whole fixture session leaves the shopper\'s localStorage and sessionStorage exactly as they were', async () => {
    seedShopper();
    const local = snapshot(REAL_LOCAL);
    const session = snapshot(REAL_SESSION);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    enterFixtureMode();
    let as: PreviewAs = { session: 'signed-in-orders', cart: 'items' };
    const client = new QueryClient();
    applyPreviewAs(as, client);
    const off = setApiInterceptor(createFixtureInterceptor(() => as, vi.fn()));
    try {
      await unwrap(api.get('storefront/profile'));
      await unwrap(api.get('storefront/cart'));
      await unwrap(api.get(`orders/${FIXTURE_ORDER_REF}/${FIXTURE_ACCESS_KEY}`));
      await expect(unwrap(api.post('storefront/auth/logout'))).rejects.toMatchObject({ status: 400 });
      as = { session: 'signed-out', cart: 'empty' };
      applyPreviewAs(as, client);
      await expect(unwrap(api.get('storefront/orders'))).rejects.toMatchObject({ status: 401 });
    } finally {
      off();
    }
    // What the shopper pages do on their own when they render in the frame:
    saveOrder(FIXTURE_ORDER_REF, FIXTURE_ACCESS_KEY); // OrderStatusPage on a loaded order
    persistForm({ ...DEFAULT_FORM, email: 'morgan@shop.example' }); // CheckoutPage on typing
    clearPersistedCheckout(); // OrderPlacedPage / PaymentSuccessPage
    localStorage.setItem('sf-theme-v2', '{"v":2,"draft":true}');
    sessionStorage.setItem('__telegram__initParams', '{}');
    useCartStore.getState().add({ id: 5 } as Product);
    await useSessionStore.persist.rehydrate();
    await useCartStore.persist.rehydrate();

    expect(snapshot(REAL_LOCAL)).toEqual(local);
    expect(snapshot(REAL_SESSION)).toEqual(session);
    // Nothing above reached the network either: every call was answered in the frame.
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
