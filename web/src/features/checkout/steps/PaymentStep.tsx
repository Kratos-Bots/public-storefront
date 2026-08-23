import { useId } from 'react';
import type { Quote } from '@/types/checkout.ts';
import type { CheckoutForm } from '@/features/checkout/form-state.ts';
import { Money } from '@/components/Money.tsx';
import { CryptoComboPicker } from '@/features/checkout/CryptoComboPicker.tsx';
import fields from '@/features/checkout/Fields.module.css';
import classes from '@/features/checkout/steps/Steps.module.css';

export interface PaymentStepProps {
  quote: Quote | undefined;
  form: CheckoutForm;
  patch: (patch: Partial<CheckoutForm>) => void;
  errors: Record<string, string>;
  /** A guest has no customer row, so no balance to spend. */
  guest: boolean;
  currency: string;
}

/**
 * How it gets paid for. Every method carries the shop's own name for it and the
 * total that method would charge — a fee or a discount is part of the figure,
 * never a footnote. Crypto opens its combos underneath, because the network
 * changes the number too.
 */
export function PaymentStep({ quote, form, patch, errors, guest, currency }: PaymentStepProps) {
  const name = useId();
  const methods = quote?.paymentMethods ?? [];
  const balance = quote?.storeCredit.balance ?? 0;
  const chosen = methods.find((m) => m.method === form.paymentMethod);

  return (
    <div className={classes.step}>
      {!guest && balance > 0 ? (
        <label className={classes.toggle}>
          <input
            type="checkbox"
            checked={form.useStoreCredit}
            onChange={(e) => patch({ useStoreCredit: e.currentTarget.checked })}
            aria-label="Use store credit"
          />
          <span className={classes.toggleBox} aria-hidden />
          <span className={classes.toggleLabel}>Use store credit</span>
          <span className={classes.toggleFigure}>
            <Money amount={balance} /> available
          </span>
        </label>
      ) : null}

      {!quote ? (
        <p className={classes.note}>Pricing your order…</p>
      ) : quote.amountDue === 0 ? (
        <p className={classes.note} data-tone="success">
          Nothing left to pay — store credit covers this order.
        </p>
      ) : methods.length === 0 ? (
        <p className={classes.note} data-tone="warn">
          No payment method is available right now. Message us and we&rsquo;ll take it from here.
        </p>
      ) : (
        <div className={classes.section}>
          <p className={classes.sectionHead}>
            Payment method
            <span className={classes.sectionRule} aria-hidden />
          </p>

          <div className={fields.choices}>
            {methods.map((m) => (
              <div key={m.method}>
                <label className={fields.choice}>
                  <input
                    type="radio"
                    name={name}
                    checked={form.paymentMethod === m.method}
                    onChange={() =>
                      patch({
                        paymentMethod: m.method,
                        // A method switch drops any combo picked under the old one.
                        coin: '',
                        network: '',
                      })
                    }
                  />
                  <span className={fields.marker} aria-hidden />
                  <span className={fields.choiceBody}>
                    <span className={fields.choiceName}>{m.displayName}</span>
                    {m.feeRateText ? (
                      <span className={fields.choiceNote}>
                        {m.feeLabel || 'Fee'} {m.feeRateText}
                      </span>
                    ) : null}
                  </span>
                  <span className={fields.choiceFigure}>
                    <Money amount={m.chargeTotal} />
                  </span>
                </label>

                {m.cryptoOptions && form.paymentMethod === m.method ? (
                  <div className={classes.subPicker}>
                    <CryptoComboPicker
                      options={m.cryptoOptions}
                      value={form.coin && form.network ? { coin: form.coin, network: form.network } : null}
                      onChange={(combo) => patch({ coin: combo.coin, network: combo.network })}
                      currency={currency}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {errors.method ? (
            <p className={classes.note} data-tone="danger">
              {errors.method}
            </p>
          ) : null}
          {errors.coin ? (
            <p className={classes.note} data-tone="danger">
              {errors.coin}
            </p>
          ) : null}

          {chosen?.type === 'offline' ? (
            <p className={classes.aside}>
              We&rsquo;ll send the transfer details once the order is placed.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
