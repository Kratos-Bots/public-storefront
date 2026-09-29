import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';

const m = vi.hoisted(() => ({
  inTelegram: true,
  mode: 'beta' as 'off' | 'beta' | 'forced',
  setBotMode: vi.fn(async (classic: boolean) => ({ classic })),
  tgClose: vi.fn(),
  telegramLink: 'https://t.me/shop' as string | null,
}));

vi.mock('@/lib/telegram-webapp.ts', () => ({ isTelegramWebApp: () => m.inTelegram, tgClose: m.tgClose }));
vi.mock('@/api/profile.ts', () => ({ setBotMode: m.setBotMode }));
vi.mock('@/app/layout.ts', () => ({ useEffectiveLayout: () => (m.inTelegram ? 'webapp' : 'storefront') }));
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({
    currency: 'GBP',
    telegramWebApp: { mode: m.mode },
    brand: { name: 'Shop', links: { whatsapp: null, telegram: m.telegramLink } },
    supportLinks: [],
  }),
}));
vi.mock('@/components/ContactLinks.tsx', () => ({ ContactLinks: () => <div data-testid="contact" /> }));
vi.mock('@/features/account/queries.ts', () => ({
  useProfile: () => ({
    isPending: false,
    isError: false,
    data: {
      nickname: 'Ada', memberSince: '2026-01-01T00:00:00.000Z', totalOrders: 2, totalSpend: 40,
      identities: { telegram: true, whatsapp: false, email: false },
    },
  }),
}));

import { ProfilePage } from '@/features/account/ProfilePage.tsx';

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  m.inTelegram = true;
  m.mode = 'beta';
  m.telegramLink = 'https://t.me/shop';
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProfilePage in the Telegram Mini App', () => {
  it('has no sign-out — identity is the Telegram account', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('shows contact links in place of the footer strip', () => {
    renderPage();
    expect(screen.getByTestId('contact')).toBeInTheDocument();
  });

  it('omits the Talk to us section when the brand has no chat links', () => {
    m.telegramLink = null;
    renderPage();
    expect(screen.queryByTestId('contact')).toBeNull();
    expect(screen.queryByText('Talk to us')).toBeNull();
  });

  it('switches to the classic bot after a confirmation, then closes the Mini App', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to the classic bot' }));
    expect(m.setBotMode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, switch' }));
    await waitFor(() => expect(m.setBotMode).toHaveBeenCalledWith(true));
    await waitFor(() => expect(m.tgClose).toHaveBeenCalled());
  });

  it('can back out of the confirmation', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to the classic bot' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Switch to the classic bot' })).toBeInTheDocument();
  });

  it.each(['forced', 'off'] as const)('offers no switch in %s mode', (mode) => {
    m.mode = mode;
    renderPage();
    expect(screen.queryByRole('button', { name: 'Switch to the classic bot' })).toBeNull();
  });
});

describe('ProfilePage in a browser', () => {
  it('keeps sign-out and offers no bot switch', () => {
    m.inTelegram = false;
    renderPage();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Switch to the classic bot' })).toBeNull();
    expect(screen.queryByTestId('contact')).toBeNull();
  });
});
