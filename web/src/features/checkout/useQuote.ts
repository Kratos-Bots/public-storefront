import { useMemo } from 'react';
import { keepPreviousData, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useDebouncedValue } from '@mantine/hooks';
import { guestQuote, quote as fetchQuote } from '@/api/checkout.ts';
import type { ApiError } from '@/api/client.ts';
import { useCartStore } from '@/stores/cart.ts';
import type { CheckoutForm } from '@/features/checkout/form-state.ts';
import type { Quote } from '@/types/checkout.ts';

const DEBOUNCE_MS = 300;

export interface UseQuoteOptions {
  guest: boolean;
  /** From the Turnstile widget. Single-use — only consumed for the initial guest
   *  fetch each key enables; a later re-quote goes through `refetchWithToken`. */
  turnstileToken?: string;
}

export interface UseQuoteResult {
  quote: Quote | undefined;
  isFetching: boolean;
  error: ApiError | null;
  /** Re-run the current (guest) quote with a fresh token, without waiting for the
   *  debounced key to change. No-op key-wise for a logged-in quote. */
  refetchWithToken: (token: string) => Promise<void>;
}

interface HashInput {
  country: string;
  couponCode: string;
  shippingOptionId: number | null;
  useStoreCredit: boolean;
  lines?: { productId: number; quantity: number }[];
}

/**
 * Prices the cart against the backend on every meaningful form change (§3.5 of
 * STOREFRONT.md — nothing is priced client-side). Keyed on a hash of just the inputs
 * that change the quote, debounced 300 ms so a burst of keystrokes becomes one request,
 * and `placeholderData: keepPreviousData` so the totals on screen don't blank out while
 * a new quote is in flight.
 *
 * The guest variant carries the cart lines inline (there's no server-stored cart for an
 * anonymous shopper) and a single-use Turnstile token — since the token can't be reused,
 * the query never auto-refetches (`staleTime: Infinity`, no window-focus refetch); getting
 * a fresh quote for the same key after the first fetch goes through `refetchWithToken`.
 */
export function useQuote(form: CheckoutForm, { guest, turnstileToken }: UseQuoteOptions): UseQuoteResult {
  const queryClient = useQueryClient();
  const lines = useCartStore((s) => s.lines);

  const hashInput: HashInput = useMemo(() => {
    const base = {
      country: form.country,
      couponCode: form.couponCode.trim().toUpperCase(),
      shippingOptionId: form.shippingOptionId,
      useStoreCredit: form.useStoreCredit,
    };
    return guest
      ? { ...base, lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })) }
      : base;
  }, [form.country, form.couponCode, form.shippingOptionId, form.useStoreCredit, guest, lines]);

  const [debounced] = useDebouncedValue(hashInput, DEBOUNCE_MS);
  const hash = useMemo(() => JSON.stringify(debounced), [debounced]);
  const queryKey = useMemo<QueryKey>(() => ['quote', guest, hash], [guest, hash]);

  const runQuote = (token: string | undefined) => {
    if (guest) {
      return guestQuote({
        turnstileToken: token ?? '',
        items: debounced.lines ?? [],
        country: debounced.country || undefined,
        couponCode: debounced.couponCode || undefined,
        shippingOptionId: debounced.shippingOptionId ?? undefined,
      });
    }
    return fetchQuote({
      country: debounced.country || undefined,
      couponCode: debounced.couponCode || undefined,
      shippingOptionId: debounced.shippingOptionId ?? undefined,
      useStoreCredit: debounced.useStoreCredit,
    });
  };

  const enabled = Boolean(debounced.country) && (!guest || Boolean(turnstileToken));

  const query = useQuery<Quote, ApiError>({
    queryKey,
    queryFn: () => runQuote(turnstileToken),
    enabled,
    placeholderData: keepPreviousData,
    retry: false,
    ...(guest ? { staleTime: Infinity, refetchOnWindowFocus: false } : {}),
  });

  async function refetchWithToken(token: string): Promise<void> {
    await queryClient.fetchQuery({ queryKey, queryFn: () => runQuote(token), staleTime: 0 });
  }

  return {
    quote: query.data,
    isFetching: query.isFetching,
    error: query.error ?? null,
    refetchWithToken,
  };
}
