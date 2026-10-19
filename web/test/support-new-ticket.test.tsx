import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/errors.ts';

const shop = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => shop.settings }));

const api = vi.hoisted(() => ({ fetchTicketForOrder: vi.fn(), createTicket: vi.fn(), fetchOrders: vi.fn() }));
vi.mock('@/api/support.ts', async (orig) => ({
  ...(await orig<typeof import('@/api/support.ts')>()),
  fetchTicketForOrder: api.fetchTicketForOrder,
  createTicket: api.createTicket,
}));
vi.mock('@/api/orders.ts', async (orig) => ({ ...(await orig<typeof import('@/api/orders.ts')>()), fetchOrders: api.fetchOrders }));

import { NewTicketPage } from '@/features/support/NewTicketPage.tsx';
import { useSessionStore } from '@/stores/session.ts';

const meta = { page: 1, limit: 10, totalItems: 2, totalPages: 1, hasNextPage: false, hasPrevPage: false };
const ORDERS = [
  { reference: 'A1042', status: 'shipped', createdAt: '2026-10-14T10:00:00Z', totalAmount: 54, outstandingBalance: 0 },
  { reference: 'A1031', status: 'delivered', createdAt: '2026-10-02T10:00:00Z', totalAmount: 20, outstandingBalance: 0 },
];

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname}</p>;
}

const mount = (url = '/support/new') => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <MantineProvider env="test">
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/support/new" element={<NewTicketPage />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
};

const photo = (name: string, type = 'image/jpeg', size = 1000) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const pick = (files: File[]) => fireEvent.change(fileInput(), { target: { files } });

// Mantine's autosizing textarea listens for web fonts loading; jsdom has no `document.fonts`.
if (!('fonts' in document)) {
  Object.defineProperty(document, 'fonts', { configurable: true, value: { addEventListener: () => {}, removeEventListener: () => {} } });
}

beforeEach(() => {
  shop.settings = { currency: 'GBP', supportLinks: [], brand: { name: 'Shop', links: {} }, support: { enabled: true } };
  api.fetchTicketForOrder.mockReset();
  api.createTicket.mockReset();
  api.fetchOrders.mockReset();
  api.fetchOrders.mockResolvedValue({ data: ORDERS, meta });
  useSessionStore.setState({ token: 'tok', customer: { id: 1, nickname: 'Ada' } });
  vi.stubGlobal('fetch', vi.fn());
  let n = 0;
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:photo-${++n}`),
    revokeObjectURL: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the new ticket page', () => {
  it('?order with existing ticket redirects', async () => {
    api.fetchTicketForOrder.mockResolvedValue(42);
    mount('/support/new?order=A1042');
    expect(await screen.findByTestId('where')).toHaveTextContent('/support/tickets/42');
    expect(api.fetchTicketForOrder).toHaveBeenCalledWith('A1042');
  });

  it('?order without a ticket preselects that order and prefills the subject', async () => {
    api.fetchTicketForOrder.mockResolvedValue(null);
    mount('/support/new?order=A1042');
    const card = await screen.findByRole('radio', { name: /A1042/ });
    await waitFor(() => expect(card).toBeChecked());
    expect(screen.getByLabelText('Subject')).toHaveValue('Order A1042');
  });

  it('5th photo is refused with the photo copy', async () => {
    mount();
    await screen.findByRole('radio', { name: /A1042/ });
    pick([photo('1.jpg'), photo('2.png', 'image/png'), photo('3.webp', 'image/webp'), photo('4.gif', 'image/gif'), photo('5.jpg')]);
    expect(await screen.findByText('Photos must be JPEG, PNG, WebP or GIF, up to 5 MB.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Remove photo' })).toHaveLength(4);

    // Removing a photo frees its preview.
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove photo' })[0]!);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-1');
    expect(screen.getAllByRole('button', { name: 'Remove photo' })).toHaveLength(3);
  });

  it('refuses a file that is too large or not an image', async () => {
    mount();
    await screen.findByRole('radio', { name: /A1042/ });
    pick([photo('big.jpg', 'image/jpeg', 6 * 1024 * 1024), photo('doc.pdf', 'application/pdf')]);
    expect(await screen.findByText('Photos must be JPEG, PNG, WebP or GIF, up to 5 MB.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull();
  });

  it('send posts orderReference and navigates', async () => {
    api.createTicket.mockResolvedValue({ id: 77, subject: 'Order A1031', status: 'needs_reply', order: null, messages: [], timeline: [], canReply: true, reopenUntil: null, createdAt: '2026-10-19T10:00:00Z' });
    mount();
    const send = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(await screen.findByRole('radio', { name: /A1031/ }));
    expect(screen.getByLabelText('Subject')).toHaveValue('Order A1031');
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Tracking has not moved since Monday.' } });
    pick([photo('parcel.jpg')]);
    expect(send).toBeEnabled();
    fireEvent.click(send);
    expect(await screen.findByTestId('where')).toHaveTextContent('/support/tickets/77');
    expect(api.createTicket).toHaveBeenCalledWith({
      subject: 'Order A1031', body: 'Tracking has not moved since Monday.', orderReference: 'A1031', files: [expect.any(File)],
    });
  });

  it('something else sends without an order', async () => {
    api.createTicket.mockResolvedValue({ id: 78 });
    mount();
    await screen.findByRole('radio', { name: /A1042/ });
    fireEvent.click(screen.getByLabelText('Something else'));
    expect(screen.queryByRole('radio', { name: /A1042/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Payment question' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Can I pay by bank transfer?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(api.createTicket).toHaveBeenCalledWith({
      subject: 'Payment question', body: 'Can I pay by bank transfer?', orderReference: undefined, files: [],
    }));
  });

  it('a server 422 is shown in its own words', async () => {
    api.createTicket.mockRejectedValue(new ApiError(422, 'Only JPEG, PNG, WebP or GIF images can be attached'));
    mount();
    fireEvent.click(await screen.findByRole('radio', { name: /A1042/ }));
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Only JPEG, PNG, WebP or GIF images can be attached')).toBeInTheDocument();
  });

  it('support switched off shows the note and a way back', () => {
    shop.settings = { ...shop.settings, support: { enabled: false } };
    mount();
    expect(screen.getByText(/not being accepted/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to support/i })).toHaveAttribute('href', '/support');
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
  });
});
