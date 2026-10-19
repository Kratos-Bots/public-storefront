import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('@/api/support.ts', async (orig) => ({ ...(await orig<typeof import('@/api/support.ts')>()), postMessage: h.post, fetchTicket: h.get }));

import { useLocalMessages, useSendMessage, useTicket } from '@/features/support/queries.ts';

const base = {
  id: 3, subject: 'Hi', status: 'waiting_on_customer', order: null, messages: [] as unknown[], timeline: [],
  canReply: true, reopenUntil: null, createdAt: '2026-10-19T10:00:00Z',
};
const row = (id: number) => ({ id, fromSupport: false, authorLabel: 'x', body: 'hello', attachments: [], createdAt: 'now' });

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const hook = renderHook(() => ({ ticket: useTicket(3), send: useSendMessage(3) }), { wrapper });
  return { qc, ...hook };
}
type Setup = ReturnType<typeof setup>;
const msgs = (r: Setup['result']) => r.current.ticket.data?.messages ?? [];
const poll = (qc: QueryClient) => act(async () => { await qc.refetchQueries({ queryKey: ['support-tickets', 3] }); });

beforeEach(() => {
  h.post.mockReset();
  h.get.mockReset();
  h.get.mockResolvedValue({ ...base });
  useLocalMessages.setState({ byTicket: {} });
});

describe('useSendMessage', () => {
  it('shows the message at once, survives a poll mid-flight, and is not duplicated after the server row arrives', async () => {
    let resolve!: (v: unknown) => void;
    h.post.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result, qc } = setup();
    await waitFor(() => expect(result.current.ticket.data).toBeDefined());
    act(() => { result.current.send.mutate({ body: 'hello', files: [] }); });
    await waitFor(() => expect(msgs(result)).toHaveLength(1));
    expect(msgs(result)[0]).toMatchObject({ body: 'hello', local: { state: 'sending' } });
    await poll(qc);
    expect(msgs(result)).toHaveLength(1);
    h.get.mockResolvedValue({ ...base, messages: [row(40)] });
    await act(async () => { resolve(row(40)); });
    await waitFor(() => expect(msgs(result).map((m) => m.id)).toEqual([40]));
    await poll(qc);
    expect(msgs(result).map((m) => m.id)).toEqual([40]);
  });

  it('a failed message and its draft survive a refetch, and retry replaces it', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    h.post.mockRejectedValueOnce(new Error('offline'));
    const { result, qc } = setup();
    await waitFor(() => expect(result.current.ticket.data).toBeDefined());
    act(() => { result.current.send.mutate({ body: 'hello', files: [file] }); });
    await waitFor(() => expect(msgs(result)[0]?.local?.state).toBe('failed'));
    await poll(qc);
    const failed = msgs(result)[0]!;
    expect(failed.local).toMatchObject({ state: 'failed', draft: { body: 'hello', files: [file] } });
    h.post.mockResolvedValueOnce(row(41));
    h.get.mockResolvedValue({ ...base, messages: [row(41)] });
    act(() => { result.current.send.mutate({ ...failed.local!.draft, tempId: failed.id }); });
    await waitFor(() => expect(msgs(result).map((m) => m.id)).toEqual([41]));
  });
});
