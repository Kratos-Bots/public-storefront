import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  post: vi.fn(),
  del: vi.fn(),
  get: vi.fn(),
  order: [] as string[],
}));
vi.mock('@/api/client.ts', () => ({
  api: { post: h.post, delete: h.del, get: h.get },
  unwrap: async (p: Promise<{ json: () => Promise<{ data: unknown }> }>) => (await (await p).json()).data,
}));
vi.mock('@/api/auth.ts', () => ({ logout: vi.fn(() => { h.order.push('logout'); return Promise.resolve(null); }) }));
vi.mock('@/features/cart/useServerCart.ts', () => ({ resetCartSync: vi.fn() }));
vi.mock('@/app/access-gate.ts', () => ({ accessGate: { getState: () => ({ reset: vi.fn() }) } }));
vi.mock('@/app/legacy-storage.ts', () => ({ clearLegacyOrderKeys: vi.fn() }));

import { currentEndpoint, subscribeThisDevice, unsubscribeThisDevice } from '@/features/push/client.ts';
import { signOutAndReload } from '@/features/auth/sign-out.ts';

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';
const ok = (data: unknown) => Promise.resolve({ json: async () => ({ success: true, data, error: null }) });

// A key that decodes to 65 bytes like a real VAPID public key.
const KEY = Buffer.from(new Uint8Array(65).fill(4)).toString('base64url');

function makeSub() {
  return {
    endpoint: ENDPOINT,
    options: { applicationServerKey: new Uint8Array(65).fill(4).buffer },
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'P256', auth: 'AUTH' } }),
    unsubscribe: vi.fn(async () => { h.order.push('local-unsubscribe'); return true; }),
  };
}

let existing: ReturnType<typeof makeSub> | null;
let subscribe: ReturnType<typeof vi.fn>;
let register: ReturnType<typeof vi.fn>;
let requestPermission: ReturnType<typeof vi.fn>;

beforeEach(() => {
  h.post.mockReset(); h.del.mockReset(); h.get.mockReset(); h.order.length = 0;
  existing = null;
  subscribe = vi.fn(async () => makeSub());
  register = vi.fn(async () => ({}));
  const reg = { pushManager: { getSubscription: vi.fn(async () => existing), subscribe } };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register, ready: Promise.resolve(reg), getRegistration: vi.fn(async () => reg) },
  });
  requestPermission = vi.fn(async () => 'granted');
  vi.stubGlobal('Notification', { requestPermission, permission: 'default' });
  h.post.mockReturnValue(ok({ id: 1, deviceLabel: 'Chrome on Windows' }));
  h.del.mockImplementation(() => { h.order.push('delete'); return Promise.resolve({}); });
  vi.stubGlobal('location', { ...window.location, assign: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('subscribeThisDevice', () => {
  it('subscribe posts endpoint+keys', async () => {
    await subscribeThisDevice(KEY);

    expect(requestPermission).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith('/sw.js');
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(h.post).toHaveBeenCalledWith('storefront/push/subscriptions', {
      json: { endpoint: ENDPOINT, keys: { p256dh: 'P256', auth: 'AUTH' } },
    });
  });

  it('asks for permission before it registers anything', async () => {
    requestPermission.mockImplementation(async () => { h.order.push('permission'); return 'granted'; });
    register.mockImplementation(async () => { h.order.push('register'); return {}; });
    await subscribeThisDevice(KEY);
    expect(h.order.slice(0, 2)).toEqual(['permission', 'register']);
  });

  it('stops without registering or posting when permission is refused', async () => {
    requestPermission.mockResolvedValue('denied');
    await expect(subscribeThisDevice(KEY)).rejects.toThrow();
    expect(register).not.toHaveBeenCalled();
    expect(h.post).not.toHaveBeenCalled();
  });

  it('reuses a subscription made against the same key', async () => {
    existing = makeSub();
    await subscribeThisDevice(KEY);
    expect(subscribe).not.toHaveBeenCalled();
    expect(h.post).toHaveBeenCalledOnce();
  });

  it('replaces a subscription made against another key', async () => {
    existing = makeSub();
    existing.options.applicationServerKey = new Uint8Array(65).fill(9).buffer;
    await subscribeThisDevice(KEY);
    expect(existing.unsubscribe).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledOnce();
  });
});

describe('currentEndpoint / unsubscribeThisDevice', () => {
  it('reports the endpoint, or null without a subscription', async () => {
    expect(await currentEndpoint()).toBeNull();
    existing = makeSub();
    expect(await currentEndpoint()).toBe(ENDPOINT);
  });

  it('deletes on the server before it drops the local subscription', async () => {
    existing = makeSub();
    await unsubscribeThisDevice();
    expect(h.del).toHaveBeenCalledWith('storefront/push/subscriptions', { json: { endpoint: ENDPOINT } });
    expect(h.order).toEqual(['delete', 'local-unsubscribe']);
  });

  it('does nothing when there is no subscription', async () => {
    await unsubscribeThisDevice();
    expect(h.del).not.toHaveBeenCalled();
  });
});

describe('sign-out', () => {
  it('sign-out calls unsubscribe and DELETE before logout', async () => {
    existing = makeSub();
    await signOutAndReload();
    expect(h.order).toEqual(['delete', 'local-unsubscribe', 'logout']);
  });

  it('sign-out still logs out when unsubscribe throws', async () => {
    existing = makeSub();
    h.del.mockImplementation(() => Promise.reject(new Error('network down')));
    await signOutAndReload();
    expect(h.order).toContain('logout');
  });

  it('sign-out still logs out when the unsubscribe hangs', async () => {
    vi.useFakeTimers();
    try {
      existing = makeSub();
      h.del.mockImplementation(() => new Promise(() => undefined));
      const done = signOutAndReload();
      await vi.advanceTimersByTimeAsync(2100);
      await done;
      expect(h.order).toEqual(['logout']);
    } finally {
      vi.useRealTimers();
    }
  });
});
