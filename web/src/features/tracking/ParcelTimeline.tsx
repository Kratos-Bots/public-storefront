import { formatStamp, partitionEvents } from '@/features/tracking/status.ts';
import type { TrackedEvent } from '@/types/tracking.ts';
import classes from '@/features/tracking/Tracking.module.css';

/**
 * The scan log as a spine: the newest scan at the top wearing the shop's "you
 * are here" mark, with a hairline running back down through the history.
 *
 * Dateless scans are placeholders rather than history, so they sit below the
 * spine as hollow, unconnected nodes instead of being threaded onto it.
 */
export function ParcelTimeline({ events }: { events: TrackedEvent[] }) {
  const { newestFirst, undated } = partitionEvents(events);
  const total = newestFirst.length + undated.length;
  if (total === 0) return null;

  return (
    <div className={classes.timeline}>
      <div className={classes.timelineHead}>
        <p className={classes.timelineTitle}>Scan history</p>
        <p className={classes.timelineCount}>
          {total} {total === 1 ? 'scan' : 'scans'}
        </p>
      </div>

      <ol className={classes.events}>
        {newestFirst.map((e, i) => (
          <Row key={`d-${i}`} event={e} latest={i === 0} connector={i < newestFirst.length - 1} />
        ))}
      </ol>

      {undated.length > 0 ? (
        <ol className={classes.eventsUndated}>
          {undated.map((e, i) => (
            <Row key={`u-${i}`} event={e} muted connector={i < undated.length - 1} />
          ))}
        </ol>
      ) : null}
    </div>
  );
}

interface RowProps {
  event: TrackedEvent;
  latest?: boolean;
  muted?: boolean;
  connector?: boolean;
}

function Row({ event, latest = false, muted = false, connector = false }: RowProps) {
  const text = [classes.eventText, latest ? classes.eventTextLatest : '', muted ? classes.eventTextMuted : '']
    .filter(Boolean)
    .join(' ');

  return (
    <li className={classes.event}>
      <span className={classes.mark} aria-hidden>
        {latest ? (
          <span className={classes.node}>
            <span className={classes.nodeCore} />
          </span>
        ) : (
          <span className={muted ? `${classes.dot} ${classes.dotOpen}` : classes.dot} />
        )}
        {connector ? <span className={classes.thread} /> : null}
      </span>

      <div className={classes.eventBody}>
        <p className={text}>{event.text}</p>
        <p className={classes.eventStamp}>
          {muted ? 'No timestamp' : formatStamp(event.occurredAt)}
          {event.place ? ` · ${event.place}` : ''}
        </p>
      </div>
    </li>
  );
}
