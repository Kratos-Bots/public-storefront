import { useMemo, useRef } from 'react';
import { keepPreviousData, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useDebouncedValue } from '@mantine/hooks';
import { guestQuote, quote as fetchQuote } from '@/api/checkout.ts';
import type { ApiError } from '@/api/client.ts';
import { useCartStore } from '@/stores/cart.ts';
import type { CheckoutForm } from '@/features/checkout/form-state.ts';
import type { Quote, QuoteInput } from '@/types/checkout.ts';
import { quoteDeliveryFields } from '@/features/checkout/collection-mode.ts';

const DEBOUNCE_MS = 300;

export interface UseQuoteOptions {
  guest: boolean;
  /** From the Turnstile widget. Single-use — a token this hook has already sent once
   *  (success or failure) is never sent again, automatically or otherwise; see
   *  `needsToken`/`refetchWithToken`. */
  turnstileToken?: string;
}

export interface UseQuoteResult {
  quote: Quote | undefined;
  isFetching: boolean;
  error: ApiError | null;
  /** True for a guest with no token yet, or whose current `turnstileToken` has already
   *  been spent by a request that settled — the caller should fetch/execute the
   *  invisible Turnstile widget for a fresh one before quoting (or checking out) again.
   *  Always false when logged in. */
  needsToken: boolean;
  /** Re-run the current (guest) quote with a fresh token, without waiting for the
   *  debounced key to change. No-op key-wise for a logged-in quote. */
  refetchWithToken: (token: string) => Promise<void>;
  /** True only when the quote data on hand was fetched for the delivery options key
   *  (country, delivery method, point carrier) the form holds right now. False while
   *  a quote for a different one is in flight, and when there is no quote at all. */
  optionsCurrent: boolean;
}

/**
 * What the list of shipping options depends on: the delivery country, the method (home
 * or collection point) and, for a collection, the chosen point's carrier. A coupon, store
 * credit, the chosen option or the cart lines re-quote but never change the list.
 */
export function optionsKey(input: Pick<HashInput, 'country' | 'deliveryMethod' | 'servicePointCarrier'>): string {
  return JSON.stringify([input.country, input.deliveryMethod ?? null, input.servicePointCarrier ?? null]);
}

interface HashInput {
  country: string;
  couponCode: string;
  shippingOptionId: number | null;
  useStoreCredit: boolean;
  deliveryMethod?: QuoteInput['deliveryMethod'];
  servicePointCarrier?: string;
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
 * anonymous shopper) and a single-use Turnstile token. Turnstile tokens are single-use
 * *server-side* (STOREFRONT.md §3.5a) — `staleTime: Infinity` only stops react-query
 * refetching the *same* query key on its own; it does nothing once a form edit produces
 * a *new* key, which would otherwise auto-fire using the same (already-spent)
 * `turnstileToken` prop and get a guaranteed `422 Verification failed`. So every guest
 * request — the automatic one or one sent via `refetchWithToken` — marks its own token
 * consumed the moment it settles (success or error), and the automatic query is `enabled`
 * only while the current token is still unconsumed. `needsToken` surfaces that state so
 * the caller knows to fetch a fresh token before the next quote.
 */
