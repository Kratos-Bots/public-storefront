import { afterEach, describe, expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('@/api/client.ts', () => ({
  api: { get },
  unwrap: async (p: Promise<{ json(): Promise<{ success: boolean; data: unknown }> }>) => (await (await p).json()).data,
}));

import { fetchPageSet } from '@/api/pages.ts';

afterEach(() => get.mockReset());

describe('fetchPageSet', () => {
  it('reads the layout route once, with retry disabled (a 503 must be one request, not two)', async () => {
    get.mockResolvedValue({ json: async () => ({ success: true, data: { data: { schemaVersion: 1, shell: {}, pages: {} } } }) });
    expect(await fetchPageSet('menu')).not.toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('storefront/pages/menu', { retry: 0 });
  });
  it('resolves null on any failure', async () => {
    get.mockRejectedValue(new Error('503'));
    expect(await fetchPageSet('storefront')).toBeNull();
  });
});
