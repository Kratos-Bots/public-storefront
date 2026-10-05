import { useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from '@/components/icons.tsx';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/order-status/OrderStatus.module.css';

export interface CopyRowProps {
  label: string;
  /** What the customer reads. */
  value: string;
  /** What lands on the clipboard, when that differs from what is shown. */
  copyValue?: string;
  /** Draws the row as that numbered step of a sequence. */
  step?: number;
  /**
   * Shows the value in fixed groups of this many characters, so a long run (a wallet address) wraps between groups
   * into even lines instead of leaving a short tail. The clipboard and assistive technology still get the raw value.
   */
  groupBy?: number;
}

function groupsOf(value: string, size: number): string[] {
  const groups: string[] = [];
  for (let i = 0; i < value.length; i += size) groups.push(value.slice(i, i + size));
  return groups;
}

/**
 * A value the customer has to carry into another app — a deposit address, an
 * exact amount, a tracking number, a sort code. Copying is the whole point of
 * the row, so the control is a 44 px target and the value is `user-select: all`
 * for the browsers where the clipboard is unavailable.
 */
export function CopyRow({ label, value, copyValue, step, groupBy }: CopyRowProps) {
  const { t } = useText();
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
    <div className={step ? `${classes.copyRow} ${classes.copyStep}` : classes.copyRow}>
      {step ? <span className={classes.stepNum} aria-hidden>{step}</span> : null}
      <div className={classes.copyBody}>
        <p className={classes.copyLabel}>{label}</p>
        {groupBy ? (
          <p className={`${classes.copyValue} ${classes.copyGrouped}`}>
            <span className={classes.rawValue}>{value}</span>
            <span aria-hidden>
              {groupsOf(value, groupBy).map((group, i) => <span key={i} className={classes.copyGroup}>{group}</span>)}
            </span>
          </p>
        ) : (
          <p className={classes.copyValue}>{value}</p>
        )}
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
