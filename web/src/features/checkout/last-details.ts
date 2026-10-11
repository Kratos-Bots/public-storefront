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

// One dismissal for every place the offer is mounted (the contact step and the address step), kept in memory as well as
// in sessionStorage so that it holds across the two steps even where storage is blocked.
let dismissedInMemory: number | null = null;
// Who accepted the offer in this checkout. Memory only: it is not a "No thanks", so a reload or the next checkout asks again.
let acceptedInMemory: number | null = null;
const dismissListeners = new Set<() => void>();

/**
 * Is the card done for this customer: did they say "No thanks" (this page's memory, or sessionStorage, which survives a
 * reload) or accept it in this checkout? Asked per customer, because the two slots are separate: one customer's
 * dismissal must not stand in for the next customer's acceptance on the same device.
 */
export function isHiddenFor(customerId: number | null): boolean {
  if (customerId === null) return false;
  return dismissedInMemory === customerId || acceptedInMemory === customerId || readDismissed() === customerId;
}

export function subscribeDismissed(listener: () => void): () => void {
  dismissListeners.add(listener);
  return () => dismissListeners.delete(listener);
}

/** "No thanks": remembered for this customer, and every mounted offer hides at once. */
export function dismissLastDetails(customerId: number): void {
  dismissedInMemory = customerId;
  writeDismissed(customerId);
  dismissListeners.forEach((l) => l());
}

/**
 * "Use these details": the card is done for this checkout on both steps, whether or not the order had anything to fill
 * (a collection-point order fills name and contact only and leaves the address empty, which would otherwise keep it showing).
 */
export function acceptLastDetails(customerId: number): void {
  acceptedInMemory = customerId;
  dismissListeners.forEach((l) => l());
}

/** The checkout page left: the next one may offer again. */
export function clearAcceptedLastDetails(): void {
  acceptedInMemory = null;
}

/** Forget the in-page dismissal (tests; sessionStorage is cleared by the caller). */
export function resetDismissed(): void {
  dismissedInMemory = null;
  acceptedInMemory = null;
  dismissListeners.forEach((l) => l());
}

/** The address part of the form. */
const ADDRESS_FIELDS = ['addressLine1', 'addressLine2', 'addressLine3', 'city', 'county', 'zip'] as const;

/**
 * Has anything been put into the address (or a collection point chosen)? Only the address decides whether the offer
 * shows: the checkout restores a saved draft, so a name, email or phone is usually already there and says nothing about
 * whether the shopper has dealt with the address. The seeded `country` and `phonePrefix` defaults are not theirs.
 */
export function addressHasTyping(form: CheckoutForm): boolean {
  return ADDRESS_FIELDS.some((k) => form[k].trim() !== '') || form.servicePoint !== null;
}

export interface OfferInput {
  loggedIn: boolean;
  customerId: number | null;
  details: LastCheckoutDetails | null | undefined;
  form: CheckoutForm;
  /** Who said "No thanks" (sessionStorage), or null. */
  dismissedFor: number | null;
}

/** Signed in, there is an order to copy from, the address is still empty, and not turned down in this tab. */
export function shouldOfferLastDetails({ loggedIn, customerId, details, form, dismissedFor }: OfferInput): boolean {
  return loggedIn && customerId !== null && !!details && dismissedFor !== customerId && !addressHasTyping(form);
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
  const blank = (k: keyof CheckoutForm): boolean => String(form[k] ?? '').trim() === '';
  const out: Partial<CheckoutForm> = {};
  if (blank('firstName')) out.firstName = details.firstName.trim();
  if (blank('surname')) out.surname = details.surname.trim();
  if (blank('email') && contactModes.emailMode !== 'hidden' && details.email?.trim()) out.email = details.email.trim();
  if (blank('phone') && contactModes.phoneMode !== 'hidden') {
    const split = splitPhone(details.phone, [form.phonePrefix, details.country, form.country, contactModes.defaultPhoneCountry]);
    if (split) Object.assign(out, { phonePrefix: split.prefix, phonePrefixTouched: true, phone: split.national });
  }
  if (details.servicePoint) return out;
  // The offer only shows over an empty address, but the patch is blank-only on its own account: a typed value is never overwritten.
  const lines: Array<[(typeof ADDRESS_FIELDS)[number], string]> = [
    ['addressLine1', details.addressLine1.trim()],
    ['addressLine2', details.addressLine2?.trim() ?? ''],
    ['addressLine3', details.addressLine3?.trim() ?? ''],
    ['city', details.city.trim()],
    ['county', details.county?.trim() ?? ''],
    ['zip', details.zip.trim()],
  ];
  const addressEmpty = ADDRESS_FIELDS.every(blank);
  for (const [key, value] of lines) if (blank(key)) out[key] = value;
  if (addressEmpty && isShippable(details.country, shipCountries, shipsNowhere)) out.country = details.country.trim().toUpperCase();
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
