import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Quote } from '@/types/checkout.ts';

vi.mock('@/api/checkout.ts', () => ({
  quote: vi.fn(),
  guestQuote: vi.fn(),
  placeOrder: vi.fn(),
  placeGuestOrder: vi.fn(),
}));

import { guestQuote, quote } from '@/api/checkout.ts';
import { ApiError } from '@/lib/errors.ts';
import { useCartStore, type LocalLine } from '@/stores/cart.ts';
import { DEFAULT_FORM, type CheckoutForm } from '@/features/checkout/form-state.ts';
import { useQuote } from '@/features/checkout/useQuote.ts';

const quoteMock = vi.mocked(quote);
const guestQuoteMock = vi.mocked(guestQuote);

function baseQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    items: [],
    subtotal: 80,
    coupon: null,
    shippingOptions: [],
    selectedShippingOptionId: null,
    shippingAmount: 0,
    storeCredit: { balance: 0, applied: 0, remaining: 0 },
    grandTotal: 80,
    amountDue: 80,
    paymentMethods: [],
    contactModes: { emailMode: 'optional', phoneMode: 'optional', defaultPhoneCountry: null },
    ...overrides,
  };
}

function form(overrides: Partial<CheckoutForm> = {}): CheckoutForm {
  return { ...DEFAULT_FORM, ...overrides };
}

