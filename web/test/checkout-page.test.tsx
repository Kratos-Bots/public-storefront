import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { Quote } from '@/types/checkout.ts';
import type { LocalLine } from '@/stores/cart.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));

const tg = vi.hoisted(() => ({ inTelegram: false, openLink: vi.fn() }));
vi.mock('@/lib/telegram-webapp.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/telegram-webapp.ts')>()),
  isTelegramWebApp: () => tg.inTelegram,
  openExternalLink: (url: string) => tg.openLink(url),
}));

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
import { usePrimaryActionStore } from '@/stores/primary-action.ts';
import { useSessionStore } from '@/stores/session.ts';
import { CheckoutPage } from '@/features/checkout/CheckoutPage.tsx';
import { DEFAULT_FORM } from '@/features/checkout/form-state.ts';

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

function LocationProbe() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MantineProvider env="test">
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/checkout']}>
          {children}
          <LocationProbe />
        </MemoryRouter>
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

/** Inside Telegram the in-page buttons stand down; the MainButton is the store's override. */
function pressPrimary(label: RegExp, fallback: () => HTMLElement) {
  if (!tg.inTelegram) {
    fireEvent.click(fallback());
    return;
  }
  const action = usePrimaryActionStore.getState().override;
  expect(action?.label).toMatch(label);
  act(() => action!.onClick());
}
const pressContinue = () => pressPrimary(/^continue$/i, continueButton);
const pressPlace = () => pressPrimary(/^place order/i, placeButton);

/** Contact → Address → Shipping → Payment → Review, leaving the Review step on screen. */
async function walkToReview() {
  type('First name', 'Ada');
  type('Surname', 'Lovelace');
  type('Email', 'ada@example.com');
  pressContinue();

  type('Address line 1', '1 Main St');
  type('Town / City', 'London');
  type(/postcode/i, 'SW1A 1AA');
  fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'GB' } });
  await walkToReviewFrom('address');
}

