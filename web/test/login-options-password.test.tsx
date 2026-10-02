import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

const h = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));
vi.mock('@/features/auth/PasswordLogin.tsx', async () => {
  const { createElement } = await import('react');
  return { PasswordLogin: () => createElement('p', null, 'PASSWORD CARD') };
});
vi.mock('@/features/auth/WhatsappLogin.tsx', async () => {
  const { createElement } = await import('react');
  return { WhatsappLogin: () => createElement('p', null, 'WHATSAPP CARD') };
});

import { LoginOptions } from '@/features/auth/LoginOptions.tsx';
import { LoginModal } from '@/features/auth/LoginModal.tsx';
import { LoginPage } from '@/features/auth/LoginPage.tsx';
import { useTelegramAuthStore } from '@/stores/telegram.ts';
import { useUiStore } from '@/stores/ui.ts';
import { useSessionStore } from '@/stores/session.ts';

function configure(o: { whatsapp?: boolean; password?: boolean | undefined } = {}) {
  h.settings = {
    brand: { name: 'Northbound Supply', shortName: 'Northbound', links: { whatsapp: null, telegram: null } }, supportLinks: [],
    login: {
      whatsapp: { available: o.whatsapp ?? false, number: '447700900123' },
      telegram: { available: false, botUsername: null },
      ...(o.password === undefined ? {} : { password: { available: o.password, resetByEmail: false, resetByWhatsapp: false } }),
    },
  };
}
const shell = (ui: React.ReactNode) => render(
  <MantineProvider env="test"><QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider></MantineProvider>,
);

beforeEach(() => {
  useSessionStore.setState({ token: null, customer: null, returnTo: null });
  useTelegramAuthStore.setState({ status: 'none', error: null });
  useUiStore.setState({ loginOpen: false });
});
afterEach(cleanup);

describe('LoginOptions with password sign-in', () => {
  it('shows the email-or-phone card after the chat cards, and never the old "coming soon" card', () => {
    configure({ whatsapp: true, password: true });
    shell(<LoginOptions />);
    expect(screen.getByRole('heading', { name: 'Email or phone' })).toBeTruthy();
    const text = document.body.textContent ?? '';
    expect(text.indexOf('WHATSAPP CARD')).toBeLessThan(text.indexOf('PASSWORD CARD'));
    expect(text).not.toContain('Coming soon');
  });

  it('puts the owner’s lockout copy above the sign-in cards in a restricted shop, and the plain line below otherwise', () => {
    configure({ whatsapp: true, password: true });
    h.settings = { ...h.settings, access: { storefront: 'restricted', registration: true, deniedMessage: 'Ask us on chat.', deniedButtons: [] } };
    shell(<LoginOptions />);
    let text = document.body.textContent ?? '';
    expect(text.indexOf('Ask us on chat.')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('Ask us on chat.')).toBeLessThan(text.indexOf('WHATSAPP CARD'));
    cleanup();

    configure({ whatsapp: true, password: true });
    h.settings = { ...h.settings, access: { storefront: 'login', registration: true, deniedMessage: '', deniedButtons: [] } };
    shell(<LoginOptions />);
    text = document.body.textContent ?? '';
    expect(text.indexOf('Sign in to view the shop.')).toBeGreaterThan(text.indexOf('PASSWORD CARD'));
  });

  it('password alone is a working page, not the "sign-in isn\'t available" state', () => {
    configure({ whatsapp: false, password: true });
    shell(<LoginOptions />);
    expect(screen.getByText('PASSWORD CARD')).toBeTruthy();
    expect(screen.queryByText(/Sign-in isn’t available/)).toBeNull();
  });

  it.each([false, undefined])('password.available=%s with no other method is the unavailable state', (password) => {
    configure({ whatsapp: false, password });
    shell(<LoginOptions />);
    expect(screen.queryByText('PASSWORD CARD')).toBeNull();
    expect(screen.getByText('Sign-in isn’t available right now')).toBeTruthy();
  });

  it('password.available=false hides only the card', () => {
    configure({ whatsapp: true, password: false });
    shell(<LoginOptions />);
    expect(screen.getByText('WHATSAPP CARD')).toBeTruthy();
    expect(screen.queryByText('PASSWORD CARD')).toBeNull();
  });
});

describe('where else the card appears', () => {
  it('the sign-in modal carries the same card and the reworded lede', () => {
    configure({ whatsapp: true, password: true });
    shell(<LoginModal />);
    act(() => useUiStore.getState().open('loginOpen'));
    expect(screen.getByText('PASSWORD CARD')).toBeTruthy();
    expect(screen.getByText('Sign in to pick up where you left off.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('There’s no password');
  });

  it('the page heading no longer claims there is no password', () => {
    configure({ whatsapp: true, password: true });
    shell(<LoginPage />);
    expect(screen.getByText('Sign in and your orders, points and referrals are waiting.')).toBeTruthy();
  });

  it('inside Telegram the page shows the Telegram state and never the card', () => {
    configure({ whatsapp: true, password: true });
    useTelegramAuthStore.setState({ status: 'failed', error: 'bad hash' });
    shell(<LoginPage />);
    expect(screen.queryByText('PASSWORD CARD')).toBeNull();
    expect(screen.queryByText('WHATSAPP CARD')).toBeNull();
  });
});
