import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const shop = vi.hoisted(() => ({ faq: { available: true } as undefined | { available: boolean } }));
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ currency: 'GBP', supportLinks: [], faq: shop.faq, brand: { name: 'Northbound Supply', title: 'Northbound Supply', links: { whatsapp: null, telegram: null } } }),
}));
vi.mock('@/api/faq.ts', () => ({ fetchFaq: vi.fn() }));

import { fetchFaq } from '@/api/faq.ts';
import { HelpPage } from '@/features/support/HelpPage.tsx';
import { ApiError } from '@/lib/errors.ts';
import { resetWarehouseStore, useWarehouseStore } from '@/features/warehouses/store.ts';

const fetchMock = vi.mocked(fetchFaq);

const sections = [
  { id: 'ordering', title: 'Ordering Process', body: 'Add items to your cart.\nThen check out.' },
  { id: 'shipping', title: 'Shipping Info', body: 'We post on weekdays. Tracking: https://example.com/track.' },
  { id: 'xabc12345', title: 'Payment', body: 'Cards and bank transfer.' },
];

const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MantineProvider env="test">
        <MemoryRouter><HelpPage /></MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
  return { ...view, client };
};
const headers = () => screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'));

beforeEach(() => {
  fetchMock.mockReset();
  shop.faq = { available: true };
});
afterEach(cleanup);

