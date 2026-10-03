import { Field, SelectField } from '@/features/checkout/Field.tsx';
import { phoneCountryGroups, type CountryOption } from '@/features/auth/phone-countries.ts';
import { useText } from '@/text/runtime.tsx';

export interface PhoneEntryProps {
  /** ISO-3166-1 alpha-2 the picker is set to, or ''. */
  prefix: string;
  /** The national number as typed. */
  phone: string;
  /** Countries that lead the list (the shop's). */
  preferred: readonly string[];
  countryError?: string;
  phoneError?: string;
  onPrefixChange: (iso: string) => void;
  onPhoneChange: (value: string) => void;
}

const optionLabel = (o: CountryOption) => `${o.name} (+${o.dial})`;

/** Country, then number: two full-width fields, the shop's countries first. Compose with `buildIdentifier` at submit. */
export function PhoneEntry({ prefix, phone, preferred, countryError, phoneError, onPrefixChange, onPhoneChange }: PhoneEntryProps) {
  const { t } = useText();
  const { suggested, rest } = phoneCountryGroups(preferred);
  const options = (list: CountryOption[]) => list.map((o) => <option key={o.iso} value={o.iso}>{optionLabel(o)}</option>);
  return (
    <>
      <SelectField label={t('auth.code.phone.country')} value={prefix} onChange={onPrefixChange} error={countryError} autoComplete="country">
        <option value="">{t('auth.code.phone.chooseCountry')}</option>
        {suggested.length > 0 ? (
          <>
            <optgroup label={t('auth.code.phone.suggested')}>{options(suggested)}</optgroup>
            <optgroup label={t('auth.code.phone.allCountries')}>{options(rest)}</optgroup>
          </>
        ) : options(rest)}
      </SelectField>
      <Field label={t('auth.code.phone.number')} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={onPhoneChange} error={phoneError} />
    </>
  );
}
