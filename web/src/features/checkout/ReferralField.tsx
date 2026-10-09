import { useId } from 'react';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/checkout/CouponField.module.css';

export interface ReferralFieldProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * A friend's referral code, sitting under the coupon field and dressed like it. Nothing is checked
 * here: the backend applies the code after the order is placed and ignores one that is unknown, the
 * shopper's own, or arrives when they already have a referrer — so there is no Apply key and no error.
 */
export function ReferralField({ value, onChange }: ReferralFieldProps) {
  const { t } = useText();
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={classes.field}>
      <label className={classes.label} htmlFor={id}>
        {t('checkout.referral.label')}
      </label>
      <input
        id={id}
        name="referral-code"
        className={classes.input}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        aria-describedby={hintId}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={32}
      />
      <span id={hintId} className={classes.hint}>
        {t('checkout.referral.hint')}
      </span>
    </div>
  );
}
