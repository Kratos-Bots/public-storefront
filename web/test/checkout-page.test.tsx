import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { Quote } from '@/types/checkout.ts';
import type { LocalLine } from '@/stores/cart.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));

vi.mock('@/api/checkout.ts', () => ({
  quote: vi.fn(),
  guestQuote: vi.fn(),
  placeOrder: vi.fn(),
  placeGuestOrder: vi.fn(),
}));

const cart = vi.hoisted(() => ({ sync: vi.fn(async () => {}) }));
vi.mock('@/features/cart/useServerCart.ts', () => ({
  useServerCart: () => ({
    mode: 'server',
    isSyncing: false,
    issues: [],
    add: vi.fn(),
    setQuantity: vi.fn(),
    remove: vi.fn(),
    sync: cart.sync,
    refresh: vi.fn(async () => {}),
  }),
}));

const notify = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: notify.show } }));

/**
 * Invisible Turnstile, stubbed: `execute()` mints the next token synchronously
 * through `onSuccess`, exactly like the real widget's callback. Tokens are
 * numbered so a test can assert no two requests ever carried the same one.
 *
 * It announces itself through `onWidgetLoad` on mount, as the real widget does
 * once Cloudflare's script has rendered it — `execute()` is a no-op before that,
 * which is what `GuestTurnstile` queues around.
 */
const turnstile = vi.hoisted(() => ({ minted: [] as string[] }));
vi.mock('@marsidev/react-turnstile', async () => {
  const React = await import('react');
  return {
    Turnstile: React.forwardRef(function TurnstileStub(
      props: { onSuccess?: (token: string) => void; onWidgetLoad?: (id: string) => void },
      ref: React.Ref<unknown>,
    ) {
      const loaded = React.useRef(false);
      React.useImperativeHandle(ref, () => ({
        execute: () => {
          if (!loaded.current) return; // matches the real widget before it renders
          const token = `tok-${turnstile.minted.length + 1}`;
          turnstile.minted.push(token);
          props.onSuccess?.(token);
        },
        reset: () => {},
        remove: () => {},
        render: () => {},
        getResponse: () => undefined,
      }));
      React.useEffect(() => {
        loaded.current = true;
        props.onWidgetLoad?.('stub-widget');
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return React.createElement('div', { 'data-testid': 'turnstile' });
    }),
  };
});

import { guestQuote, placeGuestOrder, placeOrder, quote } from '@/api/checkout.ts';
import { ApiError } from '@/lib/errors.ts';
import { useCartStore } from '@/stores/cart.ts';
import { useSessionStore } from '@/stores/session.ts';
import { CheckoutPage } from '@/features/checkout/CheckoutPage.tsx';

const quoteMock = vi.mocked(quote);
const guestQuoteMock = vi.mocked(guestQuote);
const placeOrderMock = vi.mocked(placeOrder);
const placeGuestOrderMock = vi.mocked(placeGuestOrder);

function settings(guestCheckout: boolean): StorefrontSettings {
  return {
    currency: 'GBP',
    contactModes: { emailMode: 'required', phoneMode: 'optional', defaultPhoneCountry: 'GB' },
    features: {
      layout: 'storefront',
      ordering: true,
      guestCheckout,
      accounts: true,
      verify: false,
      tracking: false,
      wholesale: false,
      upsell: false,
    },
    turnstile: guestCheckout ? { siteKey: '1x00000000000000000000AA' } : null,
    brand: { links: { whatsapp: null, telegram: null } },
  } as unknown as StorefrontSettings;
}

/** A complete checkout form as `form-state.ts` persists it, for restore cases. */
function persistedForm(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    firstName: 'Ada',
    surname: 'Lovelace',
    email: 'ada@example.com',
    phone: '',
    phonePrefix: 'GB',
    phonePrefixTouched: false,
    addressLine1: '1 Main St',
    addressLine2: '',
    city: 'London',
    county: '',
    zip: 'SW1A 1AA',
    country: 'GB',
    shippingOptionId: null,
    couponCode: '',
    useStoreCredit: false,
    paymentMethod: '',
    coin: '',
    network: '',
    notes: '',
    ...overrides,
  });
}

