import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  push: undefined as unknown,
  telegram: false,
  post: vi.fn(),
  del: vi.fn(),
  get: vi.fn(),
}));
vi.mock('@/app/settings.ts', () => ({ useSettingsQuery: () => ({ data: { push: h.push } }) }));
vi.mock('@/lib/telegram-webapp.ts', () => ({ isTelegramWebApp: () => h.telegram }));
vi.mock('@/api/client.ts', () => ({
  api: { post: h.post, delete: h.del, get: h.get },
  unwrap: async (p: Promise<{ json: () => Promise<{ data: unknown }> }>) => (await (await p).json()).data,
}));

import { usePush, resetPushHeal } from '@/features/push/usePush.ts';
import { useSessionStore } from '@/stores/session.ts';

const ok = (data: unknown) => Promise.resolve({ json: async () => ({ success: true, data, error: null }) });
const PUSH = { enabled: true, publicKey: Buffer.from(new Uint8Array(65).fill(4)).toString('base64url') };
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';

let requestPermission: ReturnType<typeof vi.fn>;
let register: ReturnType<typeof vi.fn>;
interface FakeSub {
  endpoint: string;
  options: { applicationServerKey: ArrayBuffer };
  toJSON: () => unknown;
  unsubscribe: ReturnType<typeof vi.fn>;
}
let sub: FakeSub | null;
let browserSubscribe: ReturnType<typeof vi.fn>;
const goodKey = () => new Uint8Array(65).fill(4).buffer;
const makeSub = (key: ArrayBuffer = goodKey()): FakeSub => ({
  endpoint: ENDPOINT,
  options: { applicationServerKey: key },
  toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'P', auth: 'A' } }),
  unsubscribe: vi.fn(async () => true),
});

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, children);

beforeEach(() => {
  h.push = PUSH; h.telegram = false;
  h.post.mockReset(); h.del.mockReset(); h.get.mockReset();
  h.get.mockReturnValue(ok({ devices: [
    { id: 1, deviceLabel: 'This', createdAt: '2026-10-20', current: true },
    { id: 2, deviceLabel: 'Other', createdAt: '2026-10-20', current: false },
  ] }));
  h.del.mockResolvedValue({});
  h.post.mockReturnValue(ok({ id: 1, deviceLabel: 'x' }));
  useSessionStore.setState({ token: 't', customer: { id: 1, nickname: null } });
  sub = null;
  requestPermission = vi.fn(async () => 'granted');
  register = vi.fn(async () => ({}));
  browserSubscribe = vi.fn(async () => { sub = makeSub(); return sub; });
  const reg = { pushManager: { getSubscription: vi.fn(async () => sub), subscribe: browserSubscribe } };
  resetPushHeal();
  localStorage.removeItem('push-opted-out');
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register, ready: Promise.resolve(reg), getRegistration: vi.fn(async () => reg) },
  });
  vi.stubGlobal('Notification', { requestPermission, permission: 'default' });
  vi.stubGlobal('PushManager', class {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
  useSessionStore.setState({ token: null, customer: null });
});

