import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { forwardRef, useEffect, useImperativeHandle } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { Quote } from '@/types/checkout.ts';
import type { LocalLine } from '@/stores/cart.ts';
import type { LayoutKind } from '@/builder/types.ts';

// The goldens were captured in Europe/London: pin it so any machine formats the same.
vi.hoisted(() => { process.env.TZ = 'Europe/London'; });
const realSetTimeout = globalThis.setTimeout;

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));

const tg = vi.hoisted(() => ({ inTelegram: false }));
vi.mock('@/lib/telegram-webapp.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/telegram-webapp.ts')>()),
  isTelegramWebApp: () => tg.inTelegram,
  openExternalLink: () => {},
}));

vi.mock('@/api/checkout.ts', () => ({
  quote: vi.fn(),
  guestQuote: vi.fn(),
  placeOrder: vi.fn(),
  placeGuestOrder: vi.fn(),
}));

vi.mock('@/features/cart/useServerCart.ts', () => ({
  useServerCart: () => ({
    mode: 'server',
    isSyncing: false,
    issues: [],
    add: vi.fn(),
    setQuantity: vi.fn(),
    remove: vi.fn(),
    sync: async () => {},
    refresh: async () => {},
  }),
}));

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

/** Invisible Turnstile, stubbed: `execute()` hands a token back synchronously, fails, or never answers. */
const turnstile = vi.hoisted(() => ({ mode: 'ok' as 'ok' | 'fail' | 'never', minted: 0 }));
vi.mock('@marsidev/react-turnstile', async () => ({
  Turnstile: forwardRef<unknown, { onSuccess?: (token: string) => void; onError?: () => void; onWidgetLoad?: (id: string) => void }>(
    function TurnstileStub(props, ref) {
      useImperativeHandle(ref, () => ({
        execute: () => {
          if (turnstile.mode === 'never') return;
          if (turnstile.mode === 'fail') { props.onError?.(); return; }
          turnstile.minted += 1;
          props.onSuccess?.(`tok-${turnstile.minted}`);
        },
        reset: () => {},
        remove: () => {},
        render: () => {},
        getResponse: () => undefined,
      }));
      useEffect(() => {
        props.onWidgetLoad?.('stub-widget');
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return <div data-testid="turnstile" />;
    },
  ),
}));

import { guestQuote, placeGuestOrder, placeOrder, quote } from '@/api/checkout.ts';
import { ApiError } from '@/lib/errors.ts';
import { useCartStore } from '@/stores/cart.ts';
import { usePrimaryActionStore } from '@/stores/primary-action.ts';
import { useSessionStore } from '@/stores/session.ts';
import { DEFAULT_FORM, persistForm, type CheckoutForm } from '@/features/checkout/form-state.ts';
import { CheckoutPage } from '@/features/checkout/CheckoutPage.tsx';
import { mountAt, mountDefault, mountDoc, type Mounted } from './helpers/stage4-golden.tsx';
import { expectStage5 } from './helpers/stage5-golden.ts';

const expectS5 = (name: string, html: string) => expectStage5(name, html);

const NOW = Date.parse('2026-07-07T12:00:00Z');
const NEVER = () => new Promise<never>(() => {});

function settings(guestCheckout: boolean, siteKey = true): StorefrontSettings {
  return {
    currency: 'GBP',
    contactModes: { emailMode: 'required', phoneMode: 'optional', defaultPhoneCountry: 'GB' },
    features: { layout: 'storefront', ordering: true, guestCheckout, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
    turnstile: guestCheckout && siteKey ? { siteKey: '1x00000000000000000000AA' } : null,
    brand: { name: 'Northbound Supply', shortName: 'Northbound', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
    supportLinks: [],
    notices: [],
    enabled: true,
  } as unknown as StorefrontSettings;
}

function line(productId = 12, quantity = 2): LocalLine {
  return {
    productId, displayName: 'Widget Blue', sku: 'WID-BLU', unitPrice: 40, basePrice: 40, pricingTiers: [],
    quantity, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
  };
}

const CRYPTO_OPTIONS = [
  { coin: 'btc', network: 'bitcoin', coinLabel: 'Bitcoin', networkLabel: 'Bitcoin', feeType: 'percentage', feeValue: 1, feeRateText: '+1%', feeLabel: 'Network fee', fee: 0.8, chargeTotal: 80.8 },
  { coin: 'usdt', network: 'tron', coinLabel: 'Tether', networkLabel: 'Tron (TRC-20)', feeType: 'percentage', feeValue: 0, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 80 },
  { coin: 'usdt', network: 'ethereum', coinLabel: 'Tether', networkLabel: 'Ethereum (ERC-20)', feeType: 'percentage', feeValue: 2, feeRateText: '+2%', feeLabel: 'Network fee', fee: 1.6, chargeTotal: 81.6 },
];

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    items: [{ productId: 12, name: 'Widget Blue', sku: 'WID-BLU', quantity: 2, unitPrice: 40, lineTotal: 80, tierApplied: false, isPreorder: false }],
    subtotal: 80,
    coupon: null,
    shippingOptions: [
      { id: 3, name: 'Royal Mail Tracked 24', courier: 'Royal Mail', price: 4.99, freeShipping: false },
      { id: 4, name: 'Collect in store', courier: null, price: 0, freeShipping: true },
    ],
    selectedShippingOptionId: null,
    shippingAmount: 0,
    storeCredit: { balance: 12.5, applied: 0, remaining: 12.5 },
    grandTotal: 80,
    amountDue: 80,
    paymentMethods: [
      { slot: 'card', method: 'stripe', displayName: 'Card', type: 'gateway', details: null, feeType: 'percentage', feeValue: 2, feeRateText: '+2%', feeLabel: 'Card fee', fee: 1.6, chargeTotal: 81.6 },
      { slot: 'crypto', method: 'crypto', displayName: 'Crypto', type: 'crypto', details: null, feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 80, cryptoOptions: CRYPTO_OPTIONS },
    ],
    contactModes: { emailMode: 'required', phoneMode: 'optional', defaultPhoneCountry: 'GB' },
    ...overrides,
  };
}

/** A complete checkout form as `form-state.ts` persists it. */
function formWith(overrides: Partial<CheckoutForm> = {}): CheckoutForm {
  return {
    ...DEFAULT_FORM,
    firstName: 'Ada', surname: 'Lovelace', email: 'ada@example.com', phonePrefix: 'GB',
    addressLine1: '1 Main St', city: 'London', zip: 'SW1A 1AA', country: 'GB',
    shippingOptionId: 3, paymentMethod: 'stripe',
    ...overrides,
  };
}

interface Case {
  step: number;
  guest?: boolean;
  tg?: boolean;
  /** No Turnstile site key (guest only). */
  noSiteKey?: boolean;
  form?: Partial<CheckoutForm>;
  emptyCart?: boolean;
  quote?: () => Promise<Quote>;
  /** Run after the walk to `step`, before the final settle. */
  after?: () => Promise<void>;
  setup?: () => void;
  turnstile?: 'ok' | 'fail' | 'never';
}

const flush = (ms = 600) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
/** Real (un-faked) wait: lazy blocks resolve through real module loads. */
const realWait = (ms: number) => act(async () => { await new Promise((r) => realSetTimeout(r, ms)); });

async function waitContent(m: Mounted): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (m.container.innerHTML !== '') return;
    await realWait(10);
  }
  throw new Error('stage5 checkout harness: nothing rendered');
}

