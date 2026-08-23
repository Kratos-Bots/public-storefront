import { Link } from 'react-router';
import type { ContactModes } from '@/types/settings.ts';
import type { CheckoutForm } from '@/features/checkout/form-state.ts';
import { Field } from '@/features/checkout/Field.tsx';
import { PhoneField } from '@/features/checkout/PhoneField.tsx';
import fields from '@/features/checkout/Fields.module.css';
import classes from '@/features/checkout/steps/Steps.module.css';

export interface ContactStepProps {
  form: CheckoutForm;
  patch: (patch: Partial<CheckoutForm>) => void;
  errors: Record<string, string>;
  contactModes: ContactModes;
  guest: boolean;
}

/**
 * Who the order is for and how to reach them. What is required is the shop's
 * call (`contactModes`), with one floor a guest can't go under: with no session
 * behind them, email or phone has to be there or the order has no identity at
 * all (STOREFRONT.md §3.5a).
 */
export function ContactStep({ form, patch, errors, contactModes, guest }: ContactStepProps) {
  const { emailMode, phoneMode } = contactModes;

  return (
    <div className={classes.step}>
      <p className={classes.blurb}>
        {emailMode !== 'hidden'
          ? 'Order updates and the receipt go to this email.'
          : 'Who is this order for?'}
      </p>

      <div className={fields.pair}>
        <Field
          label="First name"
          value={form.firstName}
          onChange={(v) => patch({ firstName: v })}
          error={errors.firstName}
          autoComplete="given-name"
          maxLength={100}
        />
        <Field
          label="Surname"
          value={form.surname}
          onChange={(v) => patch({ surname: v })}
          error={errors.surname}
          autoComplete="family-name"
          maxLength={100}
        />
      </div>

      {emailMode !== 'hidden' ? (
        <Field
          label="Email"
          type="email"
          inputMode="email"
          value={form.email}
          onChange={(v) => patch({ email: v })}
          error={errors.email}
          optional={emailMode === 'optional' && !guest}
          autoComplete="email"
          maxLength={255}
        />
      ) : null}

      {phoneMode !== 'hidden' ? (
        <PhoneField
          prefix={form.phonePrefix}
          phone={form.phone}
          optional={phoneMode === 'optional' && !guest}
          error={errors.phone}
          onPrefixChange={(iso) => patch({ phonePrefix: iso, phonePrefixTouched: true })}
          onPhoneChange={(v) => patch({ phone: v })}
        />
      ) : null}

      {guest ? (
        <p className={classes.aside}>
          Have an account?{' '}
          <Link className={classes.link} to="/login?returnTo=%2Fcheckout">
            Sign in
          </Link>{' '}
          to use your saved details and store credit.
        </p>
      ) : null}
    </div>
  );
}
