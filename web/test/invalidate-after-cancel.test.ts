import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { invalidateAfterCancel } from '@/features/order-status/invalidate-after-cancel.ts';

describe('invalidateAfterCancel', () => {
  it('refreshes the account order and list, the public order and the pop-up lookups', () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    invalidateAfterCancel(client, 'K4M2QP', 'abc');
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([
      ['orders'], ['order', 'K4M2QP'], ['public-order', 'K4M2QP', 'abc'], ['unpaid-prompt'],
    ]);
  });

  it('skips the public order when there is no access key', () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    invalidateAfterCancel(client, 'K4M2QP');
    invalidateAfterCancel(client, 'K4M2QP', null);
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys.some((k) => k?.[0] === 'public-order')).toBe(false);
    expect(keys).toHaveLength(6);
  });
});