async function settle(m: Mounted): Promise<string> {
  let prev = '';
  let same = 0;
  for (let i = 0; i < 60; i += 1) {
    await flush(100);
    const cur = m.container.innerHTML;
    same = cur === prev ? same + 1 : 0;
    if (same >= 2) return cur;
    prev = cur;
  }
  throw new Error('stage5 checkout harness: the render never settled');
}

function pressContinue(): void {
  if (!tg.inTelegram) {
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    return;
  }
  const action = usePrimaryActionStore.getState().override;
  if (!action || !/^continue$/i.test(action.label)) throw new Error(`stage5 checkout harness: no Continue primary action (${action?.label})`);
  act(() => action.onClick());
}

/** Reach step `n` (1-based) as a shopper does: n-1 presses of Continue, awaiting the quote after each. */
async function advanceTo(m: Mounted, n: number): Promise<void> {
  await waitContent(m);
  await flush(); // the first quote
  for (let i = 1; i < n; i += 1) {
    pressContinue();
    await flush(1000);
  }
  void m;
}

async function prepare(c: Case): Promise<void> {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  usePrimaryActionStore.setState({ override: null });
  tg.inTelegram = Boolean(c.tg);
  turnstile.mode = c.turnstile ?? 'ok';
  turnstile.minted = 0;
  state.settings = settings(Boolean(c.guest), !c.noSiteKey);
  useCartStore.setState({ lines: c.emptyCart ? [] : [line()], mode: c.guest ? 'local' : 'server' });
  useSessionStore.setState(c.guest
    ? { token: null, customer: null, returnTo: null }
    : { token: 'sess-1', customer: { id: 5, nickname: 'ada' }, returnTo: null });
  const q = c.quote ?? (() => Promise.resolve(makeQuote()));
  vi.mocked(quote).mockImplementation(q);
  vi.mocked(guestQuote).mockImplementation(q);
  vi.mocked(placeOrder).mockResolvedValue({ reference: 'K7M2QP', publicUrl: null, status: 'pending', total: 84.99, payment: { type: 'none' } });
  vi.mocked(placeGuestOrder).mockResolvedValue({ reference: 'G8N3RQ', publicUrl: null, status: 'pending', total: 84.99, payment: { type: 'none' } });
  c.setup?.();
  persistForm(formWith(c.form));
}

