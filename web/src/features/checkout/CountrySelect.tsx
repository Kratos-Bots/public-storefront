import { SelectField } from '@/features/checkout/Field.tsx';
import { DIAL_CODES } from '@/lib/dial-codes.ts';
import { compareNames, getFormatProfile, regionName } from '@/lib/format.ts';
import { useText } from '@/text/runtime.tsx';

export { regionName } from '@/lib/format.ts';

/**
 * The country roster. With no list from the shop (an older backend, or a shop
 * whose shipping is not set up) this is every ISO-3166-1 alpha-2 the app knows,
 * sorted by name; `DIAL_CODES` is the app's canonical ISO list and doubles as
 * that roster. With `settings.shipping.countries` the picker offers only those
 * (`allowedCountryOptions`). Either way the quote stays the authority: a
 * country that cannot be served still answers `422` and lands inline on this
 * step (STOREFRONT.md §3.5).
 */
const optionsByLocale = new Map<string, Array<{ iso: string; name: string }>>();
export function countryOptions(): Array<{ iso: string; name: string }> {
  // Names depend on the regions locale, their order on the collation — key on both (en + formatLocale
  // 'en' has the legacy regions but a different collation).
  const { regions, collation } = getFormatProfile();
  const k = `${(regions ?? []).join(',')}|${collation ?? ''}`;
  let list = optionsByLocale.get(k);
  if (!list) {
    list = Object.keys(DIAL_CODES).map((iso) => ({ iso, name: regionName(iso) })).sort((a, b) => compareNames(a.name, b.name));
    optionsByLocale.set(k, list);
  }
  return list;
}
/** v0.7.0 export, still read by dial-codes.test.ts; render paths call countryOptions(). */
export const COUNTRY_OPTIONS = countryOptions();

/** The shop's countries by name; an empty or missing list falls back to the full roster. */
export function allowedCountryOptions(allowed: readonly string[] | undefined): Array<{ iso: string; name: string }> {
  if (!allowed || allowed.length === 0) return countryOptions();
  return allowed.map((iso) => ({ iso, name: regionName(iso) })).sort((a, b) => compareNames(a.name, b.name));
}

export interface CountrySelectProps {
  value: string;
  onChange: (iso: string) => void;
  error?: string;
  label?: string;
  /** The shop's deliverable countries; empty or missing = every country. */
  allowed?: readonly string[];
}

export function CountrySelect({ value, onChange, error, label, allowed }: CountrySelectProps) {
  const { t } = useText();
  return (
    <SelectField
      label={label ?? t('checkout.address.country')}
      value={value}
      onChange={onChange}
      error={error}
      autoComplete="country"
    >
      <option value="" disabled>
        {t('checkout.address.chooseCountry')}
      </option>
      {allowedCountryOptions(allowed).map((c) => (
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
