import { useId } from 'react';
import { ErrorNote, OptionalTag } from '@/features/checkout/Field.tsx';
import { DIAL_CODES } from '@/lib/dial-codes.ts';
import { compareNames, getFormatProfile, regionName } from '@/lib/format.ts';
import classes from '@/features/checkout/Fields.module.css';
import { useText } from '@/text/runtime.tsx';

/**
 * Every dial code, not just the shop's shipping countries — a shopper's phone
 * country and their delivery country are independent (expats, gifts, forwarding
 * addresses). Memoised per format-profile regions and collation; the list itself never changes.
 */
type PrefixOption = { iso: string; name: string; dial: string };
const prefixByLocale = new Map<string, PrefixOption[]>();
export function prefixOptions(): PrefixOption[] {
  // Names depend on the regions locale, their order on the collation — key on both (en + formatLocale
  // 'en' has the legacy regions but a different collation).
  const { regions, collation } = getFormatProfile();
  const k = `${(regions ?? []).join(',')}|${collation ?? ''}`;
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
  /** Sign-in and profile forms: the delivery hint is checkout copy and is wrong there. */
  hideHint?: boolean;
  /** Countries to lead the picker (the shop's delivery countries). Empty or missing = one flat list. */
  suggested?: readonly string[];
  onPrefixChange: (iso: string) => void;
  onPhoneChange: (value: string) => void;
}

function PrefixOptions({ options }: { options: PrefixOption[] }) {
  return (
    <>
      {options.map((o) => (
        <option key={o.iso} value={o.iso}>
          {`+${o.dial}\u00a0\u00a0${o.name}`}
        </option>
      ))}
    </>
  );
}

/**
 * Dial code + national number in one frame. To the shopper it is a single field
 * that shows "+44" beside what they type; to the DOM it is a native select laid
 * invisibly over that prefix (a phone's own picker beats any listbox we could
 * draw) and a `tel` input. `composePhoneNumber` joins the two at submit, so
 * nothing here has to know a country's trunk-prefix rules: "07801…" and
 * "7801…" are both fine to type.
 */
export function PhoneField({
  prefix,
  phone,
  optional,
  error,
  hideHint,
  suggested,
  onPrefixChange,
  onPhoneChange,
}: PhoneFieldProps) {
  const { t } = useText();
  const id = useId();
  const noteId = `${id}-note`;
  const hint = error || hideHint ? undefined : t('checkout.phone.hint');

  const all = prefixOptions();
  const wanted = new Set((suggested ?? []).map((c) => c.trim().toUpperCase()));
  const top = (suggested ?? [])
    .map((c) => all.find((o) => o.iso === c.trim().toUpperCase()))
    .filter((o): o is PrefixOption => Boolean(o))
    .filter((o, i, list) => list.indexOf(o) === i);
  const rest = all.filter((o) => !wanted.has(o.iso));
  const dial = DIAL_CODES[prefix];

  return (
    <div className={classes.field}>
      <label className={classes.label} htmlFor={id}>
        {t('checkout.phone.label')}
        {optional ? <OptionalTag /> : null}
      </label>
      <div className={classes.phoneBox} data-sf-part="input" data-invalid={error ? 'true' : undefined}>
        <span className={classes.phoneCode}>
          <select
            className={classes.phoneSelect}
            name="tel-country"
            autoComplete="off"
            value={prefix}
            onChange={(e) => onPrefixChange(e.currentTarget.value)}
            aria-label={t('checkout.phone.codeAriaLabel')}
          >
            <option value="">{t('checkout.phone.code')}</option>
            {top.length > 0 ? (
              <>
                <optgroup label={t('auth.code.phone.suggested')}><PrefixOptions options={top} /></optgroup>
                {rest.length > 0 ? <optgroup label={t('auth.code.phone.allCountries')}><PrefixOptions options={rest} /></optgroup> : null}
              </>
            ) : (
              <PrefixOptions options={all} />
            )}
          </select>
          <span className={classes.phoneCodeText} data-phone-code aria-hidden>
            {dial ? `+${dial}` : t('checkout.phone.code')}
          </span>
          <span className={classes.phoneCaret} aria-hidden />
        </span>
        <input
          id={id}
          name="tel"
          data-optional={optional ? 'true' : undefined}
          className={classes.phoneInput}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => onPhoneChange(e.currentTarget.value)}
          aria-label={t('checkout.phone.label')}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? noteId : undefined}
        />
      </div>
      {error ? (
        <ErrorNote id={noteId} error={error} />
      ) : hint ? (
        <p id={noteId} className={classes.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
