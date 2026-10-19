import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeTicket, createTicket, fetchTicket, fetchTickets, postMessage,
  type CustomerMessage, type CustomerTicketDetail, type NewMessageInput, type NewTicketInput,
} from '@/api/support.ts';
import { useText } from '@/text/runtime.tsx';

export const SUPPORT_TICKETS_KEY = ['support-tickets'] as const;
export const ticketKey = (id: number) => [...SUPPORT_TICKETS_KEY, id] as const;

export const TICKETS_PAGE_SIZE = 20;

/** A message as the thread shows it: server rows, plus ones still in flight or that failed to send. */
export interface ThreadMessage extends CustomerMessage {
  /** Only on a message this browser sent and the server has not confirmed. */
  local?: { state: 'sending' | 'failed'; draft: NewMessageInput };
}
export type ThreadDetail = Omit<CustomerTicketDetail, 'messages'> & { messages: ThreadMessage[] };

export function useTickets(enabled = true) {
  return useInfiniteQuery({
    queryKey: [...SUPPORT_TICKETS_KEY, 'list'] as const,
    queryFn: ({ pageParam }) => fetchTickets(pageParam, TICKETS_PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasNextPage ? last.meta.page + 1 : undefined),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled,
  });
}

const tabVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

/** Polls while the tab is in front, so a reply from the shop lands without a refresh. */
export function useTicket(id: number | undefined) {
  return useQuery<ThreadDetail>({
    queryKey: ticketKey(id ?? 0),
    queryFn: () => fetchTicket(id as number),
    enabled: id !== undefined,
    refetchInterval: () => (tabVisible() ? 15_000 : false),
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewTicketInput) => createTicket(input),
    onSuccess: (ticket) => {
      qc.setQueryData(ticketKey(ticket.id), ticket);
      void qc.invalidateQueries({ queryKey: SUPPORT_TICKETS_KEY });
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
  const patch = (fn: (d: ThreadDetail) => ThreadDetail) => qc.setQueryData<ThreadDetail>(key, (d) => (d ? fn(d) : d));
  return useMutation({
    mutationFn: ({ body, files }: SendVars) => postMessage(id, { body, files }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const tempId = vars.tempId ?? -(++tempCounter);
      const draft = { body: vars.body, files: vars.files };
      patch((d) => {
        const exists = d.messages.some((m) => m.id === tempId);
        const messages = exists
          ? d.messages.map((m) => (m.id === tempId ? { ...m, local: { state: 'sending' as const, draft } } : m))
          : [...d.messages, {
              id: tempId, fromSupport: false, authorLabel: t('support.thread.you'), body: vars.body, attachments: [],
              createdAt: new Date().toISOString(), local: { state: 'sending' as const, draft },
            }];
        return { ...d, messages, status: 'needs_reply' };
      });
      return { tempId };
    },
    onSuccess: (message, _vars, ctx) => {
      patch((d) => ({ ...d, messages: d.messages.map((m) => (m.id === ctx.tempId ? message : m)) }));
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      patch((d) => ({
        ...d,
        messages: d.messages.map((m) => (m.id === ctx.tempId && m.local ? { ...m, local: { ...m.local, state: 'failed' as const } } : m)),
      }));
    },
    onSettled: (_data, err) => {
      // The thread already holds the truth after a failure; refetching would drop the failed message.
      if (!err) void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: [...SUPPORT_TICKETS_KEY, 'list'] });
    },
  });
}

export function useCloseTicket(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => closeTicket(id),
    onSuccess: (ticket) => {
      qc.setQueryData(ticketKey(id), ticket);
      void qc.invalidateQueries({ queryKey: [...SUPPORT_TICKETS_KEY, 'list'] });
    },
  });
}
