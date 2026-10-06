import type { ReactNode } from 'react';
import type { StyleAttrs } from '@/builder/define.ts';
import type { StepKind } from '@/builder/family-checkout.ts';
import type { CryptoOption, PaymentMethod, Quote } from '@/types/checkout.ts';
import type { CheckoutForm } from '@/features/checkout/form-state.ts';
import { collectionAddress } from '@/features/checkout/collection-mode.ts';
import { countryName } from '@/features/checkout/CountrySelect.tsx';
import { displayPhoneNumber } from '@/lib/dial-codes.ts';
import { comboPhrase } from '@/features/checkout/crypto-groups.ts';
import { methodName } from '@/lib/method-name.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/checkout/steps/Steps.module.css';

export const NOTES_MAX = 500;

export interface ReviewStepProps {
  form: CheckoutForm;
  quote: Quote | undefined;
  method: PaymentMethod | undefined;
  combo: CryptoOption | null;
  /** The steps in the owner's order; the recap lists every one but review. */
  order: readonly StepKind[];
  /** Jump back to a step to change what it holds. */
  onEdit: (kind: StepKind) => void;
  /** Content slots of the step part: before everything, after everything. */
  before?: ReactNode;
  after?: ReactNode;
  rootAttrs?: StyleAttrs;
}

/**
 * The last look. Every slip states what was chosen and offers the way back to
 * the step that set it — the figures live in the docket beside this, so nothing
 * here repeats them.
 */
export function ReviewStep({ form, quote, method, combo, order, onEdit, before, after, rootAttrs }: ReviewStepProps) {
  const { t } = useText();
  const shipping = quote?.shippingOptions.find((o) => o.id === form.shippingOptionId);
  const phone = displayPhoneNumber(form.phonePrefix, form.phone);
  const collect = collectionAddress(form);

  const slips: Record<Exclude<StepKind, 'review'>, { head: 'checkout.steps.contact' | 'checkout.steps.addressTitle' | 'checkout.steps.shipping' | 'checkout.steps.payment'; body: ReactNode }> = {
    contact: {
      head: 'checkout.steps.contact',
      body: (
        <>
          {form.firstName} {form.surname}
          {form.email ? <span>{form.email}</span> : null}
          {phone ? <span>{phone}</span> : null}
        </>
      ),
    },
    address: {
      head: 'checkout.steps.addressTitle',
      body: collect ? (
        <>
          <span>{t('checkout.review.collectFrom')}</span>
          {collect.servicePointName}
          {collect.addressLine1 !== collect.servicePointName ? <span>{collect.addressLine1}</span> : null}
          <span>
            {collect.city} {collect.zip}
          </span>
          <span>{countryName(collect.country)}</span>
        </>
      ) : (
        <>
          {form.addressLine1}
          {form.addressLine2 ? <span>{form.addressLine2}</span> : null}
          {form.addressLine3 ? <span>{form.addressLine3}</span> : null}
          <span>
            {form.city}
            {form.county ? `, ${form.county}` : ''} {form.zip}
          </span>
          <span>{countryName(form.country)}</span>
        </>
      ),
    },
    shipping: {
      head: 'checkout.steps.shipping',
      body: (
        <>
          {shipping ? shipping.name : t('checkout.review.notChosen')}
          {shipping?.courier ? <span>{shipping.courier}</span> : null}
        </>
      ),
    },
    payment: {
      head: 'checkout.steps.payment',
      body: (
        <>
          {method ? methodName(method) : quote?.amountDue === 0 ? t('common.totals.storeCredit') : t('checkout.review.notChosen')}
          {combo ? (
            <span>
              {comboPhrase(t, combo)}
            </span>
          ) : null}
        </>
      ),
    },
  };

  return (
    <div className={classes.step} {...rootAttrs}>
      {before}
      <p className={classes.blurb}>{t('checkout.review.blurb')}</p>

      <div className={classes.recap}>
        {order
          .filter((kind): kind is Exclude<StepKind, 'review'> => kind !== 'review')
          .map((kind) => (
            <div className={classes.slip} key={kind}>
              <p className={classes.slipHead}>
                {t(slips[kind].head)}
                <button type="button" className={classes.slipEdit} onClick={() => onEdit(kind)}>
                  {t('checkout.review.change')}
                </button>
              </p>
              <p className={classes.slipBody}>{slips[kind].body}</p>
            </div>
          ))}
      </div>
      {after}
    </div>
  );
}
