import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const gate = vi.hoisted(() => ({ builder: false }));
vi.mock('@/app/builder-gate.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/builder-gate.ts')>();
  return { ...actual, isBuilderMode: () => gate.builder };
});

import { api } from '@/api/client.ts';
import { getVisitorId, resetVisitorIdForTests } from '@/features/attribution/visitor.ts';

const ok = () => new Response(JSON.stringify({ success: true, data: null, error: null }), { status: 200, headers: { 'content-type': 'application/json' } });

describe('X-Visitor-Id header', () => {
  beforeEach(() => { gate.builder = false; localStorage.clear(); resetVisitorIdForTests(); });
  afterEach(() => vi.restoreAllMocks());

  it('is sent on every API call, with the same id each time', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ok());
    await api.get('storefront/settings');
    await api.post('storefront/visits', { json: {} });
    const sent = fetchSpy.mock.calls.map(([req]) => (req as Request).headers.get('x-visitor-id'));
    expect(sent).toEqual([getVisitorId(), getVisitorId()]);
  });

  it('is not sent from the page builder', async () => {
    gate.builder = true;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ok());
    await api.get('storefront/settings');
    expect((fetchSpy.mock.calls[0]![0] as Request).headers.has('x-visitor-id')).toBe(false);
  });
});
