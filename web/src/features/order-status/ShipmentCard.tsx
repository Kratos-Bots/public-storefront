import { ArrowUpRightIcon } from '@/components/icons.tsx';
import { formatDate } from '@/lib/format.ts';
import { CopyRow } from '@/features/order-status/CopyRow.tsx';
import { SHIPMENT_LABEL, SHIPMENT_TONE, type Tone } from '@/features/order-status/status.ts';
import { FADE } from '@/lib/motion.ts';
import type { Shipment } from '@/types/public-order.ts';
import classes from '@/features/order-status/OrderStatus.module.css';

const PILL_TONE: Record<Tone, string | null> = {
  default: null,
  success: classes.pillSuccess,
  danger: classes.pillDanger,
  muted: classes.pillMuted,
};

export interface ShipmentCardProps {
  shipment: Shipment;
  index: number;
  count: number;
}

/** One parcel: who has it, where it is, and how to follow it. */
export function ShipmentCard({ shipment, index, count }: ShipmentCardProps) {
  const eyebrow = count > 1 ? `Parcel ${index + 1} of ${count}` : 'Parcel';
  const shipped = shipment.shippedAt ? formatDate(shipment.shippedAt) : null;
  const delivered = shipment.deliveredAt ? formatDate(shipment.deliveredAt) : null;
  const tone = PILL_TONE[SHIPMENT_TONE[shipment.status]];
  const dates = [shipped && `Shipped ${shipped}`, delivered && `Delivered ${delivered}`].filter(Boolean);

  return (
    <section className={`${classes.card} ${FADE}`} aria-label={eyebrow}>
      <div className={classes.cardHead}>
        <div className={classes.cardHeadBody}>
          <p className={classes.cardEyebrow}>{eyebrow}</p>
          <h2 className={classes.cardTitle}>{shipment.carrier ?? 'On its way'}</h2>
        </div>
        <span className={tone ? `${classes.pill} ${tone}` : classes.pill}>
          {SHIPMENT_LABEL[shipment.status]}
        </span>
      </div>

      {shipment.trackingStatusDescription ? (
        <p className={classes.cardNote}>{shipment.trackingStatusDescription}</p>
      ) : null}

      {shipment.trackingNumber ? (
        <CopyRow label="Tracking number" value={shipment.trackingNumber} />
      ) : null}

      {shipment.trackingUrl ? (
        <a
          className={`${classes.ghost} ${classes.ghostWide}`}
          href={shipment.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Track this parcel
          <ArrowUpRightIcon size={12} />
        </a>
      ) : null}

      {dates.length > 0 ? <p className={classes.cardFigure}>{dates.join(' · ')}</p> : null}
    </section>
  );
}
