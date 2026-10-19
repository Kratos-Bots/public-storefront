import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/errors.ts';
import type { CustomerMessage, CustomerTicketDetail } from '@/api/support.ts';

const shop = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => shop.settings }));

const api = vi.hoisted(() => ({ fetchTicket: vi.fn(), postMessage: vi.fn(), closeTicket: vi.fn() }));
vi.mock('@/api/support.ts', async (orig) => ({
  ...(await orig<typeof import('@/api/support.ts')>()),
  fetchTicket: api.fetchTicket,
  postMessage: api.postMessage,
  closeTicket: api.closeTicket,
}));

import { TicketPage } from '@/features/support/TicketPage.tsx';
import { useLocalMessages } from '@/features/support/queries.ts';
import { useSessionStore } from '@/stores/session.ts';

const SUPPORT: CustomerMessage = {
  id: 2, fromSupport: true, authorLabel: 'Support · Northbound', body: "It's with the courier.", attachments: [],
  createdAt: '2026-10-15T10:00:00Z',
};
const MINE: CustomerMessage = {
  id: 1, fromSupport: false, authorLabel: 'Ada', body: 'Where is my parcel?', attachments: [], createdAt: '2026-10-15T09:12:00Z',
};

const ticket = (over: Partial<CustomerTicketDetail> = {}): CustomerTicketDetail => ({
  id: 7,
  subject: 'Where is my parcel?',
  status: 'waiting_on_customer',
  order: { reference: 'A1042', status: 'shipped', createdAt: '2026-10-14T10:00:00Z' },
  messages: [MINE, SUPPORT],
  timeline: [{ type: 'opened', at: '2026-10-15T09:12:00Z' }],
  canReply: true,
  reopenUntil: null,
  createdAt: '2026-10-15T09:12:00Z',
  ...over,
});

/** Stands in for the new-ticket page: shows the text a conversation handed over. */
function NewTicketStandIn() {
  const state = useLocation().state as { body?: string } | null;
  return <p data-testid="carried">{state?.body ?? ''}</p>;
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const mount = (qc = newClient(), entry: string | { pathname: string; state?: unknown } = '/support/tickets/7') => {
  return render(
    <MantineProvider env="test">
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/support/tickets/:id" element={<TicketPage />} />
            <Route path="/support/new" element={<NewTicketStandIn />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
};

const write = (text: string) => fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: text } });
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Send' }));

