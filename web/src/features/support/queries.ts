import { useCallback, useEffect } from 'react';
import { create } from 'zustand';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import {
  closeTicket, createTicket, fetchTicket, fetchTicketForOrder, fetchTickets, postMessage,
  type CustomerMessage, type CustomerTicketDetail, type CustomerTicketSummary, type NewMessageInput, type NewTicketInput,
} from '@/api/support.ts';
import { ApiError } from '@/lib/errors.ts';
import { SETTINGS_KEY, queryClient } from '@/lib/query-client.ts';
import type { PageMeta } from '@/types/orders.ts';
import { useText } from '@/text/runtime.tsx';
import { selectIsLoggedIn, useSessionStore } from '@/stores/session.ts';
import { useSettings } from '@/app/settings.ts';

export const SUPPORT_TICKETS_KEY = ['support-tickets'] as const;
export const ticketKey = (id: number) => [...SUPPORT_TICKETS_KEY, id] as const;
const LIST_KEY = [...SUPPORT_TICKETS_KEY, 'list'] as const;
const BY_ORDER_KEY = [...SUPPORT_TICKETS_KEY, 'by-order'] as const;

export const TICKETS_PAGE_SIZE = 20;

/** A message as the thread shows it: server rows, plus ones still in flight or that failed to send. */
export interface ThreadMessage extends CustomerMessage {
  /** Only on a message this browser sent and the server has not confirmed. */
  local?: { state: 'sending' | 'failed'; draft: NewMessageInput };
}
export type ThreadDetail = Omit<CustomerTicketDetail, 'messages'> & { messages: ThreadMessage[] };

/**
 * Messages this browser is sending or failed to send, per ticket. They live outside the polled query data on
 * purpose: a refetch replaces that data wholesale and must not drop a failed message (with its photos) or one in flight.
 */
interface LocalState {
  byTicket: Record<number, ThreadMessage[]>;
  set: (id: number, fn: (list: ThreadMessage[]) => ThreadMessage[]) => void;
}
export const useLocalMessages = create<LocalState>((set) => ({
  byTicket: {},
  set: (id, fn) => set((s) => ({ byTicket: { ...s.byTicket, [id]: fn(s.byTicket[id] ?? []) } })),
}));
// Unsent messages belong to the account that wrote them: any way the session ends (sign-out, a 401, a failed Telegram
// sign-in) or changes hands takes them out of this browser, and so do the cached tickets (the list, every thread and
// the by-order answers all sit under SUPPORT_TICKETS_KEY), so the next account never sees the last one's.
useSessionStore.subscribe((s, prev) => {
  if (s.token === prev.token) return;
  useLocalMessages.setState({ byTicket: {} });
  queryClient.removeQueries({ queryKey: SUPPORT_TICKETS_KEY });
});
const NONE: ThreadMessage[] = [];

export function useTickets(enabled = true) {
  return useInfiniteQuery({
    queryKey: LIST_KEY,
    queryFn: ({ pageParam }) => fetchTickets(pageParam, TICKETS_PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasNextPage ? last.meta.page + 1 : undefined),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled,
  });
}

/**
 * Whether the customer's way into support (the account's Support tab) is shown: always while the shop takes new
 * tickets, otherwise only for a signed-in customer who already has one, so a switched-off shop can still be answered.
 */
export function useSupportReachable(): boolean {
  const { support } = useSettings();
  const enabled = support?.enabled === true;
  const loggedIn = useSessionStore(selectIsLoggedIn);
  // An older backend has no `support` field and no tickets route: ask nothing of it.
  const tickets = useTickets(loggedIn && support?.enabled === false);
  return enabled || (tickets.data?.pages[0]?.data.length ?? 0) > 0;
}

type TicketList = InfiniteData<{ data: CustomerTicketSummary[]; meta: PageMeta }, number>;

const tabVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

