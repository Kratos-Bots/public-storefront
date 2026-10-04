import type { ReactNode } from 'react';
import type { StyleAttrs } from '@/builder/define.ts';
import type { CheckoutForm } from '@/features/checkout/form-state.ts';
import { Field } from '@/features/checkout/Field.tsx';
import { CountrySelect } from '@/features/checkout/CountrySelect.tsx';
import { DIAL_CODES } from '@/lib/dial-codes.ts';
import { useText } from '@/text/runtime.tsx';
import fields from '@/features/checkout/Fields.module.css';
import classes from '@/features/checkout/steps/Steps.module.css';

export interface AddressStepProps {
  form: CheckoutForm;
  patch: (patch: Partial<CheckoutForm>) => void;
  errors: Record<string, string>;
  /** A quote error the address is responsible for — an unserviceable country, say. */
  notice?: string;
  /** Content slots of the step part: before everything, after everything. */
  before?: ReactNode;
  after?: ReactNode;
  rootAttrs?: StyleAttrs;
  /** Where the shop delivers; empty = every country. */
  countries?: readonly string[];
}

/**
 * Where the order goes. Changing the country re-prices the order, so it is the
 * one field on this step the summary reacts to immediately.
 *
 * Delivery is to an address only. The backend's storefront checkout pins every
 * quote to `deliveryMethod: 'home'` and strips service-point fields from the
 * submitted address, so a collection-point picker here would be inert.
 */
export function AddressStep({ form, patch, errors, notice, before, after, rootAttrs, countries }: AddressStepProps) {
  const { t } = useText();
  return (
    <div className={classes.step} {...rootAttrs}>
      {before}
      <p className={classes.blurb}>{t('checkout.address.blurb')}</p>

      <Field
        label={t('checkout.address.line1')}
        value={form.addressLine1}
        onChange={(v) => patch({ addressLine1: v })}
        error={errors.addressLine1}
        autoComplete="address-line1"
        maxLength={255}
      />
      <Field
        label={t('checkout.address.line2')}
        value={form.addressLine2}
        onChange={(v) => patch({ addressLine2: v })}
        optional
        autoComplete="address-line2"
        maxLength={255}
      />

      <div className={fields.pair}>
        <Field
          label={t('checkout.address.city')}
          value={form.city}
          onChange={(v) => patch({ city: v })}
          error={errors.city}
          autoComplete="address-level2"
          maxLength={100}
        />
        <Field
          label={t('checkout.address.zip')}
          value={form.zip}
          onChange={(v) => patch({ zip: v })}
          error={errors.zip}
          autoComplete="postal-code"
          maxLength={20}
        />
      </div>

      <Field
        label={t('checkout.address.county')}
        value={form.county}
        onChange={(v) => patch({ county: v })}
        optional
        autoComplete="address-level1"
        maxLength={100}
      />

      <CountrySelect
        allowed={countries}
        value={form.country}
        error={errors.country}
        onChange={(iso) =>
          patch({
            country: iso,
            // Track the delivery country onto the dial-code picker, but never
            // over a prefix the shopper set themselves.
            ...(!form.phonePrefixTouched && DIAL_CODES[iso] ? { phonePrefix: iso } : {}),
          })
        }
      />

      {notice ? (
        <p className={classes.note} data-tone="danger">
          {notice}
        </p>
      ) : null}
      {after}
    </div>
  );
}
