import { Field, SelectField } from '@/features/checkout/Field.tsx';
import { DIAL_CODES } from '@/lib/dial-codes.ts';
import { compareNames, getFormatProfile, regionName } from '@/lib/format.ts';
import classes from '@/features/checkout/Fields.module.css';

/**
 * Every dial code, not just the shop's shipping countries — a shopper's phone
 * country and their delivery country are independent (expats, gifts, forwarding
 * addresses). Memoised per format-profile locale; the list itself never changes.
 */
type PrefixOption = { iso: string; name: string; dial: string };
const prefixByLocale = new Map<string, PrefixOption[]>();
export function prefixOptions(): PrefixOption[] {
  const k = (getFormatProfile().regions ?? []).join(',');
  let list = prefixByLocale.get(k);
  if (!list) {
    list = Object.entries(DIAL_CODES)
      .map(([iso, dial]) => ({ iso, name: regionName(iso), dial }))
      .sort((a, b) => compareNames(a.name, b.name));
    prefixByLocale.set(k, list);
  }
  return list;
}

export interface PhoneFieldProps {
  /** ISO-3166-1 alpha-2 the dial-code picker is set to. */
  prefix: string;
  /** The national number as typed — never the composed `+CC…` value. */
  phone: string;
  optional: boolean;
  error?: string;
  onPrefixChange: (iso: string) => void;
  onPhoneChange: (value: string) => void;
}

/**
 * Dial code + national number. The two are one field to the shopper and two
 * controls to the DOM; `composePhoneNumber` puts them back together at submit,
 * so nothing here has to know a country's trunk-prefix rules.
 */
export function PhoneField({
  prefix,
  phone,
  optional,
  error,
  onPrefixChange,
  onPhoneChange,
}: PhoneFieldProps) {
  return (
    <div className={classes.phone}>
      <div className={classes.phoneCode}>
        <SelectField label="Phone country code" labelText="Code" value={prefix} onChange={onPrefixChange}>
          <option value="">Code</option>
          {prefixOptions().map((o) => (
            <option key={o.iso} value={o.iso}>
              {o.name} +{o.dial}
            </option>
          ))}
        </SelectField>
      </div>
      <div className={classes.phoneNumber}>
        <Field
          label="Phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={onPhoneChange}
          error={error}
          optional={optional}
          hint={error ? undefined : 'Couriers may use this for delivery.'}
        />
      </div>
    </div>
  );
}
