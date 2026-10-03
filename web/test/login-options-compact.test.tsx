import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { WhatsappLoginController } from '@/features/auth/useWhatsappLogin.ts';

const h = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  whatsapp: {} as Record<string, unknown>,
  start: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));
vi.mock('@/features/auth/PasswordLogin.tsx', async () => {
  const { createElement } = await import('react');
  return { PasswordLogin: () => createElement('p', null, 'PASSWORD FORM') };
});
vi.mock('@/features/auth/TelegramLogin.tsx', async () => {
  const { createElement } = await import('react');
  return { TelegramLogin: () => createElement('p', null, 'TELEGRAM BUTTON') };
});
vi.mock('@/features/auth/useWhatsappLogin.ts', () => ({
  useWhatsappLogin: (): WhatsappLoginController => ({
    state: 'idle', pending: false, start: h.start, cancel: h.cancel, ...h.whatsapp,
  }),
}));

import { LoginOptions } from '@/features/auth/LoginOptions.tsx';

function configure(o: { whatsapp?: boolean; telegram?: boolean; password?: boolean; telegramLogin?: Record<string, unknown> }) {
  h.settings = {
    brand: { name: 'Northbound Supply', shortName: 'Northbound', links: { whatsapp: null, telegram: null } }, supportLinks: [],
    login: {
      whatsapp: { available: o.whatsapp ?? false, number: '447700900123' },
      telegram: o.telegramLogin ?? { available: o.telegram ?? false, botUsername: o.telegram ? 'northbound_bot' : null },
      password: { available: o.password ?? false, resetByEmail: false, resetByWhatsapp: false },
    },
  };
}
const shell = () => render(
  <MantineProvider env="test"><QueryClientProvider client={new QueryClient()}><MemoryRouter><LoginOptions /></MemoryRouter></QueryClientProvider></MantineProvider>,
);

beforeEach(() => {
  h.whatsapp = {};
  h.start.mockClear();
  h.cancel.mockClear();
});
afterEach(cleanup);

describe('the compact sign-in surface', () => {
  it('opens on one labelled button per quick method, an "or", and the form — and no explanation paragraph', () => {
    configure({ whatsapp: true, telegram: true, password: true });
    shell();
    expect(screen.getByRole('button', { name: 'Continue with WhatsApp' })).toBeTruthy();
    expect(screen.getByText('TELEGRAM BUTTON')).toBeTruthy();
    expect(screen.getByText('or')).toBeTruthy();
    expect(screen.getByText('PASSWORD FORM')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Nothing to remember');
  });

  it('leaves out the "or" when the form is the only way in, and when there is no form', () => {
    configure({ password: true });
    shell();
    expect(screen.queryByText('or')).toBeNull();
    cleanup();
    configure({ whatsapp: true });
    shell();
    expect(screen.queryByText('or')).toBeNull();
  });

  it('OpenID Connect stands on its own: the Telegram button shows with no bot username and "available" off', () => {
    configure({ password: true, telegramLogin: { available: false, botUsername: null, oidc: true } });
    shell();
    expect(screen.getByText('TELEGRAM BUTTON')).toBeTruthy();
    expect(screen.getByText('or')).toBeTruthy();
    expect(screen.getByText('PASSWORD FORM')).toBeTruthy();
  });

  it('OpenID Connect alone is a way in, not the "sign-in isn’t available" screen', () => {
    configure({ telegramLogin: { available: false, botUsername: null, oidc: true } });
    shell();
    expect(screen.getByText('TELEGRAM BUTTON')).toBeTruthy();
    expect(screen.queryByText(/isn’t available/)).toBeNull();
  });

  it('without OpenID Connect and without a bot username there is no Telegram row', () => {
    configure({ password: true, telegramLogin: { available: true, botUsername: null, oidc: false } });
    shell();
    expect(screen.queryByText('TELEGRAM BUTTON')).toBeNull();
    expect(screen.queryByText('or')).toBeNull();
    cleanup();
    configure({ whatsapp: true, telegramLogin: { available: false, botUsername: null } });
    shell();
    expect(screen.queryByText('TELEGRAM BUTTON')).toBeNull();
  });

  it('tapping Continue with WhatsApp starts the attempt', () => {
    configure({ whatsapp: true, password: true });
    shell();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with WhatsApp' }));
    expect(h.start).toHaveBeenCalledTimes(1);
  });

  it('while a code is waiting, the other ways step aside and a way back is offered', () => {
    configure({ whatsapp: true, telegram: true, password: true });
    h.whatsapp = {
      state: 'started',
      data: { attemptId: 'a', attemptSecret: 's', code: 'LOGIN-XY3F9K', waLink: 'https://wa.me/447700900123?text=LOGIN-XY3F9K', expiresAt: '2099-01-01T00:00:00Z' },
      deadline: Date.now() + 60_000,
    };
    shell();
    expect(screen.getByText('PASSWORD FORM').closest('[hidden]')).not.toBeNull();
    expect(screen.getByText('TELEGRAM BUTTON').closest('[hidden]')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Open WhatsApp' })).toBeTruthy();
    expect(screen.getByText('LOGIN-XY3F9K')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Choose another way' }));
    expect(h.cancel).toHaveBeenCalledTimes(1);
  });

  it.each(['completed', 'done'])('keeps the other ways hidden while the sign-in is being finished (%s)', (state) => {
    configure({ whatsapp: true, telegram: true, password: true });
    h.whatsapp = { state };
    shell();
    expect(screen.getByText('PASSWORD FORM').closest('[hidden]')).not.toBeNull();
    expect(screen.getByText('TELEGRAM BUTTON').closest('[hidden]')).not.toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Message received');
  });

  it('shows the other ways again once the attempt has expired, with the explanation next to the button that fixes it', () => {
    configure({ whatsapp: true, password: true });
    h.whatsapp = { state: 'expired' };
    shell();
    expect(screen.getByText('PASSWORD FORM').closest('[hidden]')).toBeNull();
    expect(screen.getByText('That code expired')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start again' })).toBeTruthy();
  });
});
