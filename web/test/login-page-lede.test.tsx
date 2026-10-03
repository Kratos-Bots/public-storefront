import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

const h = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));
vi.mock('@/features/auth/useLoginSuccess.ts', async (orig) => ({ ...(await orig<object>()), useLoginSuccess: () => vi.fn() }));
vi.mock('@/features/checkout/GuestTurnstile.tsx', async () => {
  const { createElement, forwardRef } = await import('react');
  return { GuestTurnstile: forwardRef(() => createElement('span')) };
});

import '@/builder/render.tsx';
import { LoginPage } from '@/features/auth/LoginPage.tsx';

const LEDE = 'Choose how you’d like to sign in.';

beforeEach(() => {
  h.settings = {
    brand: { name: 'Northbound Supply', shortName: 'Northbound', links: { whatsapp: null, telegram: null } },
    supportLinks: [],
    contactModes: { phoneMode: 'optional', emailMode: 'required', defaultPhoneCountry: 'GB' },
    turnstile: null,
    login: {
      whatsapp: { available: false, number: null },
      telegram: { available: false, botUsername: null },
      password: { available: true, resetByEmail: true, resetByWhatsapp: false },
    },
  };
});
afterEach(cleanup);

const page = () => render(
  <MantineProvider env="test"><QueryClientProvider client={new QueryClient()}><MemoryRouter><LoginPage /></MemoryRouter></QueryClientProvider></MantineProvider>,
);

describe('the sign-in page line', () => {
  it('shows on the opening choice and goes away on the sub-steps, which own their titles', () => {
    page();
    expect(screen.getByText(LEDE)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }));
    expect(screen.queryByText(LEDE)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByText(LEDE)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(screen.queryByText(LEDE)).toBeNull();
  });
});
