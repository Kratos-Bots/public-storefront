import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ServerCart } from '@/types/cart.ts';

const h = vi.hoisted(() => ({ settings: {} as Record<string, unknown>, login: vi.fn(), navigate: vi.fn() }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));
vi.mock('@/api/auth.ts', () => ({ passwordLogin: h.login, passwordSignup: vi.fn(), passwordForgot: vi.fn() }));
vi.mock('@/api/cart.ts', () => ({ fetchCart: vi.fn(), putCart: vi.fn(), clearCart: vi.fn() }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));
vi.mock('react-router', async (orig) => ({ ...(await orig<typeof import('react-router')>()), useNavigate: () => h.navigate }));
vi.mock('@/features/checkout/GuestTurnstile.tsx', () => ({ GuestTurnstile: () => null }));

import { fetchCart, putCart } from '@/api/cart.ts';
import { PasswordLogin } from '@/features/auth/PasswordLogin.tsx';
import { useCartStore } from '@/stores/cart.ts';
import { useSessionStore } from '@/stores/session.ts';
import { resetCartSync } from '@/features/cart/useServerCart.ts';

const cart = (productId: number, quantity: number): ServerCart => ({
  items: [{
    productId, name: 'BPC-157 5mg', quantity, unitPrice: 29, lineTotal: 29 * quantity, imageUrl: null, isPreorder: false,
    outOfStock: false, priceChanged: false, inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null,
  }],
  subtotal: 29 * quantity, itemCount: quantity,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.settings = {
    brand: { name: 'N', shortName: 'N', links: { whatsapp: null, telegram: null } }, supportLinks: [], turnstile: null,
    contactModes: { phoneMode: 'optional', emailMode: 'required', defaultPhoneCountry: 'GB' },
    login: { whatsapp: { available: false, number: null }, telegram: { available: false, botUsername: null }, password: { available: true, resetByEmail: false, resetByWhatsapp: false } },
  };
  resetCartSync();
  useSessionStore.setState({ token: null, customer: null, returnTo: null });
  useCartStore.setState({
    lines: [{ productId: 7, displayName: 'BPC-157 5mg', sku: 'BPC', unitPrice: 29, basePrice: 29, pricingTiers: [], quantity: 2, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null }],
    mode: 'local',
  });
  h.login.mockResolvedValue({ token: 'sess', customer: { id: 5, nickname: 'Ada' } });
  vi.mocked(fetchCart).mockResolvedValue(cart(7, 1));
  vi.mocked(putCart).mockResolvedValue(cart(7, 3));
});
afterEach(() => { cleanup(); resetCartSync(); });

function signIn() {
  render(
    <MantineProvider env="test"><QueryClientProvider client={new QueryClient()}><MemoryRouter>
      <PasswordLogin />
    </MemoryRouter></QueryClientProvider></MantineProvider>,
  );
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'ada@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw-pw-pw-pw' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('password sign-in uses the shared login-success path', () => {
  it('stores the session, merges the guest basket into the account cart and lands on the parked returnTo', async () => {
    useSessionStore.setState({ returnTo: '/verify-email?token=a-b_c' });
    signIn();
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/verify-email?token=a-b_c', { replace: true }));
    expect(useSessionStore.getState().token).toBe('sess');
    expect(putCart).toHaveBeenCalledWith([{ productId: 7, quantity: 3 }]); // 1 on the account + 2 in this browser
    expect(useSessionStore.getState().returnTo).toBeNull();
  });

  it('with nothing parked it lands on the account', async () => {
    signIn();
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/account', { replace: true }));
  });

  it('an off-site returnTo is ignored', async () => {
    useSessionStore.setState({ returnTo: 'https://evil.example' });
    signIn();
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/account', { replace: true }));
  });
});
