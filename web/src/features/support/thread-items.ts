import type { TicketTimelineEvent } from '@/api/support.ts';
import type { ThreadDetail, ThreadMessage } from '@/features/support/queries.ts';

export type ThreadItem =
  | { kind: 'event'; key: string; event: TicketTimelineEvent }
  | { kind: 'message'; key: string; message: ThreadMessage };

/**
 * Messages and the ticket's opened/closed/reopened lines in one order of time. At the same instant an opening or
 * reopening line comes before a message and a closing line after it; messages still on their way always end the thread.
 */
export function threadItems(detail: ThreadDetail): ThreadItem[] {
  const rank = (i: ThreadItem) => (i.kind === 'message' ? 0 : i.event.type === 'closed' ? 1 : -1);
  const at = (i: ThreadItem) => Date.parse(i.kind === 'message' ? i.message.createdAt : i.event.at) || 0;
  const settled: ThreadItem[] = [
    ...detail.timeline.map((event, n) => ({ kind: 'event' as const, key: `e${n}-${event.type}`, event })),
    ...detail.messages.filter((m) => !m.local).map((message) => ({ kind: 'message' as const, key: `m${message.id}`, message })),
  ];
  settled.sort((a, b) => at(a) - at(b) || rank(a) - rank(b));
  const pending = detail.messages.filter((m) => m.local).map((message) => ({ kind: 'message' as const, key: `m${message.id}`, message }));
  return [...settled, ...pending];
}
