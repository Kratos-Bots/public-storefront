import { useId, useState } from 'react';
import type { QuoteCoupon } from '@/types/checkout.ts';
import { Money } from '@/components/Money.tsx';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/checkout/CouponField.module.css';

export interface CouponFieldProps {
  /** What the quote says is on the order — `null` until one sticks. */
  applied: QuoteCoupon | null;
  /** The code the form is currently asking the quote to apply. */
  code: string;
  onApply: (code: string) => void;
  onRemove: () => void;
  /** A `404` reads as "Unknown code"; a `422` carries the coupon's own message. */
  error?: string;
  busy?: boolean;
}

/**
 * A discount code, applied by re-quoting — nothing is priced here. An
 * auto-applied coupon is the shop's own doing, so it is stated rather than
 * offered: there is no code to remove that the shopper ever typed, only the
 * option to try one of their own over the top.
 */
export function CouponField({ applied, code, onApply, onRemove, error, busy }: CouponFieldProps) {
  const { t } = useText();
  const id = useId();
  const [draft, setDraft] = useState('');
  const [entryOpen, setEntryOpen] = useState(false);

  const submit = () => {
    const next = draft.trim();
    if (next) onApply(next);
  };

  const entry = (
    <>
      <div className={classes.entry}>
        <input
          id={id}
          className={classes.input}
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            submit();
          }}
          aria-label={t('checkout.coupon.codeLabel')}
          aria-invalid={error ? true : undefined}
          placeholder={t('checkout.coupon.placeholder')}
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
        />
        <button
          type="button"
          className={classes.apply}
          onClick={submit}
          disabled={busy || draft.trim().length === 0}
        >
          {busy ? t('checkout.coupon.checking') : t('checkout.coupon.apply')}
        </button>
      </div>
      {error ? <span className={classes.error}>{error}</span> : null}
    </>
  );

  // A code the form is carrying that the quote came back without. Without this
  // row the code is invisible and unremovable — it sits in the persisted form and
  // fails every quote, which on a reload leaves the step with no shipping options
  // and no way out.
  if (!applied && code) {
    return (
      <div className={classes.field}>
        <span className={classes.label}>{t('checkout.coupon.discountLabel')}</span>
        <div className={`${classes.applied} ${classes.rejected}`}>
          <span className={classes.code}>{code}</span>
          <span className={classes.rejectedNote}>{busy ? t('common.status.checking') : (error ?? t('checkout.coupon.notApplied'))}</span>
          <button
            type="button"
            className={classes.remove}
            onClick={() => {
              setDraft('');
              setEntryOpen(false);
              onRemove();
            }}
          >
            {t('checkout.coupon.remove')}
          </button>
        </div>
      </div>
    );
  }

  if (applied) {
    const saving = applied.discountAmount + applied.shippingDiscount;
    return (
      <div className={classes.field}>
        <span className={classes.label}>{t('checkout.coupon.discountLabel')}</span>
        <div className={classes.applied}>
          <span className={classes.code}>{applied.code}</span>
          {saving > 0 ? (
            <span className={classes.saving}>
              −<Money amount={saving} />
            </span>
          ) : null}
          {applied.autoApplied ? (
            <>
              <span className={classes.auto}>{t('checkout.coupon.autoApplied')}</span>
              {!entryOpen ? (
                <button
                  type="button"
                  className={classes.remove}
                  onClick={() => setEntryOpen(true)}
                >
                  {t('checkout.coupon.useAnother')}
                </button>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              className={classes.remove}
              onClick={() => {
                setDraft('');
                setEntryOpen(false);
                onRemove();
              }}
            >
              {t('checkout.coupon.remove')}
            </button>
          )}
        </div>
        {entryOpen ? entry : null}
      </div>
    );
  }

  return (
    <div className={classes.field}>
      <label className={classes.label} htmlFor={id}>
        {t('checkout.coupon.codeLabel')}
      </label>
      {entry}
    </div>
  );
}