const OPTS = { path: '/checkout', route: '/checkout' };
type Renderer = { name: string; mount: () => Mounted };
const renderers = (layout: LayoutKind = 'storefront'): Renderer[] => [
  { name: 'entry', mount: () => mountAt(<CheckoutPage />, OPTS) },
  { name: `default-${layout}`, mount: () => mountDefault('checkout', layout, OPTS) },
  { name: 'doc', mount: () => mountDoc('checkout', 'storefront', [{ type: 'CheckoutFlow', props: { id: 'CheckoutFlow-1' } }], OPTS) },
];

/** One golden per case, rendered by the entry, the default document and a stored v0.7.0-shaped document. */
async function run(name: string, c: Case, only?: LayoutKind[]): Promise<void> {
  const list = only
    ? only.map((layout) => ({ name: `default-${layout}`, mount: () => mountDefault('checkout', layout, OPTS) }))
    : renderers();
  for (const r of list) {
    await prepare(c);
    const m = r.mount();
    await advanceTo(m, c.step);
    if (c.after) await c.after();
    expectS5(`checkout-${name}`, await settle(m));
    cleanup();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
  useSessionStore.setState({ token: null, customer: null, returnTo: null });
  useCartStore.setState({ lines: [], mode: 'local' });
  usePrimaryActionStore.setState({ override: null });
});

const TIMEOUT = 120_000;
const placeButton = () => screen.getByRole('button', { name: /place order/i });

describe('stage 5 checkout goldens — steps', () => {
  for (const step of [1, 2, 3, 4, 5]) {
    for (const who of ['in', 'guest'] as const) {
      for (const env of ['web', 'tg'] as const) {
        it(`step${step}-${who}-${env}`, async () => {
          await run(`step${step}-${who}-${env}`, { step, guest: who === 'guest', tg: env === 'tg' });
        }, TIMEOUT);
      }
    }
  }

  it('menu and webapp layouts render the same step 1 and step 5', async () => {
    await run('step1-in-web', { step: 1 }, ['menu', 'webapp']);
    await run('step5-in-web', { step: 5 }, ['menu', 'webapp']);
  }, TIMEOUT);
});

