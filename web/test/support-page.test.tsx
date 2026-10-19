import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const shop = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
}));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => shop.settings }));

const api = vi.hoisted(() => ({ fetchTickets: vi.fn() }));
vi.mock('@/api/support.ts', async (orig) => ({ ...(await orig<typeof import('@/api/support.ts')>()), fetchTickets: api.fetchTickets }));

import { SupportPage } from '@/features/support/SupportPage.tsx';
import { useSessionStore } from '@/stores/session.ts';
import { useLocalMessages } from '@/features/support/queries.ts';

const meta = { page: 1, limit: 20, totalItems: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false };

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider env="test">
      <QueryClientProvider client={qc}>
        <MemoryRouter><SupportPage /></MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
};

const NO_CHAT = { name: 'Northbound Supply', links: { whatsapp: null, telegram: null } };
const CHAT = { name: 'Northbound Supply', links: { whatsapp: 'https://wa.me/447700900000', telegram: 'https://t.me/northbound_example' } };

beforeEach(() => {
  shop.settings = { currency: 'GBP', supportLinks: [], brand: NO_CHAT };
  api.fetchTickets.mockReset();
  api.fetchTickets.mockResolvedValue({ data: [], meta });
  useSessionStore.setState({ token: null, customer: null });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the support page with support switched off', () => {
  it('is a heading and a coming-soon line when the shop has no contact routes', () => {
    mount();
    expect(screen.getByRole('heading', { level: 1, name: 'Support' })).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(/reach us/i)).toBeNull();
  });

  it('lists the shop\'s support links and its chat links', () => {
    shop.settings = {
      currency: 'GBP',
      supportLinks: [{ label: 'Help centre', url: 'https://help.example.invalid/' }],
      brand: CHAT,
    };
    mount();
    expect(screen.getByRole('link', { name: 'Help centre' })).toHaveAttribute('href', 'https://help.example.invalid/');
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/447700900000');
    expect(screen.getByRole('link', { name: 'Telegram' })).toHaveAttribute('href', 'https://t.me/northbound_example');
  });

  it('support disabled with no tickets renders the old shell copy', async () => {
    useSessionStore.setState({ token: 'tok', customer: { id: 1, nickname: 'Ada' } });
    shop.settings = { currency: 'GBP', supportLinks: [], brand: CHAT, support: { enabled: false } };
    mount();
    expect(await screen.findByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Support' })).toBeInTheDocument();
    expect(screen.getByText(/reach us/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /new ticket/i })).toBeNull();
    expect(screen.queryByText('Your tickets')).toBeNull();
    expect(screen.queryByText(/send us a message/i)).toBeNull();
  });
});

describe('the support page with support switched on', () => {
  it('signed out shows sign-in and chat links', () => {
    shop.settings = { currency: 'GBP', supportLinks: [], brand: CHAT, support: { enabled: true } };
    mount();
    expect(screen.getByText(/send us a message/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in to open a ticket' })).toHaveAttribute('href', '/login?returnTo=%2Fsupport');
    expect(screen.getByText('Prefer chat?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /new ticket/i })).toBeNull();
    expect(api.fetchTickets).not.toHaveBeenCalled();
  });

  it('signed in lists tickets with unread dot', async () => {
    useSessionStore.setState({ token: 'tok', customer: { id: 1, nickname: 'Ada' } });
    shop.settings = { currency: 'GBP', supportLinks: [], brand: NO_CHAT, support: { enabled: true } };
    api.fetchTickets.mockResolvedValue({
      data: [
        { id: 7, subject: 'Where is my parcel?', status: 'waiting_on_customer', order: { reference: 'A1042' },
          lastMessage: { preview: 'It left our warehouse yesterday', fromSupport: true, at: '2026-10-18T10:00:00Z' }, unread: true, createdAt: '2026-10-17T10:00:00Z' },
        { id: 5, subject: 'Payment question', status: 'needs_reply', order: null,
          lastMessage: { preview: 'Can I pay by bank transfer?', fromSupport: false, at: '2026-10-16T10:00:00Z' }, unread: false, createdAt: '2026-10-16T10:00:00Z' },
        { id: 2, subject: 'Wrong item received', status: 'closed', order: { reference: 'A0988' },
          lastMessage: { preview: 'Sorted, thanks', fromSupport: false, at: '2026-10-03T10:00:00Z' }, unread: false, createdAt: '2026-10-01T10:00:00Z' },
      ],
      meta: { ...meta, totalItems: 3, totalPages: 1 },
    });
    mount();
    expect(screen.getByRole('link', { name: 'New ticket' })).toHaveAttribute('href', '/support/new');

    const first = await screen.findByRole('link', { name: /Where is my parcel\?/ });
    expect(first).toHaveAttribute('href', '/support/tickets/7');
    expect(within(first).getByText('Reply')).toBeInTheDocument();
    expect(within(first).getByText('A1042')).toBeInTheDocument();
    expect(within(first).getByText('Support: It left our warehouse yesterday')).toBeInTheDocument();
    expect(first.querySelector('[data-unread]')).not.toBeNull();

    const second = screen.getByRole('link', { name: /Payment question/ });
    expect(within(second).getByText('Waiting')).toBeInTheDocument();
    expect(within(second).getByText('General')).toBeInTheDocument();
    expect(within(second).getByText('You: Can I pay by bank transfer?')).toBeInTheDocument();
    expect(second.querySelector('[data-unread]')).toBeNull();

    const third = screen.getByRole('link', { name: /Wrong item received/ });
    expect(within(third).getByText('Closed')).toBeInTheDocument();
  });

  it('signed in with no tickets shows the empty line', async () => {
    useSessionStore.setState({ token: 'tok', customer: { id: 1, nickname: 'Ada' } });
    shop.settings = { currency: 'GBP', supportLinks: [], brand: NO_CHAT, support: { enabled: true } };
    mount();
    expect(await screen.findByText('No tickets yet.')).toBeInTheDocument();
  });

  it('support disabled but the customer has tickets: the list stays, the New ticket button gives way to a note', async () => {
    useSessionStore.setState({ token: 'tok', customer: { id: 1, nickname: 'Ada' } });
    shop.settings = { currency: 'GBP', supportLinks: [], brand: NO_CHAT, support: { enabled: false } };
    api.fetchTickets.mockResolvedValue({
      data: [{ id: 9, subject: 'Old question', status: 'closed', order: null,
        lastMessage: { preview: 'Done', fromSupport: true, at: '2026-10-03T10:00:00Z' }, unread: false, createdAt: '2026-10-01T10:00:00Z' }],
      meta: { ...meta, totalItems: 1, totalPages: 1 },
    });
    mount();
    expect(await screen.findByRole('link', { name: /Old question/ })).toBeInTheDocument();
    expect(screen.getByText(/not being accepted/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New ticket' })).toBeNull();
  });
});

describe('signing out', () => {
  it('drops messages this browser had not yet sent', () => {
    useSessionStore.setState({ token: 'tok', customer: { id: 1, nickname: 'Ada' } });
    useLocalMessages.getState().set(3, () => [{ id: -1, fromSupport: false, authorLabel: 'You', body: 'x', attachments: [], createdAt: 'now' }]);
    useSessionStore.getState().clear();
    expect(useLocalMessages.getState().byTicket).toEqual({});
  });
});
