import { api, unwrap } from '@/api/client.ts';
import type {
  CheckoutInput,
  CheckoutResult,
  GuestCheckoutInput,
  GuestQuoteInput,
  Quote,
  QuoteInput,
} from '@/types/checkout.ts';

export const quote = (input: QuoteInput) =>
  unwrap<Quote>(api.post('storefront/checkout/quote', { json: input }));

export const placeOrder = (input: CheckoutInput) =>
  unwrap<CheckoutResult>(api.post('storefront/checkout', { json: input }));

export const guestQuote = (input: GuestQuoteInput) =>
  unwrap<Quote>(api.post('storefront/checkout/guest/quote', { json: input }));

export const placeGuestOrder = (input: GuestCheckoutInput) =>
  unwrap<CheckoutResult>(api.post('storefront/checkout/guest', { json: input }));