describe('stage 5 checkout goldens — shipping step', () => {
  it('quote-error-coupon', async () => {
    await run('quote-error-coupon', { step: 3, form: { couponCode: 'NOPE10', shippingOptionId: null }, quote: () => Promise.reject(new ApiError(404, 'Unknown code')) });
  }, TIMEOUT);
  it('quote-error-shipping', async () => {
    await run('quote-error-shipping', { step: 3, quote: () => Promise.reject(new ApiError(422, 'That delivery option is not available')) });
  }, TIMEOUT);
  it('quote-error-address', async () => {
    await run('quote-error-address', { step: 3, form: { shippingOptionId: null }, quote: () => Promise.reject(new ApiError(422, 'We do not deliver to that address')) });
  }, TIMEOUT);
  // The notice for an address-owned 422 renders on the address step itself, so pin that step too.
  it('quote-error-address-on-address-step', async () => {
    await run('quote-error-address-on-address-step', { step: 2, form: { shippingOptionId: null }, quote: () => Promise.reject(new ApiError(422, 'We do not deliver to that address')) });
  }, TIMEOUT);
  it('quote-error-page', async () => {
    await run('quote-error-page', { step: 3, form: { shippingOptionId: null }, quote: () => Promise.reject(new ApiError(429, 'Too many requests, slow down')) });
  }, TIMEOUT);
  it('shipping-unserviceable', async () => {
    await run('shipping-unserviceable', { step: 3, form: { shippingOptionId: null }, quote: () => Promise.resolve(makeQuote({ shippingOptions: [] })) });
  }, TIMEOUT);
  it('shipping-pending', async () => {
    await run('shipping-pending', { step: 3, form: { shippingOptionId: null }, quote: NEVER });
  }, TIMEOUT);
});

describe('stage 5 checkout goldens — payment step', () => {
  it('payment-store-credit', async () => {
    await run('payment-store-credit', {
      step: 4,
      form: { useStoreCredit: true, paymentMethod: '' },
      quote: () => Promise.resolve(makeQuote({ storeCredit: { balance: 100, applied: 80, remaining: 20 }, amountDue: 0 })),
    });
  }, TIMEOUT);
  it('payment-crypto-combo', async () => {
    await run('payment-crypto-combo', { step: 4, form: { paymentMethod: 'crypto', coin: 'usdt', network: 'tron' } });
  }, TIMEOUT);
  it('payment-methods-none', async () => {
    await run('payment-methods-none', { step: 4, form: { paymentMethod: '' }, quote: () => Promise.resolve(makeQuote({ paymentMethods: [] })) });
  }, TIMEOUT);
});

describe('stage 5 checkout goldens — review step', () => {
  it('review-coupon-notes', async () => {
    await run('review-coupon-notes', {
      step: 5,
      form: { couponCode: 'SAVE10', notes: 'Leave with neighbour' },
      quote: () => Promise.resolve(makeQuote({
        coupon: { code: 'SAVE10', discountAmount: 8, shippingDiscount: 0, autoApplied: false },
        grandTotal: 72, amountDue: 72,
      })),
    });
  }, TIMEOUT);
  it('review-submit-error', async () => {
    await run('review-submit-error', {
      step: 5,
      setup: () => { vi.mocked(placeOrder).mockRejectedValue(new ApiError(502, 'The payment provider is unavailable')); },
      after: async () => { fireEvent.click(placeButton()); await flush(); },
    });
  }, TIMEOUT);
  it('review-locked', async () => {
    await run('review-locked', {
      step: 5,
      setup: () => { vi.mocked(placeOrder).mockRejectedValue(new ApiError(409, 'Checkout already in progress')); },
      after: async () => { fireEvent.click(placeButton()); await flush(100); },
    });
  }, TIMEOUT);
  it('review-placing', async () => {
    await run('review-placing', {
      step: 5,
      setup: () => { vi.mocked(placeOrder).mockImplementation(NEVER); },
      after: async () => { fireEvent.click(placeButton()); await flush(100); },
    });
  }, TIMEOUT);
});

describe('stage 5 checkout goldens — guest and page states', () => {
  it('guest-verify-error', async () => {
    await run('guest-verify-error', { step: 3, guest: true, turnstile: 'fail', form: { shippingOptionId: null } });
  }, TIMEOUT);
  it('guest-verifying', async () => {
    await run('guest-verifying', { step: 1, guest: true, turnstile: 'never', form: { shippingOptionId: null } });
  }, TIMEOUT);
  it('empty-cart', async () => {
    await run('empty-cart', { step: 1, emptyCart: true });
  }, TIMEOUT);
  it('guest-unavailable', async () => {
    await run('guest-unavailable', { step: 1, guest: true, noSiteKey: true });
  }, TIMEOUT);
});
