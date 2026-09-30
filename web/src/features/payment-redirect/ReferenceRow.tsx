import { useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from '@/components/icons.tsx';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/payment-redirect/PaymentRedirect.module.css';

export interface ReferenceRowProps {
  value: string;
  label?: string;
}

/**
 * The order reference, shown as a copyable row — the one thing worth carrying
 * into a support chat from any of these hand-off screens. The copy control is
 * a 44px target and the value is `user-select: all` for the browsers where
 * the clipboard API is unavailable.
 */
export function ReferenceRow({ value, label: labelProp }: ReferenceRowProps) {
  const { t } = useText();
  const label = labelProp ?? t('payment.reference.label');
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard (older browser, insecure context) — the value is selectable.
    }
  };

  return (
    <div className={classes.referenceRow}>
      <div className={classes.referenceBody}>
        <p className={classes.referenceLabel}>{label}</p>
        <p className={classes.referenceValue}>{value}</p>
      </div>
      <button
        type="button"
        className={copied ? `${classes.copyButton} ${classes.copyDone}` : classes.copyButton}
        onClick={() => void copy()}
        aria-label={copied ? t('order.copy.copiedNamed', { name: label }) : t('order.copy.copyNamed', { name: label.toLowerCase() })}
      >
        {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
        {copied ? t('common.actions.copied') : t('common.actions.copy')}
      </button>
    </div>
  );
}
