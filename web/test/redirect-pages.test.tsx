import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StorefrontSettings } from '@/types/settings.ts';

const state = vi.hoisted(() => ({
  settings: { brand: { links: { whatsapp: null, telegram: null } }, features: { accounts: true } } as unknown as StorefrontSettings,
}));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));

import { useSessionStore } from '@/stores/session.ts';
import { useCartStore } from '@/stores/cart.ts';
import { persistForm, DEFAULT_FORM } from '@/features/checkout/form-state.ts';
import { PaymentSuccessPage } from '@/features/payment-redirect/PaymentSuccessPage.tsx';
import { PaymentCancelPage } from '@/features/payment-redirect/PaymentCancelPage.tsx';
import { OrderPlacedPage } from '@/features/payment-redirect/OrderPlacedPage.tsx';

function settings(links: { whatsapp: string | null; telegram: string | null }, accounts = true): StorefrontSettings {
  return { brand: { links }, features: { accounts } } as unknown as StorefrontSettings;
}

const signIn = () => useSessionStore.setState({ token: 't', customer: { id: 1, nickname: null } });
const signOut = () => useSessionStore.setState({ token: null, customer: null });
const features = ({ accounts }: { accounts: boolean }) => { state.settings = settings({ whatsapp: null, telegram: null }, accounts); };

const SIGN_IN = '/login?returnTo=%2Faccount%2Forders%2FREF3';
const signInLink = () => screen.queryByRole('link', { name: 'Sign in to view your order' });

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  localStorage.clear();
  signOut();
  state.settings = settings({ whatsapp: null, telegram: null });
});

afterEach(() => {
  cleanup();
});

function Wrapper({ children, entry }: { children: ReactNode; entry: string }) {
  return (
    <QueryClientProvider client={client}>
      <MantineProvider env="test">
        <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>
  );
}

function OrderStub() {
  return <p>order page {useParams().ref}</p>;
}

function mountSuccess(entry: string) {
  return render(
    <Wrapper entry={entry}>
      <Routes>
        <Route path="/payment/success" element={<PaymentSuccessPage />} />
        <Route path="/account/orders/:ref" element={<OrderStub />} />
      </Routes>
    </Wrapper>,
  );
}

function mountCancel(entry: string) {
  return render(
    <Wrapper entry={entry}>
      <PaymentCancelPage />
    </Wrapper>,
  );
}

function mountOrderPlaced(entry: string) {
  return render(
    <Wrapper entry={entry}>
      <OrderPlacedPage />
    </Wrapper>,
  );
}

describe('PaymentSuccessPage', () => {
  it('shows "order reference missing" when ?order is absent', () => {
    mountSuccess('/payment/success');
    expect(screen.getByText(/order reference missing/i)).toBeInTheDocument();
  });

  it('clears the cart and persisted checkout form on mount', () => {
    useCartStore.setState({
      lines: [{ productId: 1, displayName: 'Widget', sku: 'W1', unitPrice: 5, basePrice: 5, pricingTiers: [], quantity: 1, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null }],
      mode: 'local',
    });
    persistForm({ ...DEFAULT_FORM, firstName: 'Ada' });
    expect(localStorage.getItem('sf-checkout-v1')).not.toBeNull();

    mountSuccess('/payment/success?order=REF1');

    expect(useCartStore.getState().lines).toEqual([]);
    expect(localStorage.getItem('sf-checkout-v1')).toBeNull();
  });

  it('redirects a signed-in customer to their order page', () => {
    signIn();
    mountSuccess('/payment/success?order=REF1');
    expect(screen.getByText('order page REF1')).toBeInTheDocument();
  });

  it('redirects on the first render when the session was already in storage, so the sign-in link is never drawn', () => {
    signOut();
    localStorage.setItem('sf-session-v1', JSON.stringify({ state: { token: 't', customer: { id: 1, nickname: null } }, version: 0 }));
    void useSessionStore.persist.rehydrate();
    const seen: boolean[] = [];
    const observer = new MutationObserver(() => seen.push(screen.queryByRole('link', { name: 'Sign in to view your order' }) !== null));
    observer.observe(document.body, { childList: true, subtree: true });
    mountSuccess('/payment/success?order=REF1');
    observer.disconnect();
    expect(screen.getByText('order page REF1')).toBeInTheDocument();
    expect(seen.some(Boolean)).toBe(false);
  });

  it('renders a "thanks, being confirmed" screen with the copyable reference when signed out', () => {
    mountSuccess('/payment/success?order=REF2');
    expect(screen.getByText(/thanks/i)).toBeInTheDocument();
    expect(screen.getByText(/being confirmed/i)).toBeInTheDocument();
    expect(screen.getByText('REF2')).toBeInTheDocument();
  });

  it('prefills the chat link with a neutral check-in, not a request to pay', () => {
    state.settings = settings({ whatsapp: 'https://wa.me/447700900000', telegram: null });
    mountSuccess('/payment/success?order=REF2');

    const wa = screen.getByRole('link', { name: /whatsapp/i });
    const href = wa.getAttribute('href') ?? '';
    expect(href).toContain('REF2');
    expect(href).toContain('checking+in');
    expect(href).not.toContain('like+to+pay');
  });
});

