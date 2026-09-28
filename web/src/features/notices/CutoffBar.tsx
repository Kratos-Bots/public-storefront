import { type CSSProperties } from 'react';
import { formatCountdown } from '@/lib/cutoffs.ts';
import { useCutoffInfo } from '@/lib/server-clock.ts';
import classes from '@/features/notices/CutoffBar.module.css';

/** How long the meter takes to drain: the last 12 hours before a cut-off. */
const WINDOW_MS = 12 * 60 * 60 * 1000;
/** Under an hour the rail switches to the warning token. */
const URGENT_MS = 60 * 60 * 1000;

const DAY_LABEL: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

/**
 * "Order by 15:00 for same day dispatch · 4h 12m left".
 *
 * The countdown is anchored to the server clock (`serverTime` captured against the
 * client clock at fetch time) so a visitor with a skewed device clock still sees the
 * real deadline. Renders nothing when no cut-off is scheduled.
 */
export function CutoffBar() {
  const { next } = useCutoffInfo();
  if (!next) return null;

  const urgent = next.msRemaining <= URGENT_MS;
  const fill = next.isToday ? Math.min(next.msRemaining, WINDOW_MS) / WINDOW_MS : null;

  return (
    <section
      className={`${classes.rail} ${urgent ? classes.urgent : ''}`}
      aria-label="Dispatch cut-off"
    >
      <div className={classes.inner}>
        <p className={classes.line}>
          {next.isToday ? null : (
            <>
              <span className={classes.day}>{DAY_LABEL[next.day] ?? next.day}</span>
              {' · '}
            </>
          )}
          Order by{' '}
          <time className={classes.time} dateTime={next.at.toISOString()}>
            {next.cutoff}
          </time>{' '}
          for <span className={classes.ships}>{next.shipsOn}</span> dispatch
        </p>
        <span className={classes.left}>{formatCountdown(next.msRemaining)} left</span>
      </div>
      {fill === null ? null : (
        <span className={classes.meter} style={{ '--fill': fill } as CSSProperties} aria-hidden />
      )}
    </section>
  );
}
