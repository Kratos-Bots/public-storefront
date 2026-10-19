import type { TicketStatus } from '@/api/support.ts';
import type { Tone } from '@/features/order-status/status.ts';
import { textKey } from '@/text/runtime.tsx';
import type { StringKey } from '@/text/registry.ts';

/** A ticket's status pill. "Reply" is the customer's move, so it carries the accent; "Waiting" is the shop's. */
export const TICKET_STATUS: Record<TicketStatus, { label: Extract<StringKey, `support.status.${string}`>; tone: Tone }> = {
  needs_reply: { label: textKey('support.status.needsReply'), tone: 'default' },
  waiting_on_customer: { label: textKey('support.status.waiting'), tone: 'success' },
  closed: { label: textKey('support.status.closed'), tone: 'muted' },
};

