// "Use the details from your last order?": every decision that needs no React. When the offer shows, what filling
// the form from it means, and how a dismissal is remembered.
import type { CheckoutForm } from '@/features/checkout/form-state.ts';
import { DIAL_CODES } from '@/lib/dial-codes.ts';
import type { LastCheckoutDetails } from '@/types/checkout.ts';
import type { ContactModes } from '@/types/settings.ts';

/** sessionStorage: the customer id that said "No thanks" in this tab. A reload or the next step does not ask again. */
export const DISMISS_KEY = 'sf-checkout-autofill-dismissed-v1';

export function readDismissed(): number | null {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    if (raw === null) return null;
    const id = Number(raw);
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}

export function writeDismissed(customerId: number): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, String(customerId));
  } catch {
    // ignore (storage blocked): the card still hides for as long as this page lives
  }
}

/** The fields a shopper types: the seeded `country` and `phonePrefix` defaults are not theirs and are ignored. */
const TYPED_FIELDS = ['firstName', 'surname', 'email', 'phone', 'addressLine1', 'addressLine2', 'addressLine3', 'city', 'county', 'zip'] as const;

/** Has the shopper (or a restored session of the form) put anything into the contact and address fields? */
export function formHasTyping(form: CheckoutForm): boolean {
  return TYPED_FIELDS.some((k) => form[k].trim() !== '') || form.servicePoint !== null;
}

export interface OfferInput {
  loggedIn: boolean;
  customerId: number | null;
  details: LastCheckoutDetails | null | undefined;
  form: CheckoutForm;
  /** Who said "No thanks" (sessionStorage), or null. */
  dismissedFor: number | null;
}

/** Signed in, there is an order to copy from, nothing typed yet, and not turned down in this tab. */
export function shouldOfferLastDetails({ loggedIn, customerId, details, form, dismissedFor }: OfferInput): boolean {
  return loggedIn && customerId !== null && !!details && dismissedFor !== customerId && !formHasTyping(form);
}

const dialCodes = [...new Set(Object.values(DIAL_CODES))];

/**
 * An E.164 number ("+447801234567") as the form holds it: the picker's country and the national digits, so that
 * `composePhoneNumber` joins them back to the same number. Only the calling code matters to the result, so any country
 * sharing it will do; the first of `hints` that has it is chosen so the picker reads naturally. Null when it cannot be
 * done with confidence: no leading "+", no known calling code, or a national part no phone can have.
 */
export function splitPhone(phone: string | null | undefined, hints: ReadonlyArray<string | null | undefined> = []): { prefix: string; national: string } | null {
  const trimmed = (phone ?? '').trim();
  if (!trimmed.startsWith('+')) return null;
  const digits = trimmed.replace(/\D/g, '');
  const dial = dialCodes.filter((d) => digits.startsWith(d)).sort((a, b) => b.length - a.length)[0];
  if (!dial) return null;
  const national = digits.slice(dial.length);
  if (national.length < 4 || national.length > 14) return null;
  const sharing = Object.keys(DIAL_CODES).filter((iso) => DIAL_CODES[iso] === dial);
  const prefix = hints.map((h) => (h ?? '').trim().toUpperCase()).find((h) => sharing.includes(h)) ?? sharing[0];
  return prefix ? { prefix, national } : null;
}

export interface ApplyContext {
  contactModes: ContactModes;
  /** The countries the shop delivers to (home list plus collection); empty = unknown, any country. */
  shipCountries: readonly string[];
  /** The shop's chosen warehouse delivers nowhere. */
  shipsNowhere: boolean;
  form: CheckoutForm;
}

/** Can the shop deliver to this country (an ISO alpha-2 code the form could hold)? */
export function isShippable(country: string, shipCountries: readonly string[], shipsNowhere: boolean): boolean {
  const iso = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso) || shipsNowhere) return false;
  return shipCountries.length === 0 || shipCountries.includes(iso);
}

/**
 * What choosing "Use these details" writes to the form (through `patch`, so delivery reconciliation and error clearing run).
 * Home delivery only: when the last order went to a collection point, its address lines are the point's, so only the name
 * and contact details are taken and the delivery method is left alone. A country the shop cannot deliver to is left as it
 * was; contact fields the shop hides are not filled; a phone that cannot be split confidently stays empty.
 */
export function lastDetailsPatch(details: LastCheckoutDetails, { contactModes, shipCountries, shipsNowhere, form }: ApplyContext): Partial<CheckoutForm> {
  const out: Partial<CheckoutForm> = {
    firstName: details.firstName.trim(),
    surname: details.surname.trim(),
  };
  if (contactModes.emailMode !== 'hidden' && details.email?.trim()) out.email = details.email.trim();
  if (contactModes.phoneMode !== 'hidden') {
    const split = splitPhone(details.phone, [form.phonePrefix, details.country, form.country, contactModes.defaultPhoneCountry]);
    if (split) Object.assign(out, { phonePrefix: split.prefix, phonePrefixTouched: true, phone: split.national });
  }
  if (details.servicePoint) return out;
  Object.assign(out, {
    addressLine1: details.addressLine1.trim(),
    addressLine2: details.addressLine2?.trim() ?? '',
    addressLine3: details.addressLine3?.trim() ?? '',
    city: details.city.trim(),
    county: details.county?.trim() ?? '',
    zip: details.zip.trim(),
  });
  if (isShippable(details.country, shipCountries, shipsNowhere)) out.country = details.country.trim().toUpperCase();
  return out;
}

/** The two lines the card shows: who, and where (a collection order shows what is taken instead of the point's address). */
export function offerSummary(details: LastCheckoutDetails): { name: string; address: string | null } {
  const name = [details.firstName, details.surname].map((s) => s.trim()).filter(Boolean).join(' ');
  if (details.servicePoint) return { name, address: null };
  const address = [details.addressLine1, details.addressLine2, details.addressLine3, details.city, details.county, details.zip, details.country]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(', ');
  return { name, address };
}
