import type { ReactNode } from 'react';
import { ArrowUpRightIcon } from '@/components/icons.tsx';
import { CopyRow } from '@/features/order-status/CopyRow.tsx';
import { ParcelTimeline } from '@/features/tracking/ParcelTimeline.tsx';
import { ProgressStepper } from '@/features/tracking/ProgressStepper.tsx';
import { furthestStage, hasHandover, parcelLabel, parcelTone } from '@/features/tracking/status.ts';
import { staggerAnim } from '@/lib/motion.ts';
import type { TrackedParcel } from '@/types/tracking.ts';
import classes from '@/features/tracking/Tracking.module.css';

export interface ParcelCardProps {
  parcel: TrackedParcel;
  index: number;
  count: number;
  /** Ask the courier network again — the same forced re-read the Refresh control runs. */
  onRetry: () => void;
}

/**
 * One parcel: what it is called, where it has got to, and every scan behind it.
 *
 * No carrier is named at the top. The backend strips every carrier identity
 * except the destination-country one, so the parcel names itself and the
 * destination takes the line under it on a multi-parcel order — which is the one
 * case the hero cannot speak for.
 */
export function ParcelCard({ parcel, index, count, onRetry }: ParcelCardProps) {
  const t = parcel.tracking;
  const title = count > 1 ? `Parcel ${index + 1} of ${count}` : 'Parcel';
  const destination = count > 1 ? t?.destination ?? null : null;
  const tone = t?.outcome === 'ok' ? parcelTone(t.status) : 'neutral';
  const badge = t?.outcome === 'ok' ? parcelLabel(t.status) : null;
  // The local carrier only knows the parcel after handover; before that its page
  // reports "not found", so the link stays hidden.
  const lastMile = hasHandover(t) ? t?.lastMile ?? null : null;
  // The card's left spine. A stalled carrier lookup carries no badge but is
  // still worth flagging, so it borrows the warn tone.
  const spine = t?.outcome === 'error' ? 'warn' : tone;

  return (
    <section
      className={`${classes.card} ${staggerAnim(index).className}`}
      style={staggerAnim(index).style}
      data-tone={spine}
      aria-label={title}
    >
      <div className={classes.cardHead}>
        <div className={classes.cardHeadBody}>
          <h2 className={classes.cardTitle}>{title}</h2>
          {destination ? (
            <p className={classes.cardDest}>Heading to {destination.name ?? destination.code}</p>
          ) : null}
        </div>
        {badge ? (
          <span className={classes.pill} data-tone={tone}>
            {badge}
          </span>
        ) : null}
      </div>

      {/* Every number the customer might paste elsewhere, in one block. */}
      {parcel.trackingNumber || t?.courierNumber ? (
        <div className={classes.numbers}>
          {parcel.trackingNumber ? (
            <CopyRow label="Tracking number" value={parcel.trackingNumber} />
          ) : null}

          {t?.courierNumber && t.courierNumber !== parcel.trackingNumber ? (
            <div className={classes.refRow}>
              <p className={classes.refLabel}>Carrier ref</p>
              <p className={classes.refValue}>{t.courierNumber}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Multi-parcel: each card gets its own rail. A single-parcel order shows
          it once under the hero instead — the two gates partition on the same
          quantity by construction, so they can never both fire. */}
      {count > 1 && t?.outcome === 'ok' ? (
        <ProgressStepper stage={furthestStage(t.events)} failed={t.status === 'RETURNED'} />
      ) : null}

      {lastMile ? (
        <a
          className={`${classes.ghost} ${classes.ghostWide}`}
          href={lastMile.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Track with {lastMile.name}
          <ArrowUpRightIcon size={12} />
        </a>
      ) : null}

      {t?.outcome === 'ok' ? <ParcelTimeline events={t.events} /> : null}

      {t?.outcome === 'not_found' ? (
        <Note eyebrow="Awaiting first scan">
          The label exists but the courier hasn't scanned this parcel yet. That's normal for the
          first day or so after dispatch — check back later.
        </Note>
      ) : null}

      {t?.outcome === 'error' ? (
        <Note
          eyebrow="Carrier not responding"
          tone="warn"
          action={
            <button className={classes.ghost} type="button" onClick={onRetry}>
              Try again
            </button>
          }
        >
          The carrier isn't answering right now. Nothing is wrong with your parcel.
        </Note>
      ) : null}

      {/* No tracking payload at all, and the copy has to tell the two reasons
          apart: either this shipment has no tracking number yet (the row can
          exist before the label lands), or there is one and the courier network
          is unreachable. Telling a customer with no number to "search the number
          above" is the mistake worth not repeating. */}
      {!t ? (
        <Note eyebrow={parcel.trackingNumber ? 'Last known' : 'Awaiting tracking number'}>
          {parcel.fallbackDescription ??
            (parcel.trackingNumber
              ? 'Live tracking is unavailable right now. Search the tracking number above on your carrier’s website for the latest scan.'
              : 'This parcel doesn’t have a tracking number yet. One appears here as soon as the carrier issues it.')}
        </Note>
      ) : null}
    </section>
  );
}

export interface NoteProps {
  /** Names the situation in one micro-cap line. */
  eyebrow: string;
  tone?: 'warn';
  action?: ReactNode;
  children: ReactNode;
}

/** Hairline-separated footer note — the same shape for all three non-timeline outcomes. */
function Note({ eyebrow, tone, action, children }: NoteProps) {
  return (
    <div className={classes.note}>
      <p className={classes.noteEyebrow} data-tone={tone}>
        {eyebrow}
      </p>
      <p className={classes.noteText}>{children}</p>
      {action ? <div className={classes.noteAction}>{action}</div> : null}
    </div>
  );
}