/** From a step that is already filled in: Continue through it, then Shipping → Payment → Review. */
async function walkToReviewFrom(step: 'contact' | 'address') {
  if (step === 'contact') pressContinue();
  pressContinue();
  await settle();

  fireEvent.click(screen.getByRole('radio', { name: /Royal Mail Tracked 24/ }));
  await settle();
  pressContinue();
  await settle();

  fireEvent.click(screen.getByRole('radio', { name: /Stripe/ }));
  pressContinue();
  await settle();

  type('Order notes', 'Leave with neighbour');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  turnstile.minted = [];
  tg.inTelegram = false;
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

  describe('shippable countries', () => {
    const noDefault = { emailMode: 'required', phoneMode: 'optional', defaultPhoneCountry: null } as const;
    const country = () => screen.getByLabelText('Country') as HTMLSelectElement;
    /** Mounts and moves from Contact to Address. */
    async function toAddress() {
      mount();
      await settle();
      type('First name', 'Ada');
      type('Surname', 'Lovelace');
      type('Email', 'ada@example.com');
      pressContinue();
    }

    it('drops a remembered country the shop no longer delivers to', async () => {
      localStorage.setItem('sf-checkout-v1', JSON.stringify({ ...DEFAULT_FORM, country: 'NO' }));
      state.settings = { ...settings(false), contactModes: noDefault, shipping: { countries: ['GB', 'IE'] } };
      await toAddress();
      expect(country().value).toBe('');
      expect(Array.from(country().options).map((o) => o.value).filter(Boolean).sort()).toEqual(['GB', 'IE']);
    });

    it('a single-country shop has the country chosen', async () => {
      state.settings = { ...settings(false), contactModes: noDefault, shipping: { countries: ['IE'] } };
      await toAddress();
      expect(country().value).toBe('IE');
    });

    it('a list that shrinks under an open checkout clears the country', async () => {
      state.settings = { ...settings(false), shipping: { countries: ['GB', 'IE'] } };
      const view = mount();
      await settle();
      type('First name', 'Ada');
      type('Surname', 'Lovelace');
      type('Email', 'ada@example.com');
      pressContinue();
      fireEvent.change(country(), { target: { value: 'GB' } });
      expect(country().value).toBe('GB');
      state.settings = { ...state.settings, shipping: { countries: ['IE', 'FR'] } };
      view.rerender(<Wrapper><CheckoutPage /></Wrapper>);
      await settle();
      expect(country().value).toBe('');
    });

    it('with no list from the backend every country is offered', async () => {
      await toAddress();
      expect(country().options.length).toBeGreaterThan(100);
    });
  });

  describe('collection points', () => {
    const POINT = {
      id: '12345', carrier: 'inpost', name: 'Tesco Express', street: 'Kirkgate', houseNumber: '14', postalCode: 'LS1 6BY',
      city: 'Leeds', country: 'GB', latitude: null, longitude: null, distance: 300,
    };
    const seedCollection = () => localStorage.setItem('sf-checkout-v1', JSON.stringify({
      ...DEFAULT_FORM, firstName: 'Ada', surname: 'Lovelace', email: 'ada@example.com', country: 'GB',
      deliveryMethod: 'collection', servicePoint: POINT,
    }));
    const withCollection = () => {
      state.settings = { ...settings(false), shipping: { countries: ['GB'], collectionCountries: ['GB'] } };
    };

    it('a collection order sends the point, the point’s address and the shopper’s name', async () => {
      withCollection();
      seedCollection();
      mount();
      await settle();
      type(/^phone$/i, '07801 123456');
      await walkToReviewFrom('contact');
      pressPlace();
      await settle();
      expect(placeOrderMock).toHaveBeenCalledTimes(1);
      expect(placeOrderMock.mock.calls[0]![0].shippingAddress).toEqual({
        firstName: 'Ada', surname: 'Lovelace', addressLine1: 'Kirkgate 14', addressLine2: null, addressLine3: null,
        city: 'Leeds', county: null, zip: 'LS1 6BY', country: 'GB',
        servicePointId: '12345', servicePointCarrier: 'inpost', servicePointName: 'Tesco Express',
      });
      expect(quoteMock.mock.calls.at(-1)![0]).toMatchObject({ deliveryMethod: 'collection', servicePointCarrier: 'inpost' });
    });

    it('collection without a chosen point cannot leave the address step', async () => {
      withCollection();
      localStorage.setItem('sf-checkout-v1', JSON.stringify({ ...DEFAULT_FORM, firstName: 'Ada', surname: 'Lovelace', email: 'ada@example.com', phone: '07801 123456', country: 'GB', deliveryMethod: 'collection' }));
      mount();
      await settle();
      pressContinue(); // Contact → Address
      pressContinue(); // refused
      expect(screen.getByText('Choose a collection point')).toBeTruthy();
    });

    it('collection makes the phone required even when the shop has it optional', async () => {
      withCollection();
      seedCollection();
      mount();
      await settle();
      pressContinue(); // Contact, with no phone
      expect(screen.getByText('Required')).toBeTruthy();
    });

    it('a home order is unchanged: no point fields and no delivery fields on the quote', async () => {
      withCollection();
      mount();
      await settle();
      await walkToReview();
      pressPlace();
      await settle();
      const address = placeOrderMock.mock.calls[0]![0].shippingAddress;
      expect(Object.keys(address)).not.toEqual(expect.arrayContaining(['servicePointId']));
      expect(Object.keys(quoteMock.mock.calls.at(-1)![0])).not.toEqual(expect.arrayContaining(['deliveryMethod', 'servicePointCarrier']));
    });
  });

  describe('external payment inside Telegram', () => {
    const external = (reference: string, publicUrl: string | null) => ({
      reference,
      publicUrl,
      status: 'pending',
      total: 84.99,
      payment: { type: 'checkout_url' as const, paymentId: 1, method: 'stripe', amount: 84.99, url: 'https://pay.example/session/1' },
    });

    it('opens the gateway in the browser and lands a signed-in shopper on the account order', async () => {
      tg.inTelegram = true;
      placeOrderMock.mockResolvedValue(external('K7 M2', null));
      mount();
      await walkToReview();
      pressPlace();
      await settle();

      expect(tg.openLink).toHaveBeenCalledWith('https://pay.example/session/1');
      expect(screen.getByTestId('path')).toHaveTextContent('/account/orders/K7%20M2');
    });
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

// The delivery options belong to a (country, method, point carrier). While the quote for
// the form's current one has not arrived, the previous quote's list must not be offered
// or accepted, and nothing else on screen blanks.
describe('CheckoutPage — delivery options pending', () => {
  const IRISH = { id: 7, name: 'An Post Tracked', courier: 'An Post', price: 6, freeShipping: false };
  const STILL_PRICING = /still pricing your order/i;
  const radios = () => screen.queryAllByRole('radio', { name: /Royal Mail Tracked 24|An Post Tracked/ });

  beforeEach(() => {
    state.settings = settings(false);
    useSessionStore.setState({ token: 'sess-1', customer: { id: 5, nickname: 'ada' } });
    quoteMock.mockImplementation(async (input) =>
      makeQuote(input.country === 'IE' ? { shippingOptions: [IRISH] } : {}),
    );
  });

  /** On the Delivery step for GB, its options on screen. */
  async function toDelivery() {
    localStorage.setItem('sf-checkout-v1', persistedForm());
    const view = mount();
    pressContinue(); // contact -> address
    pressContinue(); // address -> shipping
    await settle();
    expect(radios()).toHaveLength(1);
    return view;
  }

  /** Back to Address, a new country, forward to Delivery — all before any timer runs. */
  function changeCountryToIreland() {
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'IE' } });
    pressContinue();
  }

  it('offers no option and refuses Continue until the new country has been priced', async () => {
    await toDelivery();
    changeCountryToIreland();

    expect(screen.getByRole('heading', { name: 'Delivery and discounts' })).toBeInTheDocument();
    expect(radios()).toHaveLength(0);
    expect(screen.getByText(/pricing/i)).toBeInTheDocument();
    pressContinue();
    expect(screen.getByText(STILL_PRICING)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delivery and discounts' })).toBeInTheDocument();

    await settle(); // the debounce fires and the request goes out
    await settle(); // and the answer lands
    expect(radios().map((r) => r.closest('label')?.textContent)).toEqual([expect.stringContaining('An Post Tracked')]);
    fireEvent.click(radios()[0]!);
    await settle();
    pressContinue();
    expect(screen.getByRole('heading', { name: 'How you’ll pay' })).toBeInTheDocument();
  });

  it('keeps the options on screen while only the coupon or the chosen option re-quotes', async () => {
    await toDelivery();
    quoteMock.mockImplementation(() => new Promise<Quote>(() => undefined)); // every re-quote hangs

    fireEvent.click(radios()[0]!); // the chosen option itself
    type('Coupon code', 'save10');
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(radios()).toHaveLength(1);
    await settle();
    expect(quoteMock.mock.calls.at(-1)![0]).toMatchObject({ couponCode: 'SAVE10', shippingOptionId: 3 });
    expect(radios()).toHaveLength(1);
    pressContinue();
    expect(screen.queryByText(STILL_PRICING)).toBeNull();
    expect(screen.getByRole('heading', { name: 'How you’ll pay' })).toBeInTheDocument();
  });

  it('keeps the options and lets Continue through when only the coupon re-quote fails', async () => {
    await toDelivery();
    fireEvent.click(radios()[0]!);
    await settle();
    await settle();
    quoteMock.mockImplementation(async () => { throw new ApiError(404, 'Coupon not found'); });

    type('Coupon code', 'nope');
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    await settle();
    await settle();

    expect(screen.getByText('Unknown code')).toBeInTheDocument();
    expect(radios()).toHaveLength(1);
    pressContinue();
    expect(screen.queryByText(STILL_PRICING)).toBeNull();
    expect(screen.getByRole('heading', { name: 'How you’ll pay' })).toBeInTheDocument();
  });

  it('offers no option and refuses Continue when the new country quote fails', async () => {
    await toDelivery();
    quoteMock.mockImplementation(async () => { throw new ApiError(422, 'We do not deliver there'); });
    changeCountryToIreland();
    await settle();
    await settle();

    expect(radios()).toHaveLength(0);
    pressContinue();
    expect(screen.getByText(STILL_PRICING)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delivery and discounts' })).toBeInTheDocument();
  });

  it('refuses to place an order whose options went pending, and returns to Delivery', async () => {
    state.settings = { ...settings(false), shipping: { countries: ['GB', 'IE'] } };
    const view = mount();
    await walkToReview();
    expect(screen.getByRole('heading', { name: 'Review your order' })).toBeInTheDocument();

    // The shop's list shrinks to Ireland under the open review: the country follows, un-priced.
    state.settings = { ...state.settings, shipping: { countries: ['IE'] } };
    view.rerender(<Wrapper><CheckoutPage /></Wrapper>);
    fireEvent.click(placeButton());
    await settle(0);

    expect(placeOrderMock).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Delivery and discounts' })).toBeInTheDocument();
    expect(screen.getByText(STILL_PRICING)).toBeInTheDocument();
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
  it('keeps the public order page after an external payment inside Telegram', async () => {
    tg.inTelegram = true;
    placeGuestOrderMock.mockResolvedValue({
      reference: 'G8N3RQ',
      publicUrl: `${window.location.origin}/order/G8N3RQ/key456`,
      status: 'pending',
      total: 84.99,
      payment: { type: 'checkout_url', paymentId: 2, method: 'stripe', amount: 84.99, url: 'https://pay.example/session/2' },
    });
    mount();
    await walkToReview();
    pressPlace();
    await settle();

    expect(tg.openLink).toHaveBeenCalledWith('https://pay.example/session/2');
    expect(screen.getByTestId('path')).toHaveTextContent('/order/G8N3RQ/key456');
  });
});
