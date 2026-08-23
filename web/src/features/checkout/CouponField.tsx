import { useId, useState } from 'react';
import type { QuoteCoupon } from '@/types/checkout.ts';
import { Money } from '@/components/Money.tsx';
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
          aria-label="Coupon code"
          aria-invalid={error ? true : undefined}
          placeholder="Have a code?"
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
          {busy ? 'Checking' : 'Apply'}
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
        <span className={classes.label}>Discount</span>
        <div className={`${classes.applied} ${classes.rejected}`}>
          <span className={classes.code}>{code}</span>
          <span className={classes.rejectedNote}>{busy ? 'Checking…' : (error ?? 'Not applied')}</span>
          <button
            type="button"
            className={classes.remove}
            onClick={() => {
              setDraft('');
              setEntryOpen(false);
              onRemove();
            }}
          >
            Remove
          </button>
        </div>
      </div>
    );
  }

  if (applied) {
    const saving = applied.discountAmount + applied.shippingDiscount;
    return (
      <div className={classes.field}>
        <span className={classes.label}>Discount</span>
        <div className={classes.applied}>
          <span className={classes.code}>{applied.code}</span>
          {saving > 0 ? (
            <span className={classes.saving}>
              −<Money amount={saving} />
            </span>
          ) : null}
          {applied.autoApplied ? (
            <>
              <span className={classes.auto}>Applied automatically</span>
              {!entryOpen ? (
                <button
                  type="button"
                  className={classes.remove}
                  onClick={() => setEntryOpen(true)}
                >
                  Use another
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
              Remove
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
        Coupon code
      </label>
      {entry}
    </div>
  );
}
