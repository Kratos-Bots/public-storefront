import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
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

import { usePush } from '@/features/push/usePush.ts';
import { useSessionStore } from '@/stores/session.ts';

const ok = (data: unknown) => Promise.resolve({ json: async () => ({ success: true, data, error: null }) });
const PUSH = { enabled: true, publicKey: Buffer.from(new Uint8Array(65).fill(4)).toString('base64url') };
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';

let requestPermission: ReturnType<typeof vi.fn>;
let register: ReturnType<typeof vi.fn>;
let sub: { endpoint: string; unsubscribe: ReturnType<typeof vi.fn> } | null;

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
  const reg = { pushManager: { getSubscription: vi.fn(async () => sub), subscribe: vi.fn() } };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register, ready: Promise.resolve(reg), getRegistration: vi.fn(async () => reg) },
  });
  vi.stubGlobal('Notification', { requestPermission, permission: 'default' });
  vi.stubGlobal('PushManager', class {});
});

afterEach(() => {
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
    const unsubscribe = vi.fn(async () => true);
    sub = { endpoint: ENDPOINT, unsubscribe };
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
});
