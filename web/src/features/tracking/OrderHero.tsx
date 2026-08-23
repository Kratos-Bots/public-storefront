import { formatDate } from '@/lib/format.ts';
import { orderStatusLabel } from '@/features/order-status/status.ts';
import { formatRelative, parcelLabel, parcelTone } from '@/features/tracking/status.ts';
import type { TrackingLookup } from '@/types/tracking.ts';
import classes from '@/features/tracking/Tracking.module.css';

export interface Fact {
  label: string;
  value: string;
}

/**
 * What the visitor came for, above the fold: one status headline, one line of
 * "and then what", and the handful of facts the payload actually knows.
 */
export function OrderHero({ data }: { data: TrackingLookup }) {
  const tracked = data.parcels.filter((p) => p.tracking?.outcome === 'ok');
  // Keyed on parcel count as well as resolved-tracking count. On resolved count
  // alone, a three-parcel order where two lookups failed and the third is
  // delivered would headline "Delivered" and hide the other two entirely.
  const single = data.parcels.length === 1 && tracked.length === 1 ? tracked[0]! : null;

  // One parcel → its own status leads. Several, or none resolved → the order
  // status leads. Never derived from the newest event: the server already
  // settles terminal states and dateless scans.
  const headline = single ? parcelLabel(single.tracking!.status) : orderStatusLabel(data.status);
  const tone = single ? parcelTone(single.tracking!.status) : 'neutral';

  const status = single?.tracking?.status ?? null;
  const lastScan = single?.tracking?.lastEventAt ?? null;
  const destination = single?.tracking?.destination ?? null;
  const deliveredAt = single?.tracking?.deliveredAt ?? null;
  const settled = status === 'DELIVERED' || status === 'RETURNED' || status === 'EXCEPTION';

  const subline = deliveredAt
    ? `Delivered ${formatDate(deliveredAt)}`
    : settled
      ? null
      : destination
        ? `Heading to ${destination.name ?? destination.code}`
        : data.parcels.length > 1
          ? `${data.parcels.length} parcels dispatched`
          : null;

  const facts: Fact[] = [
    { label: 'Placed', value: formatDate(data.createdAt) },
    { label: 'Items', value: String(data.itemCount) },
    ...(lastScan ? [{ label: 'Last scan', value: formatRelative(lastScan) }] : []),
    // Parcel count, not resolved-tracking count: a parcel whose lookup failed is
    // still a parcel, and under-reporting here is how a multi-parcel order ends
    // up looking like a single-parcel one.
    ...(data.parcels.length > 1 ? [{ label: 'Parcels', value: String(data.parcels.length) }] : []),
    ...(data.isPreorder ? [{ label: 'Type', value: 'Pre-order' }] : []),
  ];

  return (
    <section className={classes.hero} aria-label="Order tracking summary">
      <div className={classes.heroTop}>
        <p className={classes.heroRef}>
          Order <span className={classes.heroRefValue}>{data.reference}</span>
        </p>
        {/* Only while a parcel status is leading — otherwise this chip would
            repeat the headline word for word. */}
        {single ? (
          <span className={classes.pill} data-tone={tone}>
            {orderStatusLabel(data.status)}
          </span>
        ) : null}
      </div>

      <h1 className={classes.headline}>{headline}</h1>
      {subline ? <p className={classes.subline}>{subline}</p> : null}

      <FactGrid facts={facts} />
    </section>
  );
}

/**
 * Hairline-capped label/value cells, two across. An odd final cell spans the
 * width so the rules never stop halfway across the page.
 */
export function FactGrid({ facts }: { facts: Fact[] }) {
  const odd = facts.length % 2 === 1;
  return (
    <dl className={classes.facts}>
      {facts.map((f, i) => (
        <div
          key={f.label}
          className={odd && i === facts.length - 1 ? `${classes.fact} ${classes.factWide}` : classes.fact}
        >
          <dt className={classes.factLabel}>{f.label}</dt>
          <dd className={classes.factValue}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}
