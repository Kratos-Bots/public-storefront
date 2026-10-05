import { afterEach, describe, expect, it, vi } from 'vitest';

const apis = vi.hoisted(() => ({ logout: vi.fn(async () => undefined) }));
vi.mock('@/api/auth.ts', () => ({ logout: apis.logout }));

import { clearLegacyOrderKeys, LEGACY_ORDER_KEYS_STORAGE_KEY } from '@/app/legacy-storage.ts';
import { signOutAndReload } from '@/features/auth/sign-out.ts';

const seed = () =>
  localStorage.setItem(LEGACY_ORDER_KEYS_STORAGE_KEY, JSON.stringify([{ reference: 'K4M2QP', accessKey: 'abcdef0123456789' }]));

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('saved order access keys from the removed order-links store', () => {
  it('uses the key the old store wrote', () => {
    expect(LEGACY_ORDER_KEYS_STORAGE_KEY).toBe('sf-orders-v1');
  });

  it('the boot clean-up removes them and leaves other storage alone', () => {
    seed();
    localStorage.setItem('sf-session-v1', '{}');
    clearLegacyOrderKeys();
    expect(localStorage.getItem('sf-orders-v1')).toBeNull();
    expect(localStorage.getItem('sf-session-v1')).toBe('{}');
  });

  it('does nothing, and does not throw, when there is nothing stored', () => {
    expect(() => clearLegacyOrderKeys()).not.toThrow();
  });

  it('does not throw when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => clearLegacyOrderKeys()).not.toThrow();
  });

  it('signing out clears them too', async () => {
    seed();
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    await signOutAndReload();
    expect(localStorage.getItem('sf-orders-v1')).toBeNull();
    expect(assign).toHaveBeenCalledWith('/');
    vi.unstubAllGlobals();
  });
});
