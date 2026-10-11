import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const shop = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
}));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => shop.settings }));

import { SupportPage } from '@/features/support/SupportPage.tsx';

const mount = () => render(<MemoryRouter><SupportPage /></MemoryRouter>);

beforeEach(() => {
  shop.settings = { currency: 'GBP', supportLinks: [], brand: { name: 'Northbound Supply', links: { whatsapp: null, telegram: null } } };
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the support page', () => {
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
      brand: { name: 'Northbound Supply', links: { whatsapp: 'https://wa.me/447700900000', telegram: 'https://t.me/northbound_example' } },
    };
    mount();
    expect(screen.getByRole('link', { name: 'Help centre' })).toHaveAttribute('href', 'https://help.example.invalid/');
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/447700900000');
    expect(screen.getByRole('link', { name: 'Telegram' })).toHaveAttribute('href', 'https://t.me/northbound_example');
  });

  it('asks the network for nothing, and has no form', () => {
    shop.settings = { currency: 'GBP', supportLinks: [], brand: { name: 'Northbound Supply', links: { whatsapp: 'https://wa.me/447700900000', telegram: null } } };
    const { container } = mount();
    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector('form, input, textarea, button')).toBeNull();
  });
});
