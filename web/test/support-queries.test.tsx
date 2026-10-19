import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), create: vi.fn() }));
vi.mock('@/api/support.ts', async (orig) => ({
  ...(await orig<typeof import('@/api/support.ts')>()), postMessage: h.post, fetchTicket: h.get, createTicket: h.create,
}));

import type { InfiniteData } from '@tanstack/react-query';
import type { CustomerTicketSummary } from '@/api/support.ts';
import { ApiError } from '@/lib/errors.ts';
import { SETTINGS_KEY, queryClient } from '@/lib/query-client.ts';
import { useSessionStore } from '@/stores/session.ts';
import { SUPPORT_TICKETS_KEY, useCreateTicket, useLocalMessages, useSendMessage, useTicket } from '@/features/support/queries.ts';

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

describe('useCreateTicket', () => {
  it("a 403 SUPPORT_DISABLED refetches the settings, so the form gives way to the shop's not-accepting copy", async () => {
    h.create.mockRejectedValueOnce(new ApiError(403, 'SUPPORT_DISABLED'));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(SETTINGS_KEY, { support: { enabled: true } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useCreateTicket(), { wrapper });
    act(() => { result.current.mutate({ subject: 's', body: 'b', files: [] }); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryState(SETTINGS_KEY)?.isInvalidated).toBe(true);
  });

  it('any other failure leaves the settings alone', async () => {
    h.create.mockRejectedValueOnce(new ApiError(429, 'Too many requests'));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(SETTINGS_KEY, { support: { enabled: true } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useCreateTicket(), { wrapper });
    act(() => { result.current.mutate({ subject: 's', body: 'b', files: [] }); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryState(SETTINGS_KEY)?.isInvalidated).toBe(false);
  });
});

describe('useTicket and the tickets list', () => {
  const summary = (id: number, unread: boolean): CustomerTicketSummary => ({
    id, subject: 's', status: 'waiting_on_customer', order: null, unread, createdAt: 'now',
    lastMessage: { preview: 'p', fromSupport: true, at: 'now' },
  });
  type List = InfiniteData<{ data: CustomerTicketSummary[]; meta: unknown }, number>;

  it('reading a ticket (which the server marks read) clears its unread dot in the cached list, and only its own', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData<List>([...SUPPORT_TICKETS_KEY, 'list'], {
      pages: [{ data: [summary(3, true), summary(4, true)], meta: {} }], pageParams: [1],
    });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    renderHook(() => useTicket(3), { wrapper });
    await waitFor(() => {
      const rows = qc.getQueryData<List>([...SUPPORT_TICKETS_KEY, 'list'])!.pages[0]!.data;
      expect(rows.map((r) => [r.id, r.unread])).toEqual([[3, false], [4, true]]);
    });
  });
});

describe('the session changing hands', () => {
  it('drops every cached ticket, the list and the by-order answers included', () => {
    useSessionStore.setState({ token: 'a' });
    queryClient.setQueryData([...SUPPORT_TICKETS_KEY, 3], { ...base });
    queryClient.setQueryData([...SUPPORT_TICKETS_KEY, 'list'], { pages: [], pageParams: [] });
    queryClient.setQueryData([...SUPPORT_TICKETS_KEY, 'by-order', 'REF'], 3);
    useSessionStore.setState({ token: 'b' });
    expect(queryClient.getQueriesData({ queryKey: SUPPORT_TICKETS_KEY })).toEqual([]);
    useSessionStore.setState({ token: null });
  });
});