export function useQuote(form: CheckoutForm, { guest, turnstileToken }: UseQuoteOptions): UseQuoteResult {
  const queryClient = useQueryClient();
  const lines = useCartStore((s) => s.lines);
  // Every token this hook instance has ever sent to the guest endpoints, win or lose.
  // A Set (not just the last token) so an out-of-band `refetchWithToken` call doesn't
  // make an *earlier* spent token look reusable again once it's no longer the newest one.
  const consumedTokensRef = useRef<Set<string>>(new Set());

  const hashInput: HashInput = useMemo(() => {
    const base = {
      country: form.country,
      couponCode: form.couponCode.trim().toUpperCase(),
      shippingOptionId: form.shippingOptionId,
      useStoreCredit: form.useStoreCredit,
      ...quoteDeliveryFields(form),
    };
    return guest
      ? { ...base, lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })) }
      : base;
  }, [form.country, form.couponCode, form.shippingOptionId, form.useStoreCredit, form.deliveryMethod, form.servicePoint, guest, lines]);

  const [debounced] = useDebouncedValue(hashInput, DEBOUNCE_MS);
  const hash = useMemo(() => JSON.stringify(debounced), [debounced]);
  const queryKey = useMemo<QueryKey>(() => ['quote', guest, hash], [guest, hash]);

  const runQuote = (token: string | undefined) => {
    if (guest) {
      const p = guestQuote({
        turnstileToken: token ?? '',
        items: debounced.lines ?? [],
        country: debounced.country || undefined,
        couponCode: debounced.couponCode || undefined,
        shippingOptionId: debounced.shippingOptionId ?? undefined,
        ...(debounced.deliveryMethod ? { deliveryMethod: debounced.deliveryMethod } : {}),
        ...(debounced.servicePointCarrier ? { servicePointCarrier: debounced.servicePointCarrier } : {}),
      });
      // Mark this exact token spent the moment the request settles, win or lose — Turnstile
      // consumes it on verification regardless of what the rest of the request did with it,
      // so a failed quote must not leave the token looking reusable for the next attempt.
      if (token) {
        void p.then(
          () => { consumedTokensRef.current.add(token); },
          () => { consumedTokensRef.current.add(token); },
        );
      }
      return p;
    }
    return fetchQuote({
      country: debounced.country || undefined,
      couponCode: debounced.couponCode || undefined,
      shippingOptionId: debounced.shippingOptionId ?? undefined,
      useStoreCredit: debounced.useStoreCredit,
      ...(debounced.deliveryMethod ? { deliveryMethod: debounced.deliveryMethod } : {}),
      ...(debounced.servicePointCarrier ? { servicePointCarrier: debounced.servicePointCarrier } : {}),
    });
  };

  const tokenSpent = guest && turnstileToken !== undefined && consumedTokensRef.current.has(turnstileToken);
  const needsToken = guest && (!turnstileToken || tokenSpent);
  const enabled = Boolean(debounced.country) && (!guest || (Boolean(turnstileToken) && !tokenSpent));

  const query = useQuery<Quote, ApiError>({
    queryKey,
    queryFn: () => runQuote(turnstileToken),
    enabled,
    placeholderData: keepPreviousData,
    retry: false,
    ...(guest ? { staleTime: Infinity, refetchOnWindowFocus: false } : {}),
  });

  // The options key of the data the observer holds. Data that is not placeholder was
  // fetched for the debounced key (the guest's `refetchWithToken` lands on that same
  // key); placeholder data is the previous key's, so the remembered key stays put.
  const dataOptionsKey = useRef<string | null>(null);
  if (query.data !== undefined && !query.isPlaceholderData) dataOptionsKey.current = optionsKey(debounced);
  // Judged by the key of the last SUCCESSFUL quote, not by this query having data: a failed
  // re-quote (a rejected coupon) has no data, but the page still shows the last good quote,
  // which was priced for this same key. Null until a quote has ever succeeded.
  const optionsCurrent = dataOptionsKey.current !== null && dataOptionsKey.current === optionsKey(hashInput);

  async function refetchWithToken(token: string): Promise<void> {
    // `retry: false` is not optional here. `fetchQuery` takes the client's default
    // retry (1) unless told otherwise, and a retry re-runs whatever `queryFn` the
    // query currently holds — which, once the mounted observer has re-applied its
    // own options, is the observer's, carrying no token at all. The retry then goes
    // out with `turnstileToken: ''` and the backend answers `body.turnstileToken:
    // Too small`. Observed live: every failed guest quote produced a second,
    // token-less request.
    await queryClient.fetchQuery({
      queryKey,
      queryFn: () => runQuote(token),
      staleTime: 0,
      retry: false,
    });
  }

  return {
    quote: query.data,
    isFetching: query.isFetching,
    error: query.error ?? null,
    needsToken,
    refetchWithToken,
    optionsCurrent,
  };
}
