import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StorefrontSettings } from '@/types/settings.ts';

const state = vi.hoisted(() => ({
  settings: { brand: { links: { whatsapp: null, telegram: null } } } as unknown as StorefrontSettings,
}));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));

import { saveOrder } from '@/stores/saved-orders.ts';
import { useCartStore } from '@/stores/cart.ts';
import { persistForm, DEFAULT_FORM } from '@/features/checkout/form-state.ts';
import { PaymentSuccessPage } from '@/features/payment-redirect/PaymentSuccessPage.tsx';
import { PaymentCancelPage } from '@/features/payment-redirect/PaymentCancelPage.tsx';
import { OrderPlacedPage } from '@/features/payment-redirect/OrderPlacedPage.tsx';

function settings(links: { whatsapp: string | null; telegram: string | null }): StorefrontSettings {
  return { brand: { links } } as unknown as StorefrontSettings;
}

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  localStorage.clear();
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

function mountSuccess(entry: string) {
  return render(
    <Wrapper entry={entry}>
      <Routes>
        <Route path="/payment/success" element={<PaymentSuccessPage />} />
        <Route path="/order/:ref/:accessKey" element={<p>ORDER PAGE STUB</p>} />
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

  it('redirects to the saved order page when a saved order exists for the reference', () => {
    saveOrder('REF1', 'key1');
    mountSuccess('/payment/success?order=REF1');
    expect(screen.getByText('ORDER PAGE STUB')).toBeInTheDocument();
  });

  it('renders a "thanks, being confirmed" screen with the copyable reference when not saved', () => {
    mountSuccess('/payment/success?order=REF2');
    expect(screen.getByText(/thanks/i)).toBeInTheDocument();
    expect(screen.getByText(/being confirmed/i)).toBeInTheDocument();
    expect(screen.getByText('REF2')).toBeInTheDocument();
  });
});

describe('PaymentCancelPage', () => {
  it('shows "payment cancelled" and "no charge taken"', () => {
    mountCancel('/payment/cancel?order=REF3');
    expect(screen.getByText(/payment cancelled/i)).toBeInTheDocument();
    expect(screen.getByText(/no charge taken/i)).toBeInTheDocument();
    expect(screen.getByText('REF3')).toBeInTheDocument();
  });

  it('offers "Return to your order" when a saved order exists', () => {
    saveOrder('REF3', 'key3');
    mountCancel('/payment/cancel?order=REF3');
    const link = screen.getByRole('link', { name: /return to your order/i });
    expect(link).toHaveAttribute('href', '/order/REF3/key3');
    expect(screen.queryByRole('link', { name: /back to shop/i })).toBeNull();
  });

  it('offers "Back to shop" when there is no saved order', () => {
    mountCancel('/payment/cancel?order=REF4');
    const link = screen.getByRole('link', { name: /back to shop/i });
    expect(link).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: /return to your order/i })).toBeNull();
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

  it('falls back to plain contact copy when no chat links are configured', () => {
    mountOrderPlaced('/order-placed?order=REF7');
    expect(screen.queryByRole('link', { name: /whatsapp/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /telegram/i })).toBeNull();
    expect(screen.getByText(/quote your order reference/i)).toBeInTheDocument();
  });

  it('shows "order reference missing" when ?order is absent', () => {
    mountOrderPlaced('/order-placed');
    expect(screen.getByText(/order reference missing/i)).toBeInTheDocument();
  });
});
