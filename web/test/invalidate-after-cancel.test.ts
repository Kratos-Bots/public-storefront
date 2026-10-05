import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { invalidateAfterCancel } from '@/features/order-status/invalidate-after-cancel.ts';

describe('invalidateAfterCancel', () => {
  it('refreshes the account order and list (which holds the pop-up lookup) and the payment view', () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    invalidateAfterCancel(client, 'K4M2QP');
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([
      ['orders'], ['order', 'K4M2QP'], ['order-payment', 'K4M2QP'],
    ]);
  });
});
