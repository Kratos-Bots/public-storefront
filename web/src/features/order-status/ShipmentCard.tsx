import { ArrowUpRightIcon } from '@/components/icons.tsx';
import { formatDate } from '@/lib/format.ts';
import { CopyRow } from '@/features/order-status/CopyRow.tsx';
import { SHIPMENT_TONE, shipmentLabelKey, type Tone } from '@/features/order-status/status.ts';
import { FADE } from '@/lib/motion.ts';
import { useText } from '@/text/runtime.tsx';
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
  const { t } = useText();
  const eyebrow = count > 1 ? t('common.shipment.parcelOf', { index: index + 1, count }) : t('order.shipment.parcel');
  const shipped = shipment.shippedAt ? formatDate(shipment.shippedAt) : null;
  const delivered = shipment.deliveredAt ? formatDate(shipment.deliveredAt) : null;
  const tone = PILL_TONE[SHIPMENT_TONE[shipment.status]];
  // An unknown status renders an empty pill, as it did before the text layer.
  const statusKey = shipmentLabelKey(shipment.status);
  const dates = [
    shipped && t('order.dates.shipped', { date: shipped }),
    delivered && t('common.dates.delivered', { date: delivered }),
  ].filter(Boolean);

  return (
    <section className={`${classes.card} ${FADE}`} aria-label={eyebrow} data-sf-part="card">
      <div className={classes.cardHead}>
        <div className={classes.cardHeadBody}>
          <p className={classes.cardEyebrow}>{eyebrow}</p>
          <h2 className={classes.cardTitle}>{shipment.carrier ?? t('order.shipment.untitled')}</h2>
        </div>
        <span className={tone ? `${classes.pill} ${tone}` : classes.pill}>
          {statusKey ? t(statusKey) : null}
        </span>
      </div>

      {shipment.trackingStatusDescription ? (
        <p className={classes.cardNote}>{shipment.trackingStatusDescription}</p>
      ) : null}

      {shipment.trackingNumber ? (
        <CopyRow label={t('common.shipment.trackingNumber')} value={shipment.trackingNumber} />
      ) : null}

      {shipment.trackingUrl ? (
        <a
          className={`${classes.ghost} ${classes.ghostWide}`}
          href={shipment.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('order.shipment.track')}
          <ArrowUpRightIcon size={12} />
        </a>
      ) : null}

      {dates.length > 0 ? <p className={classes.cardFigure}>{dates.join(' · ')}</p> : null}
    </section>
  );
}
