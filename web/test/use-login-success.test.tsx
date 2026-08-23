import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LoginResult } from '@/types/auth.ts';
import type { ServerCart, ServerCartLine } from '@/types/cart.ts';

vi.mock('@/api/cart.ts', () => ({
  fetchCart: vi.fn(),
  putCart: vi.fn(),
  clearCart: vi.fn(),
}));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

const navigate = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}));

import { fetchCart, putCart } from '@/api/cart.ts';
import { notifications } from '@mantine/notifications';
import { ApiError } from '@/lib/errors.ts';
import { useCartStore, type LocalLine } from '@/stores/cart.ts';
import { useSessionStore } from '@/stores/session.ts';
import { resetCartSync } from '@/features/cart/useServerCart.ts';
import { safeReturnTo, unionCartLines, useLoginSuccess } from '@/features/auth/useLoginSuccess.ts';

const fetchMock = vi.mocked(fetchCart);
const putMock = vi.mocked(putCart);
const showMock = vi.mocked(notifications.show);

const result: LoginResult = { token: 'sess-token', customer: { id: 42, nickname: 'Jane D.' } };

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

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function signIn(login: LoginResult = result) {
  const { result: hook } = renderHook(() => useLoginSuccess(), { wrapper });
  await act(async () => {
    await hook.current(login);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  resetCartSync();
  useSessionStore.setState({ token: null, customer: null, returnTo: null });
  useCartStore.setState({ lines: [], mode: 'local' });
  fetchMock.mockResolvedValue(serverCart([]));
  putMock.mockResolvedValue(serverCart([]));
});

afterEach(() => {
  resetCartSync();
});

describe('unionCartLines', () => {
  it('sums the quantities of a product both carts hold', () => {
    expect(unionCartLines([serverLine({ productId: 7, quantity: 2 })], [{ productId: 7, quantity: 3 }])).toEqual([
      { productId: 7, quantity: 5 },
    ]);
  });

  it('keeps the server’s lines first and appends the ones only this browser has', () => {
    const union = unionCartLines(
      [serverLine({ productId: 7, quantity: 1 }), serverLine({ productId: 9, quantity: 4 })],
      [
        { productId: 9, quantity: 2 },
        { productId: 11, quantity: 1 },
      ],
    );
    expect(union).toEqual([
      { productId: 7, quantity: 1 },
      { productId: 9, quantity: 6 },
      { productId: 11, quantity: 1 },
    ]);
  });

  it('is the server’s cart when nothing is held locally', () => {
    expect(unionCartLines([serverLine({ quantity: 3 })], [])).toEqual([{ productId: 7, quantity: 3 }]);
  });
});

describe('safeReturnTo', () => {
  it('accepts an in-app path', () => {
    expect(safeReturnTo('/checkout')).toBe('/checkout');
    expect(safeReturnTo('/account/orders?page=2')).toBe('/account/orders?page=2');
  });

  it('rejects anything that could leave the shop', () => {
    expect(safeReturnTo('https://evil.example/steal')).toBeNull();
    expect(safeReturnTo('//evil.example/steal')).toBeNull();
    expect(safeReturnTo('/\\evil.example')).toBeNull();
    expect(safeReturnTo('javascript:alert(1)')).toBeNull();
    expect(safeReturnTo('checkout')).toBeNull();
    expect(safeReturnTo(null)).toBeNull();
    expect(safeReturnTo('')).toBeNull();
  });
});

describe('useLoginSuccess', () => {
  it('stores the session before it touches the cart', async () => {
    fetchMock.mockImplementation(async () => {
      // The Bearer header is injected from the store, so the token has to be in
      // place before the first authenticated call goes out.
      expect(useSessionStore.getState().token).toBe('sess-token');
      return serverCart([]);
    });

    await signIn();

    expect(useSessionStore.getState().customer).toEqual({ id: 42, nickname: 'Jane D.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('merges the local cart into the server cart and adopts the result', async () => {
    useCartStore.setState({
      lines: [line({ productId: 7, quantity: 2 }), line({ productId: 11, displayName: 'Ipamorelin 5mg', quantity: 1 })],
      mode: 'local',
    });
    fetchMock.mockResolvedValue(serverCart([serverLine({ productId: 7, quantity: 1 }), serverLine({ productId: 9, quantity: 3 })]));
    putMock.mockResolvedValue(
      serverCart([
        serverLine({ productId: 7, quantity: 3, lineTotal: 87 }),
        serverLine({ productId: 9, quantity: 3, lineTotal: 87 }),
        serverLine({ productId: 11, name: 'Ipamorelin 5mg', quantity: 1 }),
      ]),
    );

    await signIn();

    expect(putMock).toHaveBeenCalledWith([
      { productId: 7, quantity: 3 },
      { productId: 9, quantity: 3 },
      { productId: 11, quantity: 1 },
    ]);
    expect(useCartStore.getState().mode).toBe('server');
    expect(useCartStore.getState().lines.map((l) => [l.productId, l.quantity])).toEqual([
      [7, 3],
      [9, 3],
      [11, 1],
    ]);
  });

  it('adopts the server cart without a write when nothing was in the local cart', async () => {
    fetchMock.mockResolvedValue(serverCart([serverLine({ productId: 9, quantity: 2, lineTotal: 58 })]));

    await signIn();

    expect(putMock).not.toHaveBeenCalled();
    expect(useCartStore.getState().mode).toBe('server');
    expect(useCartStore.getState().lines.map((l) => l.productId)).toEqual([9]);
  });

  it('invalidates the cart query so anything reading it refetches', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await signIn();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['cart'] });
  });

  it('goes to the account by default', async () => {
    await signIn();
    expect(navigate).toHaveBeenCalledWith('/account', { replace: true });
  });

  it('goes where the customer was headed, and forgets it afterwards', async () => {
    useSessionStore.setState({ returnTo: '/checkout' });
    await signIn();
    expect(navigate).toHaveBeenCalledWith('/checkout', { replace: true });
    expect(useSessionStore.getState().returnTo).toBeNull();
  });

  it('refuses an off-site return path', async () => {
    useSessionStore.setState({ returnTo: 'https://evil.example/steal' });
    await signIn();
    expect(navigate).toHaveBeenCalledWith('/account', { replace: true });
  });

  it('signs in anyway when the cart merge fails, and says so', async () => {
    useCartStore.setState({ lines: [line({ productId: 7, quantity: 2 })], mode: 'local' });
    putMock.mockRejectedValue(new ApiError(422, 'Product(s) 7 are no longer available'));

    await signIn();

    expect(useSessionStore.getState().token).toBe('sess-token');
    expect(navigate).toHaveBeenCalledWith('/account', { replace: true });
    expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ color: 'red' }));
    // The lines the shopper picked are still theirs — a failed mirror must not eat them.
    expect(useCartStore.getState().lines.map((l) => [l.productId, l.quantity])).toEqual([[7, 2]]);
  });

  it('signs in anyway when the cart cannot even be read', async () => {
    fetchMock.mockRejectedValue(new ApiError(0, 'Network error'));

    await signIn();

    expect(useSessionStore.getState().token).toBe('sess-token');
    expect(navigate).toHaveBeenCalledWith('/account', { replace: true });
    expect(showMock).toHaveBeenCalled();
  });
});