function line(productId = 12, quantity = 2): LocalLine {
  return {
    productId,
    displayName: 'Widget Blue',
    sku: 'WID-BLU',
    unitPrice: 40,
    basePrice: 40,
    pricingTiers: [],
    quantity,
    isPreorder: false,
    excludedFromFreeShipping: false,
    imageProductId: null,
  };
}

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    items: [
      {
        productId: 12,
        name: 'Widget Blue',
        sku: 'WID-BLU',
        quantity: 2,
        unitPrice: 40,
        lineTotal: 80,
        tierApplied: false,
        isPreorder: false,
      },
    ],
    subtotal: 80,
    coupon: null,
    shippingOptions: [
      { id: 3, name: 'Royal Mail Tracked 24', courier: 'Royal Mail', price: 4.99, freeShipping: false },
    ],
    selectedShippingOptionId: null,
    shippingAmount: 0,
    storeCredit: { balance: 0, applied: 0, remaining: 0 },
    grandTotal: 80,
    amountDue: 80,
    paymentMethods: [
      {
        slot: 'card',
        method: 'stripe',
        displayName: 'Stripe',
        type: 'gateway',
        details: null,
        feeType: 'percentage',
        feeValue: 2,
        feeRateText: '+2%',
        feeLabel: 'Stripe fee',
        fee: 1.6,
        chargeTotal: 81.6,
      },
    ],
    contactModes: { emailMode: 'required', phoneMode: 'optional', defaultPhoneCountry: 'GB' },
    ...overrides,
  };
}

let client: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MantineProvider env="test">
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/checkout']}>{children}</MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>
  );
}

function mount() {
  return render(
    <Wrapper>
      <CheckoutPage />
    </Wrapper>,
  );
}

/** Run the quote debounce (300 ms in the hook, 350 ms in the guest driver) out. */
async function settle(ms = 600) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function type(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

const continueButton = () => screen.getByRole('button', { name: /^continue$/i });
const placeButton = () => screen.getByRole('button', { name: /place order/i });

/** Contact → Address → Shipping → Payment → Review, leaving the Review step on screen. */
async function walkToReview() {
  type('First name', 'Ada');
  type('Surname', 'Lovelace');
  type('Email', 'ada@example.com');
  fireEvent.click(continueButton());

  type('Address line 1', '1 Main St');
  type('City', 'London');
  type(/postcode/i, 'SW1A 1AA');
  fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'GB' } });
  fireEvent.click(continueButton());
  await settle();

  fireEvent.click(screen.getByRole('radio', { name: /Royal Mail Tracked 24/ }));
  await settle();
  fireEvent.click(continueButton());
  await settle();

  fireEvent.click(screen.getByRole('radio', { name: /Stripe/ }));
  fireEvent.click(continueButton());
  await settle();

  type('Order notes', 'Leave with neighbour');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  turnstile.minted = [];
  localStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useCartStore.setState({ lines: [line()], mode: 'server' });
  useSessionStore.setState({ token: null, customer: null, returnTo: null });
  quoteMock.mockResolvedValue(makeQuote());
  guestQuoteMock.mockResolvedValue(makeQuote());
  placeOrderMock.mockResolvedValue({
    reference: 'K7M2QP',
    publicUrl: null,
    status: 'pending',
    total: 84.99,
    payment: { type: 'none' },
  });
  placeGuestOrderMock.mockResolvedValue({
    reference: 'G8N3RQ',
    publicUrl: null,
    status: 'pending',
    total: 84.99,
    payment: { type: 'none' },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('CheckoutPage — signed in', () => {
  beforeEach(() => {
    state.settings = settings(false);
    useSessionStore.setState({ token: 'sess-1', customer: { id: 5, nickname: 'ada' } });
  });

  it('walks Contact → Review and places the order with the collected details', async () => {
    mount();
    await walkToReview();

    expect(screen.getByRole('heading', { name: 'Review your order' })).toBeInTheDocument();
    fireEvent.click(placeButton());
    await settle();

    expect(cart.sync).toHaveBeenCalled();
    expect(placeOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shippingAddress: {
          firstName: 'Ada',
          surname: 'Lovelace',
          addressLine1: '1 Main St',
          addressLine2: null,
          addressLine3: null,
          city: 'London',
          county: null,
          zip: 'SW1A 1AA',
          country: 'GB',
        },
        email: 'ada@example.com',
        shippingOptionId: 3,
        paymentMethod: 'stripe',
        useStoreCredit: false,
        notes: 'Leave with neighbour',
      }),
    );
    expect(useCartStore.getState().lines).toEqual([]);
    expect(localStorage.getItem('sf-checkout-v1')).toBeNull();
  });

  it('holds the shopper on the contact step until the required fields are filled', () => {
    mount();
    fireEvent.click(continueButton());
    expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('First name')).toBeInTheDocument();
  });

  // Regression: the form outlives any one quote (it is restored from
  // localStorage, and it survives a country change), so it can name a shipping
  // option the current quote no longer offers. The schema only says "a positive
  // integer"; membership is the quote's business.
  it('blocks a restored shipping option the current quote no longer offers', async () => {
    localStorage.setItem('sf-checkout-v1', persistedForm({ shippingOptionId: 99 }));
    mount();

    fireEvent.click(continueButton()); // contact -> address
    fireEvent.click(continueButton()); // address -> shipping
    await settle();

    fireEvent.click(continueButton());

    expect(screen.getByText(/delivery option is no longer available/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delivery and discounts' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('sf-checkout-v1')!).shippingOptionId).toBeNull();
    expect(placeOrderMock).not.toHaveBeenCalled();
  });

  // The same check has to run again at submit time: the quote can change while
  // the shopper is still reading the review.
  it('blocks the submit and returns to Payment when the method drops out of the quote', async () => {
    const credit = { balance: 5, applied: 0, remaining: 5 };
    quoteMock.mockResolvedValue(makeQuote({ storeCredit: credit }));
    localStorage.setItem('sf-checkout-v1', persistedForm());
    mount();

    fireEvent.click(continueButton()); // contact -> address
    fireEvent.click(continueButton()); // address -> shipping
    await settle();
    fireEvent.click(screen.getByRole('radio', { name: /Royal Mail Tracked 24/ }));
    await settle();
    fireEvent.click(continueButton()); // shipping -> payment
    await settle();
    fireEvent.click(screen.getByRole('radio', { name: /Stripe/ }));

    // Toggling store credit queues a re-quote; step off to Review before the
    // debounce fires, so the new quote lands with the shopper already there.
    const paypal = { ...makeQuote().paymentMethods[0]!, method: 'paypal', displayName: 'PayPal' };
    quoteMock.mockResolvedValue(makeQuote({ storeCredit: credit, paymentMethods: [paypal] }));
    fireEvent.click(screen.getByLabelText('Use store credit'));
    fireEvent.click(continueButton()); // payment -> review, still on the old quote
    await settle();
    await settle(0); // the re-quote lands with the shopper already on Review

    // The button stops advertising a figure the moment the selection goes stale.
    expect(placeButton()).toHaveTextContent(/^Place order$/);

    fireEvent.click(placeButton());
    await settle();

    expect(placeOrderMock).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'How you’ll pay' })).toBeInTheDocument();
    expect(screen.getByText(/payment method is no longer available/i)).toBeInTheDocument();
  });

  it('re-enables the submit button three seconds after a 409', async () => {
    placeOrderMock.mockRejectedValueOnce(new ApiError(409, 'Checkout already in progress'));
    mount();
    await walkToReview();

    fireEvent.click(placeButton());
    await settle(0);

    expect(placeButton()).toBeDisabled();
    expect(notify.show).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Checkout already in progress' }),
    );

    await settle(3000);
    expect(placeButton()).toBeEnabled();
  });
});

