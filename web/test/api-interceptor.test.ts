import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ky from 'ky';

// The seam is guarded by the builder gate. Tests force it on (or leave it to the real jsdom
// gate, which is off: not framed, no ?sf-builder=1) through this hoisted switch.
const gate = vi.hoisted(() => ({ forced: true as boolean | undefined }));
vi.mock('@/app/builder-gate.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/builder-gate.ts')>();
  return { ...actual, isBuilderMode: (win?: Window) => gate.forced ?? actual.isBuilderMode(win) };
});

import { api, setApiInterceptor, unwrap } from '@/api/client.ts';
import { useSessionStore } from '@/stores/session.ts';

const envelope = (data: unknown, status = 200) =>
  new Response(JSON.stringify(status < 400 ? { success: true, data, error: null } : { success: false, data: null, error: data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('api interceptor', () => {
  beforeEach(() => { gate.forced = true; useSessionStore.getState().clear(); });
  afterEach(() => { vi.restoreAllMocks(); setApiInterceptor(null); });

  it('answers without touching the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    setApiInterceptor(() => envelope({ from: 'fixture' }));
    await expect(unwrap(api.get('storefront/profile'))).resolves.toEqual({ from: 'fixture' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sees the Authorization header and can rewrite the request', async () => {
    useSessionStore.getState().setSession('tok', { id: 1, nickname: null });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(envelope({ ok: true }));
    let seen: string | null = null;
    setApiInterceptor((request) => {
      seen = request.headers.get('authorization');
      request.headers.delete('authorization');
      return new Request(request.url.replace('/api/storefront/catalog', '/api/catalog'), { headers: request.headers });
    });
    await unwrap(api.get('storefront/catalog'));
    expect(seen).toBe('Bearer tok');
    const sent = fetchSpy.mock.calls[0]![0] as Request;
    expect(new URL(sent.url).pathname).toBe('/api/catalog');
    expect(sent.headers.get('authorization')).toBeNull();
  });

  it('turns a fixture 4xx into an ApiError', async () => {
    setApiInterceptor(() => envelope('Preview only', 400));
    await expect(unwrap(api.post('storefront/checkout'))).rejects.toMatchObject({ status: 400, message: 'Preview only' });
  });

  it('off() removes only its own interceptor', async () => {
    const offA = setApiInterceptor(() => envelope('a'));
    setApiInterceptor(() => envelope('b'));
    offA();
    await expect(unwrap(api.get('storefront/settings'))).resolves.toBe('b');
  });

  it('an interceptor returning nothing lets the request through untouched', async () => {
    useSessionStore.getState().setSession('tok', { id: 1, nickname: null });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(envelope({ live: true }));
    const seen = vi.fn();
    setApiInterceptor((request) => { seen(request.method, new URL(request.url).pathname); });
    await expect(unwrap(api.get('storefront/settings'))).resolves.toEqual({ live: true });
    expect(seen).toHaveBeenCalledWith('GET', '/api/storefront/settings');
    expect((fetchSpy.mock.calls[0]![0] as Request).headers.get('authorization')).toBe('Bearer tok');
  });
});

describe('api interceptor guard', () => {
  afterEach(() => { vi.restoreAllMocks(); gate.forced = true; setApiInterceptor(null); });

  it('refuses to install outside builder mode (real gate: jsdom is not a framed /__builder)', () => {
    gate.forced = undefined;
    expect(() => setApiInterceptor(() => envelope('x'))).toThrow(/builder mode/);
  });

  it('refuses when the gate says no, and leaves the default path in place', async () => {
    gate.forced = false;
    expect(() => setApiInterceptor(() => envelope('fixture'))).toThrow(/builder mode/);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(envelope('live'));
    await expect(unwrap(api.get('storefront/settings'))).resolves.toBe('live');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('clearing is always allowed, even outside builder mode', () => {
    gate.forced = false;
    expect(() => setApiInterceptor(null)).not.toThrow();
  });

  it('an installed interceptor stops answering if the gate ever reads false', async () => {
    setApiInterceptor(() => envelope('fixture'));
    gate.forced = false;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(envelope('live'));
    await expect(unwrap(api.get('storefront/settings'))).resolves.toBe('live');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

/**
 * With no interceptor installed the client must behave exactly as it did before the seam
 * existed. The reference instance below is the pre-seam configuration verbatim; both must send
 * the same Request for the same calls.
 */
describe('api client default path (no interceptor)', () => {
  const reference = ky.create({
    prefixUrl: `${window.location.origin}/api`,
    timeout: 20_000,
    retry: { limit: 1, methods: ['get'] },
    hooks: {
      beforeRequest: [(request) => {
        const token = useSessionStore.getState().token;
        if (token) request.headers.set('Authorization', `Bearer ${token}`);
      }],
    },
  });

  beforeEach(() => { gate.forced = true; useSessionStore.getState().clear(); setApiInterceptor(null); });
  afterEach(() => vi.restoreAllMocks());

  async function snapshot(req: Request) {
    return {
      method: req.method,
      url: req.url,
      headers: [...req.headers.entries()].sort(([a], [b]) => a.localeCompare(b)),
      body: req.body ? await req.clone().text() : null,
      credentials: req.credentials,
      redirect: req.redirect,
    };
  }

  const calls: Array<[string, (c: typeof api) => Promise<Response>]> = [
    ['GET', (c) => c.get('storefront/settings')],
    ['GET + searchParams', (c) => c.get('storefront/catalog', { searchParams: { q: 'tea', page: 2 } })],
    ['POST json', (c) => c.post('storefront/checkout', { json: { lines: [{ productId: 1, quantity: 2 }] } })],
    ['PUT json', (c) => c.put('storefront/cart', { json: { lines: [] } })],
    ['DELETE', (c) => c.delete('storefront/cart')],
  ];

  for (const signedIn of [false, true]) {
    for (const [name, call] of calls) {
      it(`${name} (${signedIn ? 'signed in' : 'signed out'}) sends the same request as the pre-seam client`, async () => {
        if (signedIn) useSessionStore.getState().setSession('tok', { id: 1, nickname: null });
        const sent: Array<Awaited<ReturnType<typeof snapshot>>> = [];
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
          sent.push(await snapshot(input as Request));
          return envelope(null);
        });
        await call(api);
        await call(reference);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(sent[0]).toEqual(sent[1]);
        if (signedIn) expect(sent[0]!.headers).toContainEqual(['authorization', 'Bearer tok']);
      });
    }
  }

  it('after off() the client is back on the default path', async () => {
    const off = setApiInterceptor(() => envelope('fixture'));
    off();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(envelope('live'));
    await expect(unwrap(api.get('storefront/settings'))).resolves.toBe('live');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
