// Collection points in the checkout: every decision that needs no React. Which
// countries the picker lists, whether a country offers home delivery, a
// collection point or the choice, what a change to the form has to clear, and
// what a collection order sends.
import type { CheckoutForm } from '@/features/checkout/form-state.ts';
import { normaliseShipCountries } from '@/features/checkout/ship-countries.ts';
import type { QuoteInput, ShippingAddressInput } from '@/types/checkout.ts';
import type { ContactFieldMode, StorefrontSettings } from '@/types/settings.ts';

export interface ShipLists {
  /** Where a home delivery can be quoted. Empty = unknown. */
  home: string[];
  /** Where a collection point can be offered. */
  collection: string[];
}

export function shipListsOf(settings: Pick<StorefrontSettings, 'shipping'>): ShipLists {
  return {
    home: normaliseShipCountries(settings.shipping?.countries),
    collection: normaliseShipCountries(settings.shipping?.collectionCountries),
  };
}

/** The countries the picker offers. Empty = every country (the shop's home list is unknown, as before collection points). */
export function pickerCountries(lists: ShipLists): string[] {
  if (lists.home.length === 0) return [];
  return [...lists.home, ...lists.collection.filter((c) => !lists.home.includes(c))];
}

export type CountryMode = 'home' | 'collection' | 'choice';

/**
 * What a country offers. A carrier texts the pick-up code, so a shop that hides
 * the phone field offers no collection. With the home list unknown, home
 * delivery cannot be ruled out, so a collection country offers the choice.
 */
export function modeForCountry(country: string, lists: ShipLists, phoneMode: ContactFieldMode): CountryMode {
  if (!country || phoneMode === 'hidden' || !lists.collection.includes(country)) return 'home';
  return lists.home.length === 0 || lists.home.includes(country) ? 'choice' : 'collection';
}

/**
 * `next` with the delivery rules applied, given the form it came from. Returns
 * `next` itself when nothing changes, so it is safe in a state updater.
 *  - a point belongs to a country: a new country clears it;
 *  - the country decides the method where it offers only one;
 *  - a new method, or a point from another carrier, makes the chosen delivery
 *    option meaningless, so it is cleared rather than left to fail at submit.
 */
export function reconcileDelivery(prev: CheckoutForm, next: CheckoutForm, lists: ShipLists, phoneMode: ContactFieldMode): CheckoutForm {
  const countryChanged = next.country !== prev.country;
  const servicePoint = countryChanged ? null : next.servicePoint;
  const mode = modeForCountry(next.country, lists, phoneMode);
  const deliveryMethod = mode === 'choice' ? next.deliveryMethod : mode;

  const methodChanged = deliveryMethod !== prev.deliveryMethod;
  const carrierChanged = deliveryMethod === 'collection' && (servicePoint?.carrier ?? null) !== (prev.servicePoint?.carrier ?? null);
  const shippingOptionId = countryChanged || methodChanged || carrierChanged ? null : next.shippingOptionId;

  if (servicePoint === next.servicePoint && deliveryMethod === next.deliveryMethod && shippingOptionId === next.shippingOptionId) return next;
  return { ...next, servicePoint, deliveryMethod, shippingOptionId };
}

/** The delivery part of a quote request. Nothing for home, so a home quote is byte-identical to the one sent before collection points. */
export function quoteDeliveryFields(form: CheckoutForm): Pick<QuoteInput, 'deliveryMethod' | 'servicePointCarrier'> {
  if (form.deliveryMethod !== 'collection') return {};
  return form.servicePoint ? { deliveryMethod: 'collection', servicePointCarrier: form.servicePoint.carrier } : { deliveryMethod: 'collection' };
}

/** The order's shipping address for a collection: the shopper's own name at the point's address (the carrier's convention), plus the point. Null when the form is not a collection. */
export function collectionAddress(form: CheckoutForm): ShippingAddressInput | null {
  const point = form.servicePoint;
  if (form.deliveryMethod !== 'collection' || !point) return null;
  const street = [point.street, point.houseNumber].map((s) => s.trim()).filter(Boolean).join(' ');
  return {
    firstName: form.firstName.trim(),
    surname: form.surname.trim(),
    addressLine1: street || point.name,
    addressLine2: null,
    addressLine3: null,
    city: point.city,
    county: null,
    zip: point.postalCode,
    country: form.country,
    servicePointId: point.id,
    servicePointCarrier: point.carrier,
    servicePointName: point.name,
  };
}
