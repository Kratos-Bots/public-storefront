import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { codeSettings } from './helpers/code-settings.ts';

const h = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));
vi.mock('@/features/auth/PasswordLogin.tsx', async () => {
  const { createElement } = await import('react');
  return { PasswordLogin: () => createElement('p', null, 'PASSWORD FORM') };
});
vi.mock('@/features/auth/WhatsappLogin.tsx', async () => {
  const { createElement } = await import('react');
  return { WhatsappLogin: () => createElement('p', null, 'WHATSAPP BUTTON') };
});
vi.mock('@/features/auth/CodeSignIn.tsx', async () => {
  const { createElement } = await import('react');
  return { CodeSignIn: () => createElement('p', null, 'CODE SIGN-IN') };
});

import { LoginOptions } from '@/features/auth/LoginOptions.tsx';

const shell = () => render(
  <MantineProvider env="test"><QueryClientProvider client={new QueryClient()}><MemoryRouter><LoginOptions /></MemoryRouter></QueryClientProvider></MantineProvider>,
);
afterEach(cleanup);

describe('older backend tolerance', () => {
  it('a backend with neither login.phone nor login.email keeps today’s sign-in', () => {
    h.settings = codeSettings({ phone: 'absent', email: 'absent', password: true });
    (h.settings.login as Record<string, unknown>).whatsapp = { available: true, number: '447700900123' };
    shell();
    expect(screen.getByText('WHATSAPP BUTTON')).toBeTruthy();
    expect(screen.getByText('PASSWORD FORM')).toBeTruthy();
    expect(screen.queryByText('CODE SIGN-IN')).toBeNull();
  });

  it('either block present switches to sign-in by code', () => {
    for (const o of [{ phone: 'verify', email: 'absent' }, { phone: 'absent', email: 'verify' }, { phone: 'off', email: 'off' }] as const) {
      h.settings = codeSettings(o);
      shell();
      expect(screen.getByText('CODE SIGN-IN')).toBeTruthy();
      cleanup();
    }
  });
});