describe('CheckoutPage — guest', () => {
  beforeEach(() => {
    state.settings = settings(true);
    useCartStore.setState({ lines: [line()], mode: 'local' });
  });

  // Guest checkout is two switches: the feature flag and a Turnstile site key.
  // With the flag on and no key the widget can never mount, so the form would
  // sit on a token that never comes — and the backend 503s those routes anyway.
  it('offers sign-in instead of the form when guest checkout has no site key', () => {
    state.settings = { ...settings(true), turnstile: null };
    mount();

    expect(screen.getByText(/guest checkout isn't available right now/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Fcheckout',
    );
    expect(screen.queryByLabelText('First name')).toBeNull();
    expect(screen.queryByTestId('turnstile')).toBeNull();
  });

  it('quotes and places the order with a fresh Turnstile token each time', async () => {
    mount();
    expect(screen.getByTestId('turnstile')).toBeInTheDocument();

    await walkToReview();

    // Country, then shipping option: two quotes, and neither may reuse a token.
    expect(guestQuoteMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    const quoteTokens = guestQuoteMock.mock.calls.map((c) => c[0].turnstileToken);
    expect(new Set(quoteTokens).size).toBe(quoteTokens.length);

    fireEvent.click(placeButton());
    await settle();

    expect(placeGuestOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        turnstileToken: expect.stringMatching(/^tok-\d+$/) as unknown as string,
        items: [{ productId: 12, quantity: 2 }],
        email: 'ada@example.com',
        shippingOptionId: 3,
        paymentMethod: 'stripe',
      }),
    );
    const submitToken = placeGuestOrderMock.mock.calls[0]![0].turnstileToken;
    expect(quoteTokens).not.toContain(submitToken);
  });
});
