import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const shop = vi.hoisted(() => ({ faq: { available: true } as undefined | { available: boolean } }));
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ currency: 'GBP', supportLinks: [], faq: shop.faq, brand: { name: 'Northbound Supply', title: 'Northbound Supply', links: { whatsapp: null, telegram: null } } }),
}));
vi.mock('@/api/faq.ts', () => ({ fetchFaq: vi.fn() }));

import { fetchFaq } from '@/api/faq.ts';
import { FaqPage } from '@/features/faq/FaqPage.tsx';
import { ApiError } from '@/lib/errors.ts';

const fetchMock = vi.mocked(fetchFaq);

const sections = [
  { id: 'ordering', title: 'Ordering Process', body: 'Add items to your cart.\nThen check out.' },
  { id: 'shipping', title: 'Shipping Info', body: 'We post on weekdays. Tracking: https://example.com/track.' },
  { id: 'xabc12345', title: 'Payment', body: 'Cards and bank transfer.' },
];

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MantineProvider env="test">
        <MemoryRouter><FaqPage /></MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
const headers = () => screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'));

beforeEach(() => {
  fetchMock.mockReset();
  shop.faq = { available: true };
});
afterEach(cleanup);

describe('the FAQ page', () => {
  it('shows a loading state until the sections arrive', async () => {
    let resolve!: (v: { sections: typeof sections }) => void;
    fetchMock.mockReturnValue(new Promise((r) => { resolve = r; }));
    mount();
    expect(screen.getByRole('heading', { level: 1, name: 'Frequently asked questions' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
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
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
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
    await waitFor(() => expect(document.title).toBe('Frequently asked questions — Northbound Supply'));
    unmount();
    expect(document.title).toBe('Northbound Supply');
  });

  it('shows the empty state when the list is empty', async () => {
    fetchMock.mockResolvedValue({ sections: [] });
    mount();
    expect(await screen.findByText('No questions yet')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows the empty state, and asks for nothing, when the shop has no FAQ available', () => {
    shop.faq = { available: false };
    mount();
    expect(screen.getByText('No questions yet')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats an older backend (no faq key) as no FAQ', () => {
    shop.faq = undefined;
    mount();
    expect(screen.getByText('No questions yet')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows an error with a way to try again', async () => {
    fetchMock.mockRejectedValueOnce(new ApiError(500, 'Boom'));
    mount();
    expect(await screen.findByText('Boom')).toBeInTheDocument();
    fetchMock.mockResolvedValueOnce({ sections });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('button', { name: 'Ordering Process' });
  });

  it('tells a shopper who must sign in first to sign in (401 LOGIN_REQUIRED)', async () => {
    fetchMock.mockRejectedValue(new ApiError(401, 'LOGIN_REQUIRED'));
    mount();
    expect(await screen.findByText('Please sign in to continue.')).toBeInTheDocument();
  });

  it('tells a refused shopper they have no access (403 ACCESS_DENIED)', async () => {
    fetchMock.mockRejectedValue(new ApiError(403, 'ACCESS_DENIED'));
    mount();
    expect(await screen.findByText('Your account doesn’t have access to this shop.')).toBeInTheDocument();
  });
});