describe('usePush', () => {
  it('is ready for a signed-in shopper on a capable browser', () => {
    const { result } = renderHook(() => usePush(), { wrapper });
    expect(result.current.availability).toBe('ready');
  });

  it('older backend (no push field) is unavailable through the hook', async () => {
    h.push = undefined;
    const { result } = renderHook(() => usePush(), { wrapper });
    expect(result.current.availability).toBe('unavailable');
    await act(() => result.current.enable());
    expect(requestPermission).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('telegram never reaches requestPermission or register', async () => {
    h.telegram = true;
    const { result } = renderHook(() => usePush(), { wrapper });
    expect(result.current.availability).toBe('unavailable');
    await act(() => result.current.enable());
    expect(requestPermission).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(h.post).not.toHaveBeenCalled();
  });

  it('signed out never reaches requestPermission or register', async () => {
    useSessionStore.setState({ token: null, customer: null });
    const { result } = renderHook(() => usePush(), { wrapper });
    expect(result.current.availability).toBe('unavailable');
    await act(() => result.current.enable());
    expect(requestPermission).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('removeDevice on the current device unsubscribes this browser', async () => {
    sub = makeSub();
    const unsubscribe = sub.unsubscribe;
    const { result } = renderHook(() => usePush(), { wrapper });
    await waitFor(() => expect(result.current.devices).toHaveLength(2));
    await act(() => result.current.removeDevice(1));
    expect(h.del).toHaveBeenCalledWith('storefront/push/subscriptions', { json: { endpoint: ENDPOINT } });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('removeDevice on another device deletes it by id and refetches the list', async () => {
    const { result } = renderHook(() => usePush(), { wrapper });
    await waitFor(() => expect(result.current.devices).toHaveLength(2));
    const before = h.get.mock.calls.length;
    await act(() => result.current.removeDevice(2));
    expect(h.del).toHaveBeenCalledWith('storefront/push/subscriptions/2');
    expect(h.del).not.toHaveBeenCalledWith('storefront/push/subscriptions', expect.anything());
    await waitFor(() => expect(h.get.mock.calls.length).toBeGreaterThan(before));
  });

  describe('subscribed is a fact, not the browser say-so', () => {
    it('is subscribed when the browser holds the current key and the server marks the device current', async () => {
      sub = makeSub();
      const { result } = renderHook(() => usePush(), { wrapper });
      await waitFor(() => expect(result.current.subscribed).toBe(true));
      expect(result.current.settled).toBe(true);
      expect(h.post).not.toHaveBeenCalled();
    });

    it('stays unsettled (no banner flash) while the device list loads', async () => {
      sub = makeSub();
      h.get.mockReturnValue(new Promise(() => undefined));
      const { result } = renderHook(() => usePush(), { wrapper });
      await waitFor(() => expect(h.get).toHaveBeenCalled());
      expect(result.current.settled).toBe(false);
      expect(result.current.subscribed).toBe(false);
    });

    it('a browser subscription made against another key is not subscribed', async () => {
      sub = makeSub(new Uint8Array(65).fill(9).buffer);
      const { result } = renderHook(() => usePush(), { wrapper });
      await waitFor(() => expect(result.current.settled).toBe(true));
      expect(result.current.subscribed).toBe(false);
    });

    it('a server list without a current device is not subscribed', async () => {
      sub = makeSub();
      h.get.mockReturnValue(ok({ devices: [{ id: 2, deviceLabel: 'Other', createdAt: '2026-10-20', current: false }] }));
      const { result } = renderHook(() => usePush(), { wrapper });
      await waitFor(() => expect(result.current.devices).toHaveLength(1));
      expect(result.current.subscribed).toBe(false);
    });
  });

  describe('silent self-heal', () => {
    beforeEach(() => { vi.stubGlobal('Notification', { requestPermission, permission: 'granted' }); });

    it('granted + key mismatch resubscribes once, without a second attempt', async () => {
      sub = makeSub(new Uint8Array(65).fill(9).buffer);
      const stale = sub;
      const { result } = renderHook(() => usePush(), { wrapper });
      await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1));
      expect(stale.unsubscribe).toHaveBeenCalledOnce();
      expect(browserSubscribe).toHaveBeenCalledOnce();
      expect(h.post).toHaveBeenCalledWith('storefront/push/subscriptions', { json: { endpoint: ENDPOINT, keys: { p256dh: 'P', auth: 'A' } } });
      await waitFor(() => expect(result.current.settled).toBe(true));
      expect(h.post).toHaveBeenCalledTimes(1);
    });

    it('granted + no browser subscription resubscribes silently', async () => {
      renderHook(() => usePush(), { wrapper });
      await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1));
      expect(browserSubscribe).toHaveBeenCalledOnce();
    });

    it('granted + browser subscription unknown to the server resubscribes', async () => {
      sub = makeSub();
      h.get.mockReturnValue(ok({ devices: [] }));
      renderHook(() => usePush(), { wrapper });
      await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1));
    });

    it('a failed resubscribe is not retried in the same page load', async () => {
      h.post.mockImplementation(() => Promise.reject(new Error('down')));
      renderHook(() => usePush(), { wrapper });
      await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1));
      await new Promise((r) => setTimeout(r, 30));
      expect(h.post).toHaveBeenCalledTimes(1);
    });

    it('a shopper who switched notifications off is left alone', async () => {
      localStorage.setItem('push-opted-out', '1');
      const { result } = renderHook(() => usePush(), { wrapper });
      await waitFor(() => expect(result.current.settled).toBe(true));
      await new Promise((r) => setTimeout(r, 30));
      expect(h.post).not.toHaveBeenCalled();
    });

    it('a healthy subscription is never re-posted', async () => {
      sub = makeSub();
      const { result } = renderHook(() => usePush(), { wrapper });
      await waitFor(() => expect(result.current.subscribed).toBe(true));
      expect(h.post).not.toHaveBeenCalled();
    });
  });

  it('permission not granted: no auto-subscribe and no permission prompt', async () => {
    sub = makeSub(new Uint8Array(65).fill(9).buffer);
    const { result } = renderHook(() => usePush(), { wrapper });
    await waitFor(() => expect(result.current.settled).toBe(true));
    await new Promise((r) => setTimeout(r, 30));
    expect(requestPermission).not.toHaveBeenCalled();
    expect(h.post).not.toHaveBeenCalled();
    expect(result.current.subscribed).toBe(false);
  });
});
