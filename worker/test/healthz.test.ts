import { env, createExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';

describe('GET /healthz', () => {
  it('returns 200 ok with no-store, without touching the backend', async () => {
    // No globalThis.fetch stub here — a passing test proves /healthz never
    // reaches proxyApi/proxyMedia (which would throw on an unstubbed fetch).
    const res = await worker.fetch(new Request('https://shop.test/healthz'), env, createExecutionContext());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    expect(res.headers.get('content-type')).toBe('text/plain');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
