import { useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from '@/components/icons.tsx';
import classes from '@/features/order-status/OrderStatus.module.css';

export interface CopyRowProps {
  label: string;
  /** What the customer reads. */
  value: string;
  /** What lands on the clipboard, when that differs from what is shown. */
  copyValue?: string;
}

/**
 * A value the customer has to carry into another app — a deposit address, an
 * exact amount, a tracking number, a sort code. Copying is the whole point of
 * the row, so the control is a 44 px target and the value is `user-select: all`
 * for the browsers where the clipboard is unavailable.
 */
export function CopyRow({ label, value, copyValue }: CopyRowProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyValue ?? value);
      setCopied(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard (older browser, insecure context) — the value is selectable.
    }
  };

  return (
    <div className={classes.copyRow}>
      <div className={classes.copyBody}>
        <p className={classes.copyLabel}>{label}</p>
        <p className={classes.copyValue}>{value}</p>
      </div>
      <button
        type="button"
        className={copied ? `${classes.copyButton} ${classes.copyDone}` : classes.copyButton}
        onClick={() => void copy()}
        aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
      >
        {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
