import { api, unwrap } from '@/api/client.ts';
import { warehouseBody } from '@/api/warehouse-param.ts';
import { currentWarehouseId } from '@/features/warehouses/store.ts';
import type {
  CheckoutInput,
  CheckoutResult,
  GuestCheckoutInput,
  GuestQuoteInput,
  Quote,
  QuoteInput,
} from '@/types/checkout.ts';

// All four bodies carry the shopper's chosen warehouse as `warehouseId` (STOREFRONT.md §3.5) - and
// nothing at all when none is chosen, so the body is the one that was always sent.
const withWarehouse = <T extends object>(input: T): T => ({ ...input, ...warehouseBody(currentWarehouseId()) });

export const quote = (input: QuoteInput) =>
  unwrap<Quote>(api.post('storefront/checkout/quote', { json: withWarehouse(input) }));

export const placeOrder = (input: CheckoutInput) =>
  unwrap<CheckoutResult>(api.post('storefront/checkout', { json: withWarehouse(input) }));

export const guestQuote = (input: GuestQuoteInput) =>
  unwrap<Quote>(api.post('storefront/checkout/guest/quote', { json: withWarehouse(input) }));

export const placeGuestOrder = (input: GuestCheckoutInput) =>
  unwrap<CheckoutResult>(api.post('storefront/checkout/guest', { json: withWarehouse(input) }));