describe('PaymentSuccessPage sign-in prompt', () => {
  it('signed out, accounts on: thanks, plus the way to the order', () => {
    features({ accounts: true });
    mountSuccess('/payment/success?order=REF3');
    expect(signInLink()?.getAttribute('href')).toBe(SIGN_IN);
  });

  it('signed out, accounts off: no sign-in link', () => {
    features({ accounts: false });
    mountSuccess('/payment/success?order=REF3');
    expect(signInLink()).toBeNull();
  });
});

describe('PaymentCancelPage', () => {
  it('shows "payment cancelled" and "no charge taken"', () => {
    mountCancel('/payment/cancel?order=REF3');
    expect(screen.getByText(/payment cancelled/i)).toBeInTheDocument();
    expect(screen.getByText(/no charge taken/i)).toBeInTheDocument();
    expect(screen.getByText('REF3')).toBeInTheDocument();
  });

  it('signed in: "Return to your order" goes to the account order page', () => {
    signIn();
    mountCancel('/payment/cancel?order=REF3');
    expect(screen.getByRole('link', { name: 'Return to your order' })).toHaveAttribute('href', '/account/orders/REF3');
    expect(screen.queryByRole('link', { name: /back to shop/i })).toBeNull();
  });

  it('signed out, accounts on: the sign-in link; accounts off: Back to shop', () => {
    features({ accounts: true });
    const a = mountCancel('/payment/cancel?order=REF3');
    expect(signInLink()?.getAttribute('href')).toBe(SIGN_IN);
    expect(screen.queryByRole('link', { name: /back to shop/i })).toBeNull();
    a.unmount();
    features({ accounts: false });
    mountCancel('/payment/cancel?order=REF3');
    expect(screen.getByRole('link', { name: 'Back to shop' })).toHaveAttribute('href', '/');
    expect(signInLink()).toBeNull();
  });
});

describe('OrderPlacedPage', () => {
  it('clears the cart and persisted checkout form on mount', () => {
    useCartStore.setState({
      lines: [{ productId: 1, displayName: 'Widget', sku: 'W1', unitPrice: 5, basePrice: 5, pricingTiers: [], quantity: 1, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null }],
      mode: 'local',
    });
    persistForm({ ...DEFAULT_FORM, firstName: 'Ada' });

    mountOrderPlaced('/order-placed?order=REF5');

    expect(useCartStore.getState().lines).toEqual([]);
    expect(localStorage.getItem('sf-checkout-v1')).toBeNull();
  });

  it('shows "order placed" with the copyable reference', () => {
    mountOrderPlaced('/order-placed?order=REF5');
    expect(screen.getByText(/order placed/i)).toBeInTheDocument();
    expect(screen.getByText('REF5')).toBeInTheDocument();
  });

  it('shows the payment-setup warning when warning=1', () => {
    mountOrderPlaced('/order-placed?order=REF5&warning=1');
    expect(screen.getByText(/couldn.t set up online payment/i)).toBeInTheDocument();
  });

  it('does not show the warning when warning is absent', () => {
    mountOrderPlaced('/order-placed?order=REF5');
    expect(screen.queryByText(/couldn.t set up online payment/i)).toBeNull();
  });

  it('renders WhatsApp/Telegram buttons prefilled with the order chat message', () => {
    state.settings = settings({ whatsapp: 'https://wa.me/447700900000', telegram: 'https://t.me/shopbot' });
    mountOrderPlaced('/order-placed?order=REF6');

    const wa = screen.getByRole('link', { name: /whatsapp/i });
    expect(wa).toHaveAttribute('href', expect.stringContaining('wa.me/447700900000'));
    expect(wa.getAttribute('href')).toContain('REF6');

    const tg = screen.getByRole('link', { name: /telegram/i });
    expect(tg).toHaveAttribute('href', expect.stringContaining('t.me/shopbot'));
    expect(tg.getAttribute('href')).toContain('REF6');
  });

  it('falls back to plain contact copy when no chat links are configured, and does not name WhatsApp/Telegram', () => {
    mountOrderPlaced('/order-placed?order=REF7');
    expect(screen.queryByRole('link', { name: /whatsapp/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /telegram/i })).toBeNull();
    expect(screen.getByText(/quote your order reference/i)).toBeInTheDocument();
    expect(screen.queryByText(/message us on whatsapp or telegram/i)).toBeNull();
  });

  it('signed out, accounts on: the sign-in link sits with the chat buttons', () => {
    state.settings = settings({ whatsapp: 'https://wa.me/447700900000', telegram: null });
    mountOrderPlaced('/order-placed?order=REF3');
    expect(signInLink()?.getAttribute('href')).toBe(SIGN_IN);
    expect(screen.getByRole('link', { name: /whatsapp/i })).toBeInTheDocument();
  });

  it('signed out, accounts on, no chat links: the sign-in link above the fallback', () => {
    mountOrderPlaced('/order-placed?order=REF3');
    expect(signInLink()?.getAttribute('href')).toBe(SIGN_IN);
    expect(screen.getByText(/quote your order reference/i)).toBeInTheDocument();
  });

  it('signed in: no sign-in link', () => {
    signIn();
    mountOrderPlaced('/order-placed?order=REF3');
    expect(signInLink()).toBeNull();
  });

  it('shows "order reference missing" when ?order is absent', () => {
    mountOrderPlaced('/order-placed');
    expect(screen.getByText(/order reference missing/i)).toBeInTheDocument();
  });
});
