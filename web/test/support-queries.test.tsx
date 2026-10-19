import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/api/support.ts', async (orig) => ({ ...(await orig<typeof import('@/api/support.ts')>()), postMessage: h.post }));

import { ticketKey, useSendMessage, type ThreadDetail } from '@/features/support/queries.ts';

const detail: ThreadDetail = {
  id: 3, subject: 'Hi', status: 'waiting_on_customer', order: null, messages: [], timeline: [],
  canReply: true, reopenUntil: null, createdAt: '2026-10-19T10:00:00Z',
};

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(ticketKey(3), detail);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, ...renderHook(() => useSendMessage(3), { wrapper }) };
}
const msgs = (qc: QueryClient) => qc.getQueryData<ThreadDetail>(ticketKey(3))!.messages;

describe('useSendMessage', () => {
  it('appends optimistically, then swaps in the server row', async () => {
    let resolve!: (v: unknown) => void;
    h.post.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { qc, result } = setup();
    act(() => { result.current.mutate({ body: 'hello', files: [] }); });
    await waitFor(() => expect(msgs(qc)).toHaveLength(1));
    expect(msgs(qc)[0]).toMatchObject({ body: 'hello', local: { state: 'sending' } });
    expect(msgs(qc)[0]!.id).toBeLessThan(0);
    await act(async () => { resolve({ id: 40, fromSupport: false, authorLabel: 'x', body: 'hello', attachments: [], createdAt: 'now' }); });
    await waitFor(() => expect(msgs(qc)[0]!.id).toBe(40));
    expect(msgs(qc)[0]!.local).toBeUndefined();
  });

  it('keeps a failed message with its draft and replaces it on retry', async () => {
    h.post.mockRejectedValueOnce(new Error('offline'));
    const { qc, result } = setup();
    act(() => { result.current.mutate({ body: 'hello', files: [] }); });
    await waitFor(() => expect(msgs(qc)[0]?.local?.state).toBe('failed'));
    const tempId = msgs(qc)[0]!.id;
    h.post.mockResolvedValueOnce({ id: 41, fromSupport: false, authorLabel: 'x', body: 'hello', attachments: [], createdAt: 'now' });
    act(() => { result.current.mutate({ ...msgs(qc)[0]!.local!.draft, tempId }); });
    await waitFor(() => expect(msgs(qc).map((m) => m.id)).toEqual([41]));
  });
});
