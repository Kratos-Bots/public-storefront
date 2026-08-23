import { SelectField } from '@/features/checkout/Field.tsx';
import { DIAL_CODES } from '@/lib/dial-codes.ts';

/**
 * Built once, at module scope, behind a try/catch: `Intl.DisplayNames` is absent
 * on a few old WebViews and throws on construction there. A throw here would take
 * the whole checkout chunk down at import time, before any error boundary exists
 * — so a missing formatter degrades to bare ISO codes instead.
 */
const regionDisplay: Intl.DisplayNames | null = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();

/** Country name for an ISO-3166-1 alpha-2 code, falling back to the code itself. */
export function regionName(iso: string): string {
  try {
    return regionDisplay?.of(iso) ?? iso;
  } catch {
    return iso;
  }
}

/**
 * Every ISO-3166-1 alpha-2 the app knows, sorted by name. There is no
 * serviceable-countries endpoint on the storefront API, and pre-filtering the
 * list to a guess would hide a country the shop actually ships to; the quote
 * answers the question honestly instead — an unserviceable country comes back
 * as a `422` and lands inline on this step (STOREFRONT.md §3.5).
 *
 * `DIAL_CODES` is the app's canonical ISO list — it is deliberately unscoped
 * for exactly this reason, so it doubles as the country roster here.
 */
export const COUNTRY_OPTIONS = Object.keys(DIAL_CODES)
  .map((iso) => ({ iso, name: regionName(iso) }))
  .sort((a, b) => a.name.localeCompare(b.name));

export interface CountrySelectProps {
  value: string;
  onChange: (iso: string) => void;
  error?: string;
  label?: string;
}

export function CountrySelect({ value, onChange, error, label = 'Country' }: CountrySelectProps) {
  return (
    <SelectField
      label={label}
      value={value}
      onChange={onChange}
      error={error}
      autoComplete="country"
    >
      <option value="" disabled>
        Choose a country
      </option>
      {COUNTRY_OPTIONS.map((c) => (
        <option key={c.iso} value={c.iso}>
          {c.name}
        </option>
      ))}
    </SelectField>
  );
}

/** Country name for a code, for prose like "We can't ship to Norway yet". */
export function countryName(iso: string): string {
  return iso ? regionName(iso.toUpperCase()) : '';
}
