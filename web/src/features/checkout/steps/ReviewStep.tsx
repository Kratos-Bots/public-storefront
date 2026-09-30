import type { CryptoOption, PaymentMethod, Quote } from '@/types/checkout.ts';
import type { CheckoutForm } from '@/features/checkout/form-state.ts';
import { countryName } from '@/features/checkout/CountrySelect.tsx';
import { TextareaField } from '@/features/checkout/Field.tsx';
import { composePhoneNumber } from '@/lib/dial-codes.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/checkout/steps/Steps.module.css';

export const NOTES_MAX = 500;

export interface ReviewStepProps {
  form: CheckoutForm;
  patch: (patch: Partial<CheckoutForm>) => void;
  quote: Quote | undefined;
  method: PaymentMethod | undefined;
  combo: CryptoOption | null;
  /** Jump back to a step to change what it holds. */
  onEdit: (step: number) => void;
}

/**
 * The last look. Every slip states what was chosen and offers the way back to
 * the step that set it — the figures live in the docket beside this, so nothing
 * here repeats them.
 */
export function ReviewStep({ form, patch, quote, method, combo, onEdit }: ReviewStepProps) {
  const { t } = useText();
  const shipping = quote?.shippingOptions.find((o) => o.id === form.shippingOptionId);
  const phone = composePhoneNumber(form.phonePrefix, form.phone);

  return (
    <div className={classes.step}>
      <p className={classes.blurb}>{t('checkout.review.blurb')}</p>

      <div className={classes.recap}>
        <div className={classes.slip}>
          <p className={classes.slipHead}>
            {t('checkout.steps.contact')}
            <button type="button" className={classes.slipEdit} onClick={() => onEdit(0)}>
              {t('checkout.review.change')}
            </button>
          </p>
          <p className={classes.slipBody}>
            {form.firstName} {form.surname}
            {form.email ? <span>{form.email}</span> : null}
            {phone ? <span>{phone}</span> : null}
          </p>
        </div>

        <div className={classes.slip}>
          <p className={classes.slipHead}>
            {t('checkout.steps.addressTitle')}
            <button type="button" className={classes.slipEdit} onClick={() => onEdit(1)}>
              {t('checkout.review.change')}
            </button>
          </p>
          <p className={classes.slipBody}>
            {form.addressLine1}
            {form.addressLine2 ? <span>{form.addressLine2}</span> : null}
            <span>
              {form.city}
              {form.county ? `, ${form.county}` : ''} {form.zip}
            </span>
            <span>{countryName(form.country)}</span>
          </p>
        </div>

        <div className={classes.slip}>
          <p className={classes.slipHead}>
            {t('checkout.steps.shipping')}
            <button type="button" className={classes.slipEdit} onClick={() => onEdit(2)}>
              {t('checkout.review.change')}
            </button>
          </p>
          <p className={classes.slipBody}>
            {shipping ? shipping.name : t('checkout.review.notChosen')}
            {shipping?.courier ? <span>{shipping.courier}</span> : null}
          </p>
        </div>

        <div className={classes.slip}>
          <p className={classes.slipHead}>
            {t('checkout.steps.payment')}
            <button type="button" className={classes.slipEdit} onClick={() => onEdit(3)}>
              {t('checkout.review.change')}
            </button>
          </p>
          <p className={classes.slipBody}>
            {method ? method.displayName : quote?.amountDue === 0 ? t('common.totals.storeCredit') : t('checkout.review.notChosen')}
            {combo ? (
              <span>
                {combo.coinLabel} · {combo.networkLabel}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <TextareaField
        label={t('checkout.review.notes')}
        value={form.notes}
        onChange={(v) => patch({ notes: v })}
        optional
        maxLength={NOTES_MAX}
        placeholder={t('checkout.review.notesPlaceholder')}
        hint={`${form.notes.length} / ${NOTES_MAX}`}
      />
    </div>
  );
}
