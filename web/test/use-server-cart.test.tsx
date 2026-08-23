import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ServerCart, ServerCartLine } from '@/types/cart.ts';

vi.mock('@/api/cart.ts', () => ({
  fetchCart: vi.fn(),
  putCart: vi.fn(),
  clearCart: vi.fn(),
}));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

import { fetchCart, putCart } from '@/api/cart.ts';
import { notifications } from '@mantine/notifications';
import { ApiError } from '@/lib/errors.ts';
import { useCartStore, type LocalLine } from '@/stores/cart.ts';
import { resetCartSync, SYNC_DEBOUNCE_MS, useServerCart } from '@/features/cart/useServerCart.ts';

const putMock = vi.mocked(putCart);
const fetchMock = vi.mocked(fetchCart);
const showMock = vi.mocked(notifications.show);

function line(overrides: Partial<LocalLine> = {}): LocalLine {
  return {
    productId: 7,
    displayName: 'BPC-157 5mg',
    sku: 'BPC-157-5MG',
    unitPrice: 29,
    basePrice: 29,
    pricingTiers: [],
    quantity: 1,
    isPreorder: false,
    excludedFromFreeShipping: false,
    imageProductId: null,
    ...overrides,
  };
}

function serverLine(overrides: Partial<ServerCartLine> = {}): ServerCartLine {
  return {
    productId: 7,
    name: 'BPC-157 5mg',
    quantity: 1,
    unitPrice: 29,
    lineTotal: 29,
    imageUrl: null,
    isPreorder: false,
    outOfStock: false,
    priceChanged: false,
    inactive: false,
    ...overrides,
  };
}

function serverCart(items: ServerCartLine[]): ServerCart {
  return {
    items,
    subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0),
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
  };
}

/** Run the debounce window out and let the request's promise chain settle. */
async function settle(ms = SYNC_DEBOUNCE_MS) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  resetCartSync();
  useCartStore.setState({
    lines: [line(), line({ productId: 9, displayName: 'TB-500 5mg', sku: 'TB-500-5MG', unitPrice: 34, basePrice: 34 })],
    mode: 'server',
  });
  putMock.mockResolvedValue(serverCart([serverLine()]));
  fetchMock.mockResolvedValue(serverCart([serverLine()]));
});

afterEach(() => {
  vi.useRealTimers();
  resetCartSync();
});

describe('useServerCart', () => {
  it('debounces edits into one PUT carrying the whole line list', async () => {
    const { result } = renderHook(() => useServerCart());

    act(() => {
      result.current.setQuantity(7, 2);
      result.current.setQuantity(7, 3);
    });
    expect(putMock).not.toHaveBeenCalled();

    await settle();

    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock).toHaveBeenCalledWith([
      { productId: 7, quantity: 3 },
      { productId: 9, quantity: 1 },
    ]);
  });

  it('applies the edit optimistically before the PUT lands', () => {
    const { result } = renderHook(() => useServerCart());
    act(() => {
      result.current.setQuantity(7, 4);
    });
    expect(useCartStore.getState().lines[0]!.quantity).toBe(4);
    expect(putMock).not.toHaveBeenCalled();
  });

  it('drops a removed line from the PUT', async () => {
    const { result } = renderHook(() => useServerCart());
    act(() => {
      result.current.remove(9);
    });
    await settle();
    expect(putMock).toHaveBeenCalledWith([{ productId: 7, quantity: 1 }]);
  });

  it('surfaces a 422 and refetches the cart to resync', async () => {
    putMock.mockRejectedValueOnce(new ApiError(422, 'Only 2 left in stock'));
    const { result } = renderHook(() => useServerCart());

    act(() => {
      result.current.setQuantity(7, 99);
    });
    await settle();

    expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Only 2 left in stock' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops reporting a sync once the failed write and its resync are done', async () => {
    putMock.mockRejectedValueOnce(new ApiError(422, 'Only 2 left in stock'));
    const { result } = renderHook(() => useServerCart());

    act(() => {
      result.current.setQuantity(7, 99);
    });
    await settle();

    expect(result.current.isSyncing).toBe(false);
  });

  it('falls back to local mode on 401 and keeps the lines', async () => {
    putMock.mockRejectedValueOnce(new ApiError(401, 'Unauthorized'));
    const { result } = renderHook(() => useServerCart());

    act(() => {
      result.current.setQuantity(7, 2);
    });
    await settle();

    expect(useCartStore.getState().mode).toBe('local');
    expect(useCartStore.getState().lines).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exposes the flagged lines of the last server cart as issues', async () => {
    putMock.mockResolvedValueOnce(
      serverCart([
        serverLine(),
        serverLine({ productId: 9, name: 'TB-500 5mg', inactive: true }),
        serverLine({ productId: 11, name: 'Ipamorelin 5mg', priceChanged: true }),
      ]),
    );
    const { result } = renderHook(() => useServerCart());

    expect(result.current.issues).toEqual([]);

    act(() => {
      result.current.setQuantity(7, 2);
    });
    await settle();

    expect(result.current.issues.map((i) => i.productId)).toEqual([9, 11]);
  });

  it('never calls the API in local mode', async () => {
    useCartStore.setState({ mode: 'local' });
    const { result } = renderHook(() => useServerCart());

    act(() => {
      result.current.setQuantity(7, 5);
      result.current.remove(9);
    });
    await settle();

    expect(putMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useCartStore.getState().lines).toEqual([expect.objectContaining({ productId: 7, quantity: 5 })]);
    expect(result.current.issues).toEqual([]);
  });

  it('mirrors a quick-add through the same debounced PUT', async () => {
    const { result } = renderHook(() => useServerCart());

    act(() => {
      result.current.add(
        { id: 11, displayName: 'Ipamorelin 5mg', sku: 'IPA-5', price: 40, pricingTiers: [], isPreorder: false, excludedFromFreeShipping: false, imageProductId: null } as never,
        2,
      );
    });
    await settle();

    expect(putMock).toHaveBeenCalledWith([
      { productId: 7, quantity: 1 },
      { productId: 9, quantity: 1 },
      { productId: 11, quantity: 2 },
    ]);
  });

  it('refresh() sends a pending edit rather than fetching around it', async () => {
    const { result } = renderHook(() => useServerCart());

    act(() => {
      result.current.setQuantity(7, 4);
    });
    await act(async () => {
      await result.current.refresh();
    });

    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock).toHaveBeenCalledWith([
      { productId: 7, quantity: 4 },
      { productId: 9, quantity: 1 },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refresh() adopts the server cart', async () => {
    fetchMock.mockResolvedValueOnce(serverCart([serverLine({ quantity: 6, lineTotal: 174 })]));
    const { result } = renderHook(() => useServerCart());

    await act(async () => {
      await result.current.refresh();
    });

    expect(useCartStore.getState().lines).toEqual([expect.objectContaining({ productId: 7, quantity: 6 })]);
  });
});
