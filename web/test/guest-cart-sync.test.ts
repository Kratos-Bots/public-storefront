import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ putGuestCart: vi.fn(async () => undefined), deleteGuestCart: vi.fn(async () => undefined) }));
vi.mock('@/api/cart.ts', () => api);
vi.mock('@/app/builder-gate.ts', () => ({ isBuilderMode: () => false, BUILDER_PATH: '/__builder' }));

import { GUEST_SYNC_DEBOUNCE_MS, resetGuestCartSync, scheduleGuestCartSync } from '@/features/cart/guest-cart-sync.ts';
import { useCartStore, type LocalLine } from '@/stores/cart.ts';
import { useSessionStore } from '@/stores/session.ts';

const line = (productId: number, quantity: number): LocalLine => ({
  productId, displayName: `P${productId}`, sku: `S${productId}`, unitPrice: 10, basePrice: 10, pricingTiers: [],
  quantity, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
});

beforeEach(() => {
  vi.useFakeTimers();
  api.putGuestCart.mockClear();
  api.deleteGuestCart.mockClear();
  resetGuestCartSync();
  useCartStore.setState({ lines: [], mode: 'local' });
  useSessionStore.setState({ token: null, customer: null });
});
afterEach(() => vi.useRealTimers());

describe('scheduleGuestCartSync', () => {
  it('sends the whole cart once after a burst of edits', async () => {
    useCartStore.setState({ lines: [line(5, 1)] });
    scheduleGuestCartSync();
    useCartStore.setState({ lines: [line(5, 3), line(7, 1)] });
    scheduleGuestCartSync();

    expect(api.putGuestCart).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(GUEST_SYNC_DEBOUNCE_MS);
    expect(api.putGuestCart).toHaveBeenCalledTimes(1);
    expect(api.putGuestCart).toHaveBeenCalledWith([{ productId: 5, quantity: 3 }, { productId: 7, quantity: 1 }]);
  });

  it('deletes the mirror when the cart is emptied', async () => {
    scheduleGuestCartSync();
    await vi.advanceTimersByTimeAsync(GUEST_SYNC_DEBOUNCE_MS);
    expect(api.deleteGuestCart).toHaveBeenCalledTimes(1);
    expect(api.putGuestCart).not.toHaveBeenCalled();
  });

  it('sends nothing for a signed-in cart', async () => {
    useCartStore.setState({ lines: [line(5, 1)], mode: 'server' });
    scheduleGuestCartSync();
    await vi.advanceTimersByTimeAsync(GUEST_SYNC_DEBOUNCE_MS);
    expect(api.putGuestCart).not.toHaveBeenCalled();
  });

  it('sends nothing if the shopper signs in during the debounce', async () => {
    useCartStore.setState({ lines: [line(5, 1)] });
    scheduleGuestCartSync();
    useCartStore.setState({ mode: 'server' });
    await vi.advanceTimersByTimeAsync(GUEST_SYNC_DEBOUNCE_MS);
    expect(api.putGuestCart).not.toHaveBeenCalled();
  });

  it('sends nothing for a signed-in shopper whose cart is still in local mode', async () => {
    useSessionStore.setState({ token: 'tok' });
    useCartStore.setState({ lines: [line(5, 1)], mode: 'local' });
    scheduleGuestCartSync();
    await vi.advanceTimersByTimeAsync(GUEST_SYNC_DEBOUNCE_MS);
    expect(api.putGuestCart).not.toHaveBeenCalled();
    expect(api.deleteGuestCart).not.toHaveBeenCalled();
  });

  it('sends nothing if a session appears during the debounce', async () => {
    useCartStore.setState({ lines: [line(5, 1)] });
    scheduleGuestCartSync();
    useSessionStore.setState({ token: 'tok' });
    await vi.advanceTimersByTimeAsync(GUEST_SYNC_DEBOUNCE_MS);
    expect(api.putGuestCart).not.toHaveBeenCalled();
    expect(api.deleteGuestCart).not.toHaveBeenCalled();
  });

  it('leaves the cart untouched when the request fails', async () => {
    api.putGuestCart.mockRejectedValueOnce(new Error('offline'));
    useCartStore.setState({ lines: [line(5, 2)] });
    scheduleGuestCartSync();
    await vi.advanceTimersByTimeAsync(GUEST_SYNC_DEBOUNCE_MS);
    expect(useCartStore.getState().lines).toEqual([line(5, 2)]);
    expect(useCartStore.getState().mode).toBe('local');
  });
});
