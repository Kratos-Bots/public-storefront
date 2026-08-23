import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, unwrap, ApiError } from '@/api/client.ts';
import { useSessionStore } from '@/stores/session.ts';
import { closedGate } from '@/app/closed-gate.ts';

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

describe('api client', () => {
  beforeEach(() => { useSessionStore.getState().clear(); closedGate.getState().setClosed(false); });
  afterEach(() => vi.restoreAllMocks());

  it('unwraps the envelope', async () => {
    mockFetch(200, { success: true, data: { a: 1 }, error: null });
    await expect(unwrap<{ a: number }>(api.get('storefront/settings'))).resolves.toEqual({ a: 1 });
  });

  it('adds the bearer token when a session exists', async () => {
    useSessionStore.getState().setSession('tok123', { id: 1, nickname: null });
    const spy = mockFetch(200, { success: true, data: null, error: null });
    await unwrap(api.get('storefront/profile'));
    const req = spy.mock.calls[0]![0] as Request;
    expect(req.headers.get('authorization')).toBe('Bearer tok123');
  });

  it('clears the session on 401 and throws ApiError', async () => {
    useSessionStore.getState().setSession('tok', { id: 1, nickname: null });
    mockFetch(401, { success: false, data: null, error: 'Unauthorized' });
    await expect(unwrap(api.get('storefront/cart'))).rejects.toMatchObject({ status: 401 });
    expect(useSessionStore.getState().token).toBeNull();
  });

  it('flips the closed gate on STOREFRONT_DISABLED', async () => {
    mockFetch(503, { success: false, data: null, error: 'STOREFRONT_DISABLED' });
    const err = await unwrap(api.get('storefront/cart')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).isStorefrontDisabled).toBe(true);
    expect(closedGate.getState().closed).toBe(true);
  });

  it('surfaces the backend message on 422', async () => {
    mockFetch(422, { success: false, data: null, error: 'Minimum spend of 50 not met' });
    await expect(unwrap(api.post('storefront/checkout/quote'))).rejects.toMatchObject({ status: 422, message: 'Minimum spend of 50 not met' });
  });
});