/** Polls while the tab is in front, so a reply from the shop lands without a refresh. Local messages are merged in at read time. */
export function useTicket(id: number | undefined) {
  const qc = useQueryClient();
  const locals = useLocalMessages((s) => (id === undefined ? NONE : s.byTicket[id] ?? NONE));
  const query = useQuery<CustomerTicketDetail, Error, ThreadDetail>({
    queryKey: ticketKey(id ?? 0),
    queryFn: () => fetchTicket(id as number),
    enabled: id !== undefined,
    refetchInterval: () => (tabVisible() ? 15_000 : false),
    select: useCallback(
      (d: CustomerTicketDetail): ThreadDetail => {
        if (!locals.length) return d;
        // A reply on its way will (re)open the ticket, so it already reads as waiting on the shop; one that failed
        // changed nothing on the server, so the ticket keeps its own status.
        const sending = locals.some((m) => m.local?.state === 'sending');
        return { ...d, ...(sending ? { status: 'needs_reply' as const } : {}), messages: [...d.messages, ...locals] };
      },
      [locals],
    ),
  });
  // Every read of a ticket marks it read on the server: clear its dot in the cached list too (no request), so going
  // back to the list never shows a stale "unread" until the list's own poll. Written only when the dot is there, and
  // under the list's own timestamp: any write would otherwise make the list look freshly fetched, and going back to
  // it (or refocusing the tab) would no longer refetch it.
  const { dataUpdatedAt } = query;
  useEffect(() => {
    if (id === undefined || !dataUpdatedAt) return;
    const list = qc.getQueryData<TicketList>(LIST_KEY);
    if (!list?.pages.some((p) => p.data.some((t) => t.id === id && t.unread))) return;
    qc.setQueryData<TicketList>(
      LIST_KEY,
      { ...list, pages: list.pages.map((p) => ({ ...p, data: p.data.map((t) => (t.id === id ? { ...t, unread: false } : t)) })) },
      { updatedAt: qc.getQueryState(LIST_KEY)?.dataUpdatedAt },
    );
  }, [id, dataUpdatedAt, qc]);
  return query;
}

/**
 * The newest open ticket about an order, asked once on arrival at the new-ticket form. Never kept once the form is
 * gone (a remembered id may since have been closed) and never refetched behind the customer's back: coming back from
 * the photo picker must not pull a half-written ticket away.
 */
export function useTicketForOrder(reference: string | null) {
  return useQuery({
    queryKey: [...BY_ORDER_KEY, reference],
    queryFn: () => fetchTicketForOrder(reference as string),
    enabled: reference !== null,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewTicketInput) => createTicket(input),
    onSuccess: (ticket) => {
      qc.setQueryData(ticketKey(ticket.id), ticket);
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.removeQueries({ queryKey: BY_ORDER_KEY });
    },
    // The shop stopped taking new tickets while the form was open: fresh settings swap the form for that news.
    onError: (err) => {
      if (err instanceof ApiError && err.isSupportDisabled) void qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
}

export interface SendVars extends NewMessageInput {
  /** Set when retrying a message that failed, so it is replaced rather than duplicated. */
  tempId?: number;
}

let tempCounter = 0;

/**
 * Optimistic: the message is in the thread the moment it is sent, marked `sending`; on success it is swapped for the
 * server's row, on failure it stays with `failed` (and its draft) so one tap can send it again.
 */
export function useSendMessage(id: number) {
  const qc = useQueryClient();
  const { t } = useText();
  const key = ticketKey(id);
  const setLocal = useLocalMessages.getState().set;
  const mark = (tempId: number, state: 'sending' | 'failed') =>
    setLocal(id, (l) => l.map((m) => (m.id === tempId && m.local ? { ...m, local: { ...m.local, state } } : m)));
  return useMutation({
    mutationFn: ({ body, files }: SendVars) => postMessage(id, { body, files }),
    onMutate: (vars) => {
      const tempId = vars.tempId ?? -(++tempCounter);
      const draft = { body: vars.body, files: vars.files };
      if (vars.tempId !== undefined) mark(tempId, 'sending');
      else {
        setLocal(id, (l) => [...l, {
          id: tempId, fromSupport: false, authorLabel: t('support.thread.you'), body: vars.body, attachments: [],
          createdAt: new Date().toISOString(), local: { state: 'sending', draft },
        }]);
      }
      return { tempId };
    },
    onSuccess: (message, _vars, ctx) => {
      // Hand over from the local copy to the server's row in the same tick, so a refetch can never show both.
      qc.setQueryData<CustomerTicketDetail>(key, (d) => (d && !d.messages.some((m) => m.id === message.id)
        ? { ...d, status: 'needs_reply', messages: [...d.messages, message] }
        : d));
      setLocal(id, (l) => l.filter((m) => m.id !== ctx.tempId));
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (err, _vars, ctx) => {
      if (!ctx) return;
      mark(ctx.tempId, 'failed');
      // Closed past its reopen window: the message stays on screen (failed, with no way to retry once the refetched
      // ticket says it can no longer take replies), so its text can go into a new ticket.
      if (err instanceof ApiError && err.isTicketClosed) void qc.invalidateQueries({ queryKey: key });
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: LIST_KEY }); },
  });
}

export function useCloseTicket(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => closeTicket(id),
    onSuccess: (ticket) => {
      qc.setQueryData(ticketKey(id), ticket);
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.removeQueries({ queryKey: BY_ORDER_KEY });
    },
  });
}
