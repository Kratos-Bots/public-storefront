import { useCallback } from 'react';
import { create } from 'zustand';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeTicket, createTicket, fetchTicket, fetchTickets, postMessage,
  type CustomerMessage, type CustomerTicketDetail, type NewMessageInput, type NewTicketInput,
} from '@/api/support.ts';
import { useText } from '@/text/runtime.tsx';

export const SUPPORT_TICKETS_KEY = ['support-tickets'] as const;
export const ticketKey = (id: number) => [...SUPPORT_TICKETS_KEY, id] as const;
const LIST_KEY = [...SUPPORT_TICKETS_KEY, 'list'] as const;

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

const tabVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

/** Polls while the tab is in front, so a reply from the shop lands without a refresh. Local messages are merged in at read time. */
export function useTicket(id: number | undefined) {
  const locals = useLocalMessages((s) => (id === undefined ? NONE : s.byTicket[id] ?? NONE));
  return useQuery<CustomerTicketDetail, Error, ThreadDetail>({
    queryKey: ticketKey(id ?? 0),
    queryFn: () => fetchTicket(id as number),
    enabled: id !== undefined,
    refetchInterval: () => (tabVisible() ? 15_000 : false),
    select: useCallback(
      (d: CustomerTicketDetail): ThreadDetail => (locals.length
        ? { ...d, status: 'needs_reply', messages: [...d.messages, ...locals] }
        : d),
      [locals],
    ),
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewTicketInput) => createTicket(input),
    onSuccess: (ticket) => {
      qc.setQueryData(ticketKey(ticket.id), ticket);
      void qc.invalidateQueries({ queryKey: LIST_KEY });
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
    onError: (_err, _vars, ctx) => { if (ctx) mark(ctx.tempId, 'failed'); },
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
    },
  });
}