describe('the FAQ on the Help page', () => {
  it('shows a loading state until the sections arrive', async () => {
    let resolve!: (v: { sections: typeof sections }) => void;
    fetchMock.mockReturnValue(new Promise((r) => { resolve = r; }));
    mount();
    expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Common questions' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('status')).toBeInTheDocument();
    resolve({ sections });
    await screen.findByRole('button', { name: 'Ordering Process' });
  });

  it('lists the sections in order as buttons, the first one open', async () => {
    fetchMock.mockResolvedValue({ sections });
    mount();
    await screen.findByRole('button', { name: 'Ordering Process' });
    expect(headers().map((b) => b.textContent)).toEqual(['Ordering Process', 'Shipping Info', 'Payment']);
    expect(headers().map((b) => b.getAttribute('aria-expanded'))).toEqual(['true', 'false', 'false']);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
  });

  it('wires each header to its region with aria-controls / aria-labelledby', async () => {
    fetchMock.mockResolvedValue({ sections });
    mount();
    await screen.findByRole('button', { name: 'Ordering Process' });
    for (const b of headers()) {
      const panel = document.getElementById(b.getAttribute('aria-controls')!)!;
      expect(panel).not.toBeNull();
      expect(panel).toHaveAttribute('role', 'region');
      expect(panel).toHaveAttribute('aria-labelledby', b.id);
    }
    expect(screen.getByRole('region', { name: 'Ordering Process' })).toBeVisible();
  });

  it('opens one at a time: opening another closes the first, and clicking the open one closes it', async () => {
    fetchMock.mockResolvedValue({ sections });
    mount();
    await screen.findByRole('button', { name: 'Ordering Process' });
    fireEvent.click(screen.getByRole('button', { name: 'Shipping Info' }));
    expect(headers().map((b) => b.getAttribute('aria-expanded'))).toEqual(['false', 'true', 'false']);
    expect(screen.getByRole('region', { name: 'Shipping Info' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Shipping Info' }));
    expect(headers().map((b) => b.getAttribute('aria-expanded'))).toEqual(['false', 'false', 'false']);
  });

  it('hides a closed answer from assistive technology', async () => {
    fetchMock.mockResolvedValue({ sections });
    mount();
    await screen.findByRole('button', { name: 'Ordering Process' });
    expect(screen.queryByRole('region', { name: 'Shipping Info' })).toBeNull();
    expect(screen.queryByText(/We post on weekdays/)).not.toBeVisible();
  });

  it('keeps line breaks and turns a bare URL into a safe link without swallowing the full stop', async () => {
    fetchMock.mockResolvedValue({ sections });
    mount();
    await screen.findByRole('button', { name: 'Ordering Process' });
    const first = screen.getByRole('region', { name: 'Ordering Process' });
    expect(first.querySelector('p')!.textContent).toBe('Add items to your cart.\nThen check out.');
    fireEvent.click(screen.getByRole('button', { name: 'Shipping Info' }));
    const shipping = screen.getByRole('region', { name: 'Shipping Info' });
    const link = within(shipping).getByRole('link', { name: 'https://example.com/track' });
    expect(link).toHaveAttribute('href', 'https://example.com/track');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(shipping.querySelector('p')!.textContent).toBe('We post on weekdays. Tracking: https://example.com/track.');
  });

  it('renders hostile answer text as inert text', async () => {
    fetchMock.mockResolvedValue({ sections: [{ id: 'ordering', title: 'Ordering Process', body: '<script>window.__x = 1</script> javascript:alert(1) <img src=x onerror=alert(1)>' }] });
    const { container } = mount();
    await screen.findByRole('button', { name: 'Ordering Process' });
    const panel = screen.getByRole('region', { name: 'Ordering Process' });
    expect(panel.textContent).toContain('<script>window.__x = 1</script>');
    expect(panel.querySelector('script, img, a')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect((window as unknown as { __x?: number }).__x).toBeUndefined();
  });

  it('sets the document title while it is on screen and puts the shop title back after', async () => {
    document.title = 'Northbound Supply';
    fetchMock.mockResolvedValue({ sections });
    const { unmount } = mount();
    await waitFor(() => expect(document.title).toBe('Help — Northbound Supply'));
    unmount();
    expect(document.title).toBe('Northbound Supply');
  });

  it('keeps the list on screen when a background refetch fails', async () => {
    fetchMock.mockResolvedValueOnce({ sections });
    const { client } = mount();
    await screen.findByRole('button', { name: 'Ordering Process' });
    fetchMock.mockRejectedValue(new ApiError(500, 'Boom'));
    await act(async () => { await client.refetchQueries({ queryKey: ['faq'] }); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3), { timeout: 4000 });
    expect(headers().map((b) => b.textContent)).toEqual(['Ordering Process', 'Shipping Info', 'Payment']);
    expect(screen.queryByText('Boom')).toBeNull();
  });

  it('opens the first section when the open one disappears after a refetch', async () => {
    fetchMock.mockResolvedValueOnce({ sections });
    const { client } = mount();
    await screen.findByRole('button', { name: 'Ordering Process' });
    fireEvent.click(screen.getByRole('button', { name: 'Shipping Info' }));
    fetchMock.mockResolvedValueOnce({ sections: [sections[0]!, sections[2]!] });
    await act(async () => { await client.refetchQueries({ queryKey: ['faq'] }); });
    await waitFor(() => expect(headers().map((b) => b.textContent)).toEqual(['Ordering Process', 'Payment']));
    expect(headers().map((b) => b.getAttribute('aria-expanded'))).toEqual(['true', 'false']);
  });

  it('keeps everything closed when the shopper closed it, even after a refetch', async () => {
    fetchMock.mockResolvedValue({ sections });
    const { client } = mount();
    await screen.findByRole('button', { name: 'Ordering Process' });
    fireEvent.click(screen.getByRole('button', { name: 'Ordering Process' }));
    await act(async () => { await client.refetchQueries({ queryKey: ['faq'] }); });
    expect(headers().map((b) => b.getAttribute('aria-expanded'))).toEqual(['false', 'false', 'false']);
  });

  it('falls back to the shell copy when the list is empty', async () => {
    fetchMock.mockResolvedValue({ sections: [] });
    mount();
    expect(await screen.findByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.queryByText('Common questions')).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows the shell copy, and asks for nothing, when the shop has no FAQ available', () => {
    shop.faq = { available: false };
    mount();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.queryByText('Common questions')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats an older backend (no faq key) as no FAQ', () => {
    shop.faq = undefined;
    mount();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a server error', new ApiError(500, 'Boom')],
    ['a sign-in requirement', new ApiError(401, 'LOGIN_REQUIRED')],
    ['a refused account', new ApiError(403, 'ACCESS_DENIED')],
  ])('hides the section quietly after %s: no error page, no message', async (_name, error) => {
    fetchMock.mockRejectedValue(error);
    mount();
    // Other errors get one retry (about a second) before the section gives up.
    expect(await screen.findByText(/coming soon/i, {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText('Common questions')).toBeNull();
    expect(screen.queryByText('Boom')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('does not retry a 401 or 403', async () => {
    fetchMock.mockRejectedValue(new ApiError(401, 'LOGIN_REQUIRED'));
    mount();
    await screen.findByText(/coming soon/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is the section the old /faq link lands on', async () => {
    fetchMock.mockResolvedValue({ sections });
    const { container } = mount();
    await screen.findByRole('button', { name: 'Ordering Process' });
    expect(container.querySelector('section#faq')).not.toBeNull();
  });

  it('a FAQ-only shop (support off) shows the FAQ and the contact block', async () => {
    shop.faq = { available: true };
    fetchMock.mockResolvedValue({ sections });
    mount();
    await screen.findByRole('button', { name: 'Ordering Process' });
    expect(screen.queryByRole('link', { name: /new ticket/i })).toBeNull();
    expect(screen.queryByText('Your tickets')).toBeNull();
  });
});

describe('the Help page FAQ while the warehouse list is on its way', () => {
  const rows = [{ id: 1, name: 'Main', country: null, isDefault: true }, { id: 2, name: 'Site 2', country: null, isDefault: false, faq: { available: true } }];
  afterEach(() => resetWarehouseStore());

  it('shows the skeleton, not the empty state, when a stored warehouse is chosen and the list has not arrived (shop FAQ off)', () => {
    shop.faq = { available: false };
    useWarehouseStore.setState({ warehouseId: 2, ctx: { enabled: true, list: null, failed: false, groups: null, carried: null } });
    mount();
    expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });
  it('then shows the warehouse sections once the list arrives', async () => {
    shop.faq = { available: false };
    fetchMock.mockResolvedValue({ sections });
    useWarehouseStore.setState({ warehouseId: 2, ctx: { enabled: true, list: null, failed: false, groups: null, carried: null } });
    mount();
    act(() => useWarehouseStore.getState().setContext({ list: rows }));
    await screen.findByRole('button', { name: 'Ordering Process' });
    expect(fetchMock).toHaveBeenCalledWith(2);
  });
  it('is not pending forever: a failed list reads the shop value (shell copy when the shop has no FAQ)', () => {
    shop.faq = { available: false };
    useWarehouseStore.setState({ warehouseId: 2, ctx: { enabled: true, list: null, failed: true, groups: null, carried: null } });
    mount();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });
  it('is never pending with no selection or with the picker off', () => {
    shop.faq = { available: false };
    useWarehouseStore.setState({ warehouseId: null, ctx: { enabled: true, list: null, failed: false, groups: null, carried: null } });
    mount();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    cleanup();
    useWarehouseStore.setState({ warehouseId: 2, ctx: { enabled: false, list: null, failed: false, groups: null, carried: null } });
    mount();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });
});
