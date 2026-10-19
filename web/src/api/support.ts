import { api, unwrap, unwrapWithMeta } from '@/api/client.ts';
import type { PageMeta } from '@/types/orders.ts';

export type TicketStatus = 'needs_reply' | 'waiting_on_customer' | 'closed';

export interface SupportAttachment {
  id: number;
  /** Path relative to the API base, e.g. `public/storefront/support/attachments/12?exp=..&sig=..`; valid for an hour. */
  url: string;
  width: number | null;
  height: number | null;
}

export interface CustomerTicketSummary {
  id: number;
  subject: string;
  status: TicketStatus;
  order: { reference: string } | null;
  lastMessage: { preview: string; fromSupport: boolean; at: string };
  unread: boolean;
  createdAt: string;
}

export interface CustomerMessage {
  id: number;
  fromSupport: boolean;
  /** "You" is decided client-side; support reads "Support · <shop>". */
  authorLabel: string;
  body: string;
  attachments: SupportAttachment[];
  createdAt: string;
}

export interface TicketTimelineEvent {
  type: 'opened' | 'closed' | 'reopened';
  at: string;
}

export interface CustomerTicketDetail {
  id: number;
  subject: string;
  status: TicketStatus;
  order: { reference: string; status: string; createdAt: string } | null;
  messages: CustomerMessage[];
  timeline: TicketTimelineEvent[];
  canReply: boolean;
  reopenUntil: string | null;
  createdAt: string;
}

export interface NewTicketInput {
  subject: string;
  body: string;
  orderReference?: string;
  files: File[];
}

export interface NewMessageInput {
  body: string;
  files: File[];
}

/** Four 5 MB photos on a phone connection can outlast the shared 20 s. */
const UPLOAD_TIMEOUT = 60_000;

/** The Worker maps `/api/storefront/...` to the backend's `/api/v1/public/storefront/...`. */
export const attachmentSrc = (a: SupportAttachment) => `/api/${a.url.replace(/^public\//, '')}`;

// A FormData body: the browser writes the multipart content-type and boundary, so no header is set here.
function messageForm(body: string, files: File[]): FormData {
  const fd = new FormData();
  fd.append('body', body);
  for (const f of files) fd.append('files', f);
  return fd;
}

export const fetchTickets = (page: number, limit: number) =>
  unwrapWithMeta<CustomerTicketSummary[], PageMeta>(api.get('storefront/support/tickets', { searchParams: { page, limit } }));

export const fetchTicket = (id: number) => unwrap<CustomerTicketDetail>(api.get(`storefront/support/tickets/${id}`));

/** The newest open ticket about this order, if any. */
export const fetchTicketForOrder = async (reference: string) =>
  (await unwrap<{ ticketId: number | null }>(api.get(`storefront/support/tickets/by-order/${encodeURIComponent(reference)}`))).ticketId;

export function createTicket({ subject, body, orderReference, files }: NewTicketInput) {
  const fd = messageForm(body, files);
  fd.append('subject', subject);
  if (orderReference) fd.append('orderReference', orderReference);
  // No transport retry: a replayed POST would open a second ticket.
  return unwrap<CustomerTicketDetail>(api.post('storefront/support/tickets', { body: fd, retry: 0, timeout: UPLOAD_TIMEOUT }));
}

export const postMessage = (id: number, { body, files }: NewMessageInput) =>
  unwrap<CustomerMessage>(api.post(`storefront/support/tickets/${id}/messages`, { body: messageForm(body, files), retry: 0, timeout: UPLOAD_TIMEOUT }));

export const closeTicket = (id: number) => unwrap<CustomerTicketDetail>(api.post(`storefront/support/tickets/${id}/close`));
