import { useId, type ReactNode } from 'react';
import type { StyleAttrs } from '@/builder/define.ts';
import type { Quote } from '@/types/checkout.ts';
import type { CheckoutForm } from '@/features/checkout/form-state.ts';
import { Money } from '@/components/Money.tsx';
import { countryName } from '@/features/checkout/CountrySelect.tsx';
import { useText } from '@/text/runtime.tsx';
import fields from '@/features/checkout/Fields.module.css';
import classes from '@/features/checkout/steps/Steps.module.css';

export interface ShippingStepProps {
  quote: Quote | undefined;
  form: CheckoutForm;
  patch: (patch: Partial<CheckoutForm>) => void;
  errors: Record<string, string>;
  /** A quote error this step is responsible for — an unavailable option, say. */
  notice?: string;
  /** Content slots of the step part: before everything, after everything. */
  before?: ReactNode;
  after?: ReactNode;
  rootAttrs?: StyleAttrs;
}

/**
 * How it travels. The discount code is its own part (CheckoutCoupon), by default
 * in this step's `after` slot.
 */
export function ShippingStep({
  quote,
  form,
  patch,
  errors,
  notice,
  before,
  after,
  rootAttrs,
}: ShippingStepProps) {
  const { t, msg } = useText();
  const name = useId();
  const options = quote?.shippingOptions ?? [];

  return (
    <div className={classes.step} {...rootAttrs}>
      {before}
      <div className={classes.section}>
        <p className={classes.sectionHead}>
          {t('checkout.shipping.heading')}
          <span className={classes.sectionRule} aria-hidden />
        </p>

        {!quote ? (
          <p className={classes.note}>{t('checkout.quote.pricing')}</p>
        ) : options.length === 0 ? (
          <p className={classes.note} data-tone="warn">
            {t('checkout.shipping.unserviceable', {
              country: countryName(form.country) || t('checkout.shipping.thatCountry'),
            })}
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
                  {o.freeShipping || o.price === 0 ? t('checkout.shipping.free') : <Money amount={o.price} />}
                </span>
              </label>
            ))}
          </div>
        )}

        {errors.shippingOptionId ? (
          <p className={classes.note} data-tone="danger">
            {msg(errors.shippingOptionId)}
          </p>
        ) : null}
        {notice ? (
          <p className={classes.note} data-tone="danger">
            {notice}
          </p>
        ) : null}
      </div>

      {after}
    </div>
  );
}
