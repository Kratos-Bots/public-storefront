import type { CheckoutForm } from '@/features/checkout/form-state.ts';
import { Field } from '@/features/checkout/Field.tsx';
import { CountrySelect } from '@/features/checkout/CountrySelect.tsx';
import { DIAL_CODES } from '@/lib/dial-codes.ts';
import fields from '@/features/checkout/Fields.module.css';
import classes from '@/features/checkout/steps/Steps.module.css';

export interface AddressStepProps {
  form: CheckoutForm;
  patch: (patch: Partial<CheckoutForm>) => void;
  errors: Record<string, string>;
  /** A quote error the address is responsible for — an unserviceable country, say. */
  notice?: string;
}

/**
 * Where the order goes. Changing the country re-prices the order, so it is the
 * one field on this step the summary reacts to immediately.
 *
 * Delivery is to an address only. The backend's storefront checkout pins every
 * quote to `deliveryMethod: 'home'` and strips service-point fields from the
 * submitted address, so a collection-point picker here would be inert.
 */
export function AddressStep({ form, patch, errors, notice }: AddressStepProps) {
  return (
    <div className={classes.step}>
      <p className={classes.blurb}>Where should we send it?</p>

      <Field
        label="Address line 1"
        value={form.addressLine1}
        onChange={(v) => patch({ addressLine1: v })}
        error={errors.addressLine1}
        autoComplete="address-line1"
        maxLength={255}
      />
      <Field
        label="Address line 2"
        value={form.addressLine2}
        onChange={(v) => patch({ addressLine2: v })}
        optional
        autoComplete="address-line2"
        maxLength={255}
      />

      <div className={fields.pair}>
        <Field
          label="City"
          value={form.city}
          onChange={(v) => patch({ city: v })}
          error={errors.city}
          autoComplete="address-level2"
          maxLength={100}
        />
        <Field
          label="ZIP / Postcode"
          value={form.zip}
          onChange={(v) => patch({ zip: v })}
          error={errors.zip}
          autoComplete="postal-code"
          maxLength={20}
        />
      </div>

      <Field
        label="County / Region"
        value={form.county}
        onChange={(v) => patch({ county: v })}
        optional
        autoComplete="address-level1"
        maxLength={100}
      />

      <CountrySelect
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
    </div>
  );
}
