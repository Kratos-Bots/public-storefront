import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { StorefrontSettings } from '@/types/settings.ts';

const state = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings as unknown as StorefrontSettings }));

import { useCartStore, type LocalLine } from '@/stores/cart.ts';
import { useOrderUnitLimit } from '@/features/cart/useOrderUnitLimit.ts';

const line = (productId: number, quantity: number): LocalLine => ({
  productId, displayName: `P${productId}`, sku: `P-${productId}`, unitPrice: 5, basePrice: 5, pricingTiers: [], quantity,
  isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
});

beforeEach(() => {
  state.settings = {};
  useCartStore.setState({ lines: [], mode: 'local' });
});

describe('useOrderUnitLimit', () => {
  it('a guest cart of 3 against a limit of 2 is over by 1', () => {
    state.settings = { limits: { maxOrderUnits: 2 } };
    useCartStore.setState({ lines: [line(1, 2), line(2, 1)], mode: 'local' });
    const { result } = renderHook(() => useOrderUnitLimit());
    expect(result.current).toEqual({ max: 2, units: 3, over: true, excess: 1, remaining: 0 });
  });
  it('a signed-in (server mode) cart counts the same lines', () => {
    state.settings = { limits: { maxOrderUnits: 2 } };
    useCartStore.setState({ lines: [line(1, 3)], mode: 'server' });
    expect(renderHook(() => useOrderUnitLimit()).result.current.over).toBe(true);
  });
  it('follows the cart as it shrinks', () => {
    state.settings = { limits: { maxOrderUnits: 2 } };
    useCartStore.setState({ lines: [line(1, 3)], mode: 'local' });
    const { result } = renderHook(() => useOrderUnitLimit());
    expect(result.current.over).toBe(true);
    act(() => useCartStore.setState({ lines: [line(1, 2)] }));
    expect(result.current.over).toBe(false);
  });
  it('settings without limits (an older backend) is never over', () => {
    useCartStore.setState({ lines: [line(1, 50)], mode: 'local' });
    expect(renderHook(() => useOrderUnitLimit()).result.current).toMatchObject({ max: null, units: 50, over: false });
  });
  it('a null limit is never over', () => {
    state.settings = { limits: { maxOrderUnits: null } };
    useCartStore.setState({ lines: [line(1, 50)], mode: 'local' });
    expect(renderHook(() => useOrderUnitLimit()).result.current.over).toBe(false);
  });
});
