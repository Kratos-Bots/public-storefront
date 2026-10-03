import { prefixOptions } from '@/features/checkout/PhoneField.tsx';
import type { StorefrontSettings } from '@/types/settings.ts';

export type CountryOption = ReturnType<typeof prefixOptions>[number];

export interface CountryGroups {
  /** The shop's countries, alphabetical. Empty when none is known. */
  suggested: CountryOption[];
  /** Everything else (or everything, when there are no suggestions). */
  rest: CountryOption[];
}

/** The shop's countries first, then the rest. Codes the dial-code table does not know are ignored. */
export function phoneCountryGroups(preferred: readonly string[]): CountryGroups {
  const wanted = new Set(preferred.map((c) => c.trim().toUpperCase()).filter(Boolean));
  const all = prefixOptions();
  const suggested = all.filter((o) => wanted.has(o.iso));
  return { suggested, rest: suggested.length === 0 ? all : all.filter((o) => !wanted.has(o.iso)) };
}

/**
 * Which countries lead the picker: the store's serviceable countries (`login.phone.countries`, possibly empty),
 * plus the shop's default phone country so it is on top even when that list is empty.
 */
export function preferredPhoneCountries(settings: Pick<StorefrontSettings, 'login' | 'contactModes'>): string[] {
  const fallback = settings.contactModes?.defaultPhoneCountry;
  return [...(settings.login.phone?.countries ?? []), ...(fallback ? [fallback] : [])];
}
