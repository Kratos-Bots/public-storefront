import { type CSSProperties, type ReactNode } from 'react';
import { formatCountdown } from '@/lib/cutoffs.ts';
import { useCutoffInfo } from '@/lib/server-clock.ts';
import { useCoreOptions } from '@/templates/hooks.ts';
import classes from '@/features/notices/CutoffBar.module.css';

/** How long the meter takes to drain: the last 12 hours before a cut-off. */
const WINDOW_MS = 12 * 60 * 60 * 1000;
/** Under an hour the rail switches to the warning token. */
const URGENT_MS = 60 * 60 * 1000;

const DAY_LABEL: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

/**
 * The store's own wording (the `cutoffMessage` core option) with `{time}` and `{dispatch}`
 * swapped for the styled pieces the built-in sentence uses. Unknown braces stay as typed.
 */
export function fillCutoffMessage(message: string, time: ReactNode, dispatch: ReactNode): ReactNode[] {
  return message.split(/(\{time\}|\{dispatch\})/).map((part, i) =>
    part === '{time}' ? <span key={i}>{time}</span> : part === '{dispatch}' ? <span key={i}>{dispatch}</span> : part,
  );
}

/**
 * "Order by 15:00 for same day dispatch · 4h 12m left".
 *
 * The countdown is anchored to the server clock (`serverTime` captured against the
 * client clock at fetch time) so a visitor with a skewed device clock still sees the
 * real deadline. Renders nothing when no cut-off is scheduled, or when the store turned the
 * banner off (`showCutoffBar`); `cutoffMessage` rewords it and `showCutoffCountdown` drops the
 * time left and the meter.
 */
export function CutoffBar() {
  const { next } = useCutoffInfo();
  const { showCutoffBar, cutoffMessage, showCutoffCountdown } = useCoreOptions();
  if (!next || !showCutoffBar) return null;

  const time = (
    <time className={classes.time} dateTime={next.at.toISOString()}>
      {next.cutoff}
    </time>
  );
  const ships = <span className={classes.ships}>{next.shipsOn}</span>;

  const urgent = next.msRemaining <= URGENT_MS;
  const fill = showCutoffCountdown && next.isToday ? Math.min(next.msRemaining, WINDOW_MS) / WINDOW_MS : null;

  return (
    <section
      className={`${classes.rail} ${urgent ? classes.urgent : ''}`}
      aria-label="Dispatch cut-off"
      data-sf-part="cutoff"
    >
      <div className={classes.inner}>
        <p className={classes.line}>
          {next.isToday ? null : (
            <>
              <span className={classes.day}>{DAY_LABEL[next.day] ?? next.day}</span>
              {' · '}
            </>
          )}
          {cutoffMessage ? (
            fillCutoffMessage(cutoffMessage, time, ships)
          ) : (
            <>
              Order by {time} for {ships} dispatch
            </>
          )}
        </p>
        {showCutoffCountdown ? <span className={classes.left}>{formatCountdown(next.msRemaining)} left</span> : null}
      </div>
      {fill === null ? null : (
        <span className={classes.meter} style={{ '--fill': fill } as CSSProperties} aria-hidden />
      )}
    </section>
  );
}
