import { SelectField } from '@/features/checkout/Field.tsx';
import { DIAL_CODES } from '@/lib/dial-codes.ts';
import { compareNames, getFormatProfile, regionName } from '@/lib/format.ts';
import { useText } from '@/text/runtime.tsx';

export { regionName } from '@/lib/format.ts';

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

export interface CountrySelectProps {
  value: string;
  onChange: (iso: string) => void;
  error?: string;
  label?: string;
}

export function CountrySelect({ value, onChange, error, label }: CountrySelectProps) {
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
      {countryOptions().map((c) => (
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