beforeEach(() => {
  shop.settings = { currency: 'GBP', supportLinks: [], brand: { name: 'Northbound', links: {} }, support: { enabled: true } };
  api.fetchTicket.mockReset();
  api.postMessage.mockReset();
  api.closeTicket.mockReset();
  useSessionStore.setState({ token: 'tok', customer: { id: 1, nickname: 'Ada' } });
  useLocalMessages.setState({ byTicket: {} });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the ticket conversation', () => {
  it('renders support label and hides composer when canReply is false', async () => {
    api.fetchTicket.mockResolvedValue(ticket({
      status: 'closed', canReply: false,
      timeline: [{ type: 'opened', at: '2026-10-15T09:12:00Z' }, { type: 'closed', at: '2026-10-16T09:00:00Z' }],
    }));
    mount();
    expect(await screen.findByText('Support · Northbound')).toBeInTheDocument();
    // The customer's own messages read "You", whatever the server called them.
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.queryByText('Ada')).toBeNull();
    expect(screen.getByRole('log')).toHaveTextContent("It's with the courier.");
    expect(screen.getByText('Ticket opened')).toBeInTheDocument();
    expect(screen.getByText('Ticket closed')).toBeInTheDocument();

    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
    expect(screen.getByText('This ticket is closed.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open a new ticket' })).toHaveAttribute('href', '/support/new?order=A1042');
    expect(screen.getByRole('link', { name: /A1042/ })).toHaveAttribute('href', '/account/orders/A1042');
  });

  it('failed send shows retry', async () => {
    api.fetchTicket.mockResolvedValue(ticket());
    const sent = { ...MINE, id: 3, body: 'Any news?', createdAt: '2026-10-16T09:00:00Z' };
    api.postMessage.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValueOnce(sent);
    mount();
    await screen.findByText('Support · Northbound');

    write('Any news?');
    send();
    // Optimistic: the bubble is in the thread at once, and the composer is clear for the next one.
    expect(screen.getByRole('log')).toHaveTextContent('Any news?');
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');

    const retry = await screen.findByRole('button', { name: "Couldn't send. Tap to retry." });
    api.fetchTicket.mockResolvedValue(ticket({ status: 'needs_reply', messages: [MINE, SUPPORT, sent] }));
    fireEvent.click(retry);
    await waitFor(() => expect(api.postMessage).toHaveBeenCalledTimes(2));
    expect(api.postMessage).toHaveBeenLastCalledWith(7, { body: 'Any news?', files: [] });
    await waitFor(() => expect(screen.queryByRole('button', { name: "Couldn't send. Tap to retry." })).toBeNull());
    // Sent once, shown once.
    expect(screen.getAllByText('Any news?')).toHaveLength(1);
  });

  it('closed within window shows closedNote and composer', async () => {
    api.fetchTicket.mockResolvedValue(ticket({ status: 'closed', canReply: true, reopenUntil: '2026-10-30T00:00:00Z' }));
    mount();
    expect(await screen.findByText('This ticket is closed. Replying reopens it.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open a new ticket' })).toBeNull();
  });

  it('a reply refused as TICKET_CLOSED swaps the composer for a new ticket, keeping what was written', async () => {
    api.fetchTicket.mockResolvedValueOnce(ticket({ status: 'closed', canReply: true }));
    api.fetchTicket.mockResolvedValue(ticket({ status: 'closed', canReply: false }));
    api.postMessage.mockRejectedValue(new ApiError(409, 'TICKET_CLOSED'));
    mount();
    await screen.findByText('This ticket is closed. Replying reopens it.');

    write('Hello? The parcel never came.');
    send();
    const link = await screen.findByRole('link', { name: 'Open a new ticket' });
    expect(screen.getByText('This ticket is closed.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
    // The refused text stays on screen, with no retry that could only fail again…
    expect(screen.getByRole('log')).toHaveTextContent('Hello? The parcel never came.');
    expect(screen.queryByRole('button', { name: "Couldn't send. Tap to retry." })).toBeNull();
    // …and goes with the customer into the new ticket.
    fireEvent.click(link);
    expect(await screen.findByTestId('carried')).toHaveTextContent('Hello? The parcel never came.');
  });

  it('a draft in the box when the ticket stops taking replies is carried to the new ticket', async () => {
    const qc = newClient();
    api.fetchTicket.mockResolvedValueOnce(ticket({ status: 'closed', canReply: true }));
    mount(qc);
    await screen.findByText('This ticket is closed. Replying reopens it.');
    write('Half-written question');

    // The next poll finds the reopen window over.
    api.fetchTicket.mockResolvedValue(ticket({ status: 'closed', canReply: false }));
    await qc.invalidateQueries();
    fireEvent.click(await screen.findByRole('link', { name: 'Open a new ticket' }));
    expect(await screen.findByTestId('carried')).toHaveTextContent('Half-written question');
  });

  it('a failed send on a closed ticket leaves it reading as closed', async () => {
    api.fetchTicket.mockResolvedValue(ticket({ status: 'closed', canReply: true }));
    api.postMessage.mockRejectedValue(new ApiError(500, 'boom'));
    mount();
    await screen.findByText('This ticket is closed. Replying reopens it.');
    write('Still there?');
    send();
    await screen.findByRole('button', { name: "Couldn't send. Tap to retry." });
    expect(screen.getByText('This ticket is closed. Replying reopens it.')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ticket options' })).toBeNull();
  });

  it('a photo opens full size in a named dialog that Escape closes', async () => {
    api.fetchTicket.mockResolvedValue(ticket({
      messages: [MINE, { ...SUPPORT, attachments: [{ id: 5, url: 'public/storefront/support/attachments/5?exp=1&sig=a', width: 800, height: 600 }] }],
    }));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Open photo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Photo' });
    expect(dialog.querySelector('img')).toHaveAttribute('src', '/api/storefront/support/attachments/5?exp=1&sig=a');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('an unknown ticket is a friendly not-found with the way back', async () => {
    api.fetchTicket.mockRejectedValue(new ApiError(404, 'Ticket not found'));
    mount();
    expect(await screen.findByText("This ticket can't be found.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to support' })).toHaveAttribute('href', '/support');
  });

  it('text carried here from a closed ticket starts as the draft in the reply box, once', async () => {
    api.fetchTicket.mockResolvedValue(ticket());
    mount(newClient(), { pathname: '/support/tickets/7', state: { body: 'It is still broken.' } });
    expect(await screen.findByRole('textbox', { name: 'Message' })).toHaveValue('It is still broken.');
    expect(api.postMessage).not.toHaveBeenCalled();
  });

  it('the keyboard coming up does not pull a reader who scrolled back up down to the end', async () => {
    api.fetchTicket.mockResolvedValue(ticket());
    const vv = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 });
    vi.stubGlobal('visualViewport', vv);
    vi.stubGlobal('innerHeight', 844);
    mount();
    await screen.findByRole('log');
    const log = screen.getByRole('log').parentElement!;
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    // Reading far above the end.
    log.getBoundingClientRect = () => ({ bottom: 3000 } as DOMRect);
    fireEvent.scroll(window);
    vv.height = 500;
    vv.dispatchEvent(new Event('resize'));
    await new Promise((r) => setTimeout(r, 50));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
