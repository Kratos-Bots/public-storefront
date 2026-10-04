import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/auth.ts', () => ({ logout: vi.fn(async () => undefined) }));
import { logout } from '@/api/auth.ts';
vi.mock('@/features/cart/useServerCart.ts', () => ({ resetCartSync: vi.fn() }));

import { signOutAndReload } from '@/features/auth/sign-out.ts';
import { clearSavedOrders, listSavedOrders, saveOrder } from '@/stores/saved-orders.ts';
import { useSessionStore } from '@/stores/session.ts';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('location', { ...window.location, assign: vi.fn() });
});

describe('signing out forgets the saved order links', () => {
  it('the storage key is gone and nothing is offered to the next visitor', async () => {
    useSessionStore.setState({ token: 'tok', customer: { id: 1, nickname: 'Ada' } });
    saveOrder('K4M2QP', 'abc');
    expect(listSavedOrders()).toHaveLength(1);
    await signOutAndReload();
    expect(localStorage.getItem('sf-orders-v1')).toBeNull();
    expect(listSavedOrders()).toEqual([]);
    expect(useSessionStore.getState().token).toBeNull();
  });

  it('a logout request that fails still ends the session and clears them', async () => {
    vi.mocked(logout).mockRejectedValueOnce(new Error('offline'));
    useSessionStore.setState({ token: 'tok', customer: { id: 1, nickname: 'Ada' } });
    saveOrder('K4M2QP', 'abc');
    await signOutAndReload();
    expect(listSavedOrders()).toEqual([]);
    expect(useSessionStore.getState().token).toBeNull();
  });

  it('a silent 401 session clear does not touch them', () => {
    saveOrder('K4M2QP', 'abc');
    useSessionStore.getState().clear();
    expect(listSavedOrders()).toHaveLength(1);
  });

  it('clearing is safe when storage throws', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    expect(() => clearSavedOrders()).not.toThrow();
    vi.restoreAllMocks();
  });
});
