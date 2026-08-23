import { useEffect, useState } from 'react';
import { RotateIcon } from '@/components/icons.tsx';
import { formatRelative, refreshReadyAt } from '@/features/tracking/status.ts';
import classes from '@/features/tracking/Tracking.module.css';

export interface RefreshButtonProps {
  /** When the courier network was last asked, from the lookup payload. */
  checkedAt: string | null;
  busy: boolean;
  onRefresh: () => void;
}

/**
 * How fresh the answer is, and the one control that makes it fresher.
 *
 * The countdown lives inside the button rather than up on the freshness line:
 * it is the answer to "why can't I press this", so it belongs where the press
 * happens. That costs two things, both handled here — the accessible name would
 * otherwise be a bare "7:42", and a disabled control would dim the one number
 * the visitor is trying to read.
 */
export function RefreshButton({ checkedAt, busy, onRefresh }: RefreshButtonProps) {
  const [now, setNow] = useState(() => Date.now());
  const readyAt = refreshReadyAt(checkedAt, now);
  const waiting = readyAt !== null;

  // Ticks once a second, and only while there is a countdown to run down.
  useEffect(() => {
    if (readyAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [readyAt]);

  const secs = readyAt === null ? 0 : Math.ceil((readyAt - now) / 1000);
  const countdown = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const counting = waiting && !busy;

  return (
    <div className={classes.refresh}>
      <p className={classes.refreshNote}>
        {checkedAt ? `Checked ${formatRelative(checkedAt, now)}` : 'Not checked yet'}
      </p>
      <button
        className={classes.ghost}
        type="button"
        onClick={onRefresh}
        disabled={waiting || busy}
        data-counting={counting ? 'true' : undefined}
        aria-label={counting ? `Refresh available in ${countdown}` : undefined}
      >
        <RotateIcon size={12} />
        {busy ? 'Checking…' : waiting ? countdown : 'Refresh'}
      </button>
    </div>
  );
}
