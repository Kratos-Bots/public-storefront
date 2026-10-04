import type { CheckoutForm } from '@/features/checkout/form-state.ts';
import { DIAL_CODES } from '@/lib/dial-codes.ts';

const ISO2 = /^[A-Z]{2}$/;

/** `settings.shipping.countries` as clean ISO alpha-2 codes, first occurrence wins. Missing = empty = unknown. */
export function normaliseShipCountries(raw: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const entry of raw ?? []) {
    const iso = String(entry).trim().toUpperCase();
    if (ISO2.test(iso) && !out.includes(iso)) out.push(iso);
  }
  return out;
}

/**
 * The country the form should hold given where the shop delivers. An empty list
 * means the shop's countries are unknown, so nothing is changed. Otherwise a
 * country outside the list is dropped, and a shop with exactly one country has
 * it chosen for the shopper.
 */
export function reconcileCountry(country: string, allowed: readonly string[]): string {
  if (allowed.length === 0) return country;
  if (country && allowed.includes(country)) return country;
  return allowed.length === 1 ? allowed[0]! : '';
}

/** `reconcileCountry` applied to a form. Returns the same object when nothing changes, so it is safe in a state updater. */
export function applyShipCountries(form: CheckoutForm, allowed: readonly string[]): CheckoutForm {
  const country = reconcileCountry(form.country, allowed);
  if (country === form.country) return form;
  // A country chosen for the shopper carries the dial code with it, like one they pick themselves.
  const followPrefix = country && !form.phonePrefixTouched && !form.phonePrefix && DIAL_CODES[country];
  return { ...form, country, ...(followPrefix ? { phonePrefix: country } : {}) };
}