function line(productId: number, quantity: number, overrides: Partial<LocalLine> = {}): LocalLine {
  return {
    productId,
    displayName: `Product ${productId}`,
    sku: `SKU-${productId}`,
    unitPrice: 10,
    basePrice: 10,
    pricingTiers: [],
    quantity,
    isPreorder: false,
    excludedFromFreeShipping: false,
    imageProductId: null,
    ...overrides,
  };
}

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Run the debounce window out and let the resulting fetch's promise chain settle. */
async function settle(ms = 300) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useCartStore.setState({ lines: [], mode: 'local' });
  quoteMock.mockResolvedValue(baseQuote());
  guestQuoteMock.mockResolvedValue(baseQuote());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useQuote (logged-in)', () => {
  it('does not fetch while country is unset', async () => {
    renderHook(() => useQuote(form({ country: '' }), { guest: false }), { wrapper });
    await settle();
    expect(quoteMock).not.toHaveBeenCalled();
  });

  it('debounces rapid form changes into a single request', async () => {
    const { rerender } = renderHook(({ f }: { f: CheckoutForm }) => useQuote(f, { guest: false }), {
      wrapper,
      initialProps: { f: form({ country: '' }) },
    });

    rerender({ f: form({ country: 'GB', couponCode: 's' }) });
    rerender({ f: form({ country: 'GB', couponCode: 'sa' }) });
    rerender({ f: form({ country: 'GB', couponCode: 'save10' }) });
    expect(quoteMock).not.toHaveBeenCalled();

    await settle();

    expect(quoteMock).toHaveBeenCalledTimes(1);
    expect(quoteMock).toHaveBeenLastCalledWith(expect.objectContaining({ couponCode: 'SAVE10' }));
  });

  it('sends the coupon code uppercased and trimmed', async () => {
    renderHook(() => useQuote(form({ country: 'GB', couponCode: '  save10  ' }), { guest: false }), { wrapper });
    await settle();
    expect(quoteMock).toHaveBeenCalledWith(expect.objectContaining({ couponCode: 'SAVE10' }));
  });

  it('omits the coupon entirely once blank', async () => {
    renderHook(() => useQuote(form({ country: 'GB', couponCode: '   ' }), { guest: false }), { wrapper });
    await settle();
    const call = quoteMock.mock.calls[0]?.[0];
    expect(call?.couponCode).toBeUndefined();
  });

  it('forwards country, shippingOptionId and useStoreCredit', async () => {
    renderHook(
      () => useQuote(form({ country: 'FR', shippingOptionId: 3, useStoreCredit: true }), { guest: false }),
      { wrapper },
    );
    await settle();
    expect(quoteMock).toHaveBeenCalledWith(
      expect.objectContaining({ country: 'FR', shippingOptionId: 3, useStoreCredit: true }),
    );
  });

  it('surfaces a 422 message from the backend as the error', async () => {
    quoteMock.mockRejectedValue(new ApiError(422, 'Minimum spend of 50 not met'));
    const { result } = renderHook(() => useQuote(form({ country: 'GB' }), { guest: false }), { wrapper });

    await settle();

    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error?.message).toBe('Minimum spend of 50 not met');
  });

  it('keeps the previous quote visible while a new one is being fetched', async () => {
    quoteMock.mockResolvedValueOnce(baseQuote({ grandTotal: 80 }));
    const { result, rerender } = renderHook(({ f }: { f: CheckoutForm }) => useQuote(f, { guest: false }), {
      wrapper,
      initialProps: { f: form({ country: 'GB' }) },
    });
    await settle();
    expect(result.current.quote?.grandTotal).toBe(80);

    let resolveSecond!: (q: Quote) => void;
    quoteMock.mockImplementationOnce(() => new Promise<Quote>((res) => { resolveSecond = res; }));
    rerender({ f: form({ country: 'FR' }) });
    await settle();

    expect(result.current.isFetching).toBe(true);
    expect(result.current.quote?.grandTotal).toBe(80);

    await act(async () => {
      resolveSecond(baseQuote({ grandTotal: 95 }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.quote?.grandTotal).toBe(95);
    expect(result.current.isFetching).toBe(false);
  });

  it('never sends cart items for a logged-in quote', async () => {
    useCartStore.setState({ lines: [line(1, 2)] });
    renderHook(() => useQuote(form({ country: 'GB' }), { guest: false }), { wrapper });
    await settle();
    const call = quoteMock.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(call.items).toBeUndefined();
  });
});

describe('useQuote (guest)', () => {
  it('does not fetch without a turnstile token', async () => {
    useCartStore.setState({ lines: [line(1, 2)] });
    renderHook(() => useQuote(form({ country: 'GB' }), { guest: true }), { wrapper });
    await settle();
    expect(guestQuoteMock).not.toHaveBeenCalled();
  });

  it('sends the cart lines and the token once one is supplied', async () => {
    useCartStore.setState({ lines: [line(1, 2), line(9, 1)] });
    renderHook(() => useQuote(form({ country: 'GB' }), { guest: true, turnstileToken: 'tok-1' }), { wrapper });
    await settle();
    expect(guestQuoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        turnstileToken: 'tok-1',
        items: [
          { productId: 1, quantity: 2 },
          { productId: 9, quantity: 1 },
        ],
        country: 'GB',
      }),
    );
  });

  it('never includes useStoreCredit in the guest request', async () => {
    useCartStore.setState({ lines: [line(1, 1)] });
    renderHook(
      () => useQuote(form({ country: 'GB', useStoreCredit: true }), { guest: true, turnstileToken: 'tok-1' }),
      { wrapper },
    );
    await settle();
    const call = guestQuoteMock.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(call.useStoreCredit).toBeUndefined();
  });

  it('does not silently refetch once the initial guest quote lands', async () => {
    useCartStore.setState({ lines: [line(1, 1)] });
    renderHook(() => useQuote(form({ country: 'GB' }), { guest: true, turnstileToken: 'tok-1' }), { wrapper });
    await settle();
    expect(guestQuoteMock).toHaveBeenCalledTimes(1);

    // Nothing about the key changed; idle time passing alone must not trigger another call.
    await settle(60_000);
    expect(guestQuoteMock).toHaveBeenCalledTimes(1);
  });

  it('refetchWithToken re-queries the same key with a fresh single-use token', async () => {
    useCartStore.setState({ lines: [line(1, 1)] });
    guestQuoteMock.mockResolvedValueOnce(baseQuote({ grandTotal: 50 }));
    const { result } = renderHook(
      () => useQuote(form({ country: 'GB' }), { guest: true, turnstileToken: 'tok-1' }),
      { wrapper },
    );
    await settle();
    expect(result.current.quote?.grandTotal).toBe(50);
    expect(guestQuoteMock).toHaveBeenCalledTimes(1);

    guestQuoteMock.mockResolvedValueOnce(baseQuote({ grandTotal: 55 }));
    await act(async () => {
      await result.current.refetchWithToken('tok-2');
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(guestQuoteMock).toHaveBeenCalledTimes(2);
    expect(guestQuoteMock).toHaveBeenLastCalledWith(expect.objectContaining({ turnstileToken: 'tok-2' }));
    expect(result.current.quote?.grandTotal).toBe(55);
  });
});
