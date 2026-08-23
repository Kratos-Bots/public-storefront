import { useId } from 'react';
import type { Quote } from '@/types/checkout.ts';
import type { CheckoutForm } from '@/features/checkout/form-state.ts';
import { Money } from '@/components/Money.tsx';
import { CouponField } from '@/features/checkout/CouponField.tsx';
import { countryName } from '@/features/checkout/CountrySelect.tsx';
import fields from '@/features/checkout/Fields.module.css';
import classes from '@/features/checkout/steps/Steps.module.css';

export interface ShippingStepProps {
  quote: Quote | undefined;
  form: CheckoutForm;
  patch: (patch: Partial<CheckoutForm>) => void;
  errors: Record<string, string>;
  /** Busy while a quote is in the air — the coupon key waits on it. */
  busy: boolean;
  couponError?: string;
  /** A quote error this step is responsible for — an unavailable option, say. */
  notice?: string;
}

/**
 * How it travels, and any discount code. Both re-price the order, so this step
 * is where the docket does most of its moving.
 */
export function ShippingStep({
  quote,
  form,
  patch,
  errors,
  busy,
  couponError,
  notice,
}: ShippingStepProps) {
  const name = useId();
  const options = quote?.shippingOptions ?? [];

  return (
    <div className={classes.step}>
      <div className={classes.section}>
        <p className={classes.sectionHead}>
          Delivery
          <span className={classes.sectionRule} aria-hidden />
        </p>

        {!quote ? (
          <p className={classes.note}>Pricing your order…</p>
        ) : options.length === 0 ? (
          <p className={classes.note} data-tone="warn">
            We can&rsquo;t ship to {countryName(form.country) || 'that country'} yet. Choose another
            country, or message us and we&rsquo;ll sort it.
          </p>
        ) : (
          <div className={fields.choices}>
            {options.map((o) => (
              <label className={fields.choice} key={o.id}>
                <input
                  type="radio"
                  name={name}
                  checked={form.shippingOptionId === o.id}
                  onChange={() => patch({ shippingOptionId: o.id })}
                />
                <span className={fields.marker} aria-hidden />
                <span className={fields.choiceBody}>
                  <span className={fields.choiceName}>{o.name}</span>
                  {o.courier ? <span className={fields.choiceNote}>{o.courier}</span> : null}
                </span>
                <span
                  className={
                    o.freeShipping || o.price === 0
                      ? `${fields.choiceFigure} ${fields.choiceFree}`
                      : fields.choiceFigure
                  }
                >
                  {o.freeShipping || o.price === 0 ? 'Free' : <Money amount={o.price} />}
                </span>
              </label>
            ))}
          </div>
        )}

        {errors.shippingOptionId ? (
          <p className={classes.note} data-tone="danger">
            {errors.shippingOptionId}
          </p>
        ) : null}
        {notice ? (
          <p className={classes.note} data-tone="danger">
            {notice}
          </p>
        ) : null}
      </div>

      <div className={classes.section}>
        <CouponField
          applied={quote?.coupon ?? null}
          code={form.couponCode}
          busy={busy}
          error={couponError}
          onApply={(code) => patch({ couponCode: code })}
          onRemove={() => patch({ couponCode: '' })}
        />
      </div>
    </div>
  );
}
