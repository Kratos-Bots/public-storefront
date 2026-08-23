import { Button } from '@mantine/core';
import { Link, useParams } from 'react-router';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { Money } from '@/components/Money.tsx';
import { ApiError } from '@/lib/errors.ts';
import { formatDate, formatDateTime } from '@/lib/format.ts';
import {
  SHIPMENT_LABEL,
  SHIPMENT_TONE,
  orderStatusLabel,
  orderStatusTone,
  type Tone,
} from '@/features/order-status/status.ts';
import { StatusPill } from '@/features/account/StatusPill.tsx';
import { useOrder } from '@/features/account/queries.ts';
import type { OrderShipment } from '@/types/orders.ts';
import type { ShipmentStatus } from '@/types/public-order.ts';
import classes from '@/features/account/Account.module.css';

/** A gateway name is a machine word — give it back its spaces and let the type case it. */
function methodLabel(method: string): string {
  return method.replace(/[_-]+/g, ' ');
}

function paymentTone(status: string): Tone {
  if (status === 'completed') return 'success';
  if (status === 'failed' || status === 'cancelled' || status === 'expired') return 'danger';
  if (status === 'refunded') return 'muted';
  return 'default';
}

/** A shipment's status is a plain string on the wire; anything unmapped reads as shipped. */
function shipmentLabel(shipment: OrderShipment): string {
  return SHIPMENT_LABEL[shipment.status as ShipmentStatus] ?? 'Shipped';
}

function shipmentTone(shipment: OrderShipment): Tone {
  return SHIPMENT_TONE[shipment.status as ShipmentStatus] ?? 'default';
}

/**
 * One order, in full: what was bought, what it came to, every payment against
 * it, and every parcel out of it. Payment actions deliberately live on the
 * order's own public page — that page already owns paying, switching method and
 * submitting a crypto txid, and duplicating them here would be a second
 * implementation of the most consequential screen in the shop.
 */
export function OrderDetailPage() {
  const { ref } = useParams();
  const order = useOrder(ref);

  if (order.isPending) return <PageSkeleton inline />;

  if (order.isError) {
    const missing = order.error instanceof ApiError && order.error.status === 404;
    return (
      <EmptyState
        eyebrow="Order"
        title={missing ? "We can't find that order" : "We couldn't load that order"}
        description={
          missing
            ? 'It may belong to another account, or the reference may be wrong.'
            : 'The order is safe — this was a hiccup between your browser and us.'
        }
        action={
          missing ? (
            <Button component={Link} to="/account/orders" variant="default" size="sm">
              All orders
            </Button>
          ) : (
            <Button variant="default" size="sm" onClick={() => void order.refetch()}>
              Try again
            </Button>
          )
        }
      />
    );
  }

  const data = order.data;

  return (
    <div className={classes.body}>
      <Link to="/account/orders" className={classes.back}>
        ← All orders
      </Link>

      <div className={classes.detailHead}>
        <h2 className={classes.detailRef}>{data.reference}</h2>
        <StatusPill tone={orderStatusTone(data.status)}>{orderStatusLabel(data.status)}</StatusPill>
        <span className={classes.detailDate}>Placed {formatDate(data.createdAt)}</span>
      </div>

      {data.outstandingBalance > 0 ? (
        <p className={classes.band}>
          <span>Balance due</span>
          <span>
            <Money amount={data.outstandingBalance} />
          </span>
        </p>
      ) : null}

      <section className={classes.section} aria-label="Items">
        <div className={classes.sectionHead}>
          <h3 className={classes.sectionTitle}>Items</h3>
          <span className={classes.sectionNote}>
            {data.items.length} {data.items.length === 1 ? 'line' : 'lines'}
          </span>
        </div>
        <ul className={classes.items}>
          {data.items.map((item, i) => (
            <li key={`${item.name}-${i}`} className={classes.item}>
              <span className={classes.itemName}>{item.name}</span>
              <span className={classes.itemQty}>
                {item.quantity} × <Money amount={item.unitPrice} />
              </span>
              <span className={classes.itemTotal}>
                <Money amount={item.lineTotal} />
              </span>
            </li>
          ))}
        </ul>

        <div className={classes.row}>
          <span className={classes.rowLabel}>Subtotal</span>
          <span className={classes.rowFigure}>
            <Money amount={data.subtotal} />
          </span>
        </div>
        <div className={classes.row}>
          <span className={classes.rowLabel}>Shipping</span>
          <span className={classes.rowFigure}>
            <Money amount={data.shippingAmount} />
          </span>
        </div>
        {data.discountAmount > 0 ? (
          <div className={classes.row}>
            <span className={classes.rowLabel}>Discount</span>
            <span className={classes.rowFigure}>
              −<Money amount={data.discountAmount} />
            </span>
          </div>
        ) : null}
        <div className={`${classes.row} ${classes.grand}`}>
          <span className={classes.rowLabel}>Total</span>
          <span className={`${classes.rowFigure} ${classes.grandFigure}`}>
            <Money amount={data.totalAmount} />
          </span>
        </div>
      </section>

      {data.payments.length > 0 ? (
        <section className={classes.section} aria-label="Payments">
          <div className={classes.sectionHead}>
            <h3 className={classes.sectionTitle}>Payments</h3>
          </div>
          <ul className={classes.items}>
            {data.payments.map((payment, i) => (
              <li key={`${payment.method}-${payment.createdAt}-${i}`} className={classes.event}>
                <span className={classes.eventName}>{methodLabel(payment.method)}</span>
                <span className={classes.eventWhen}>{formatDateTime(payment.createdAt)}</span>
                <span className={classes.eventFigure}>
                  <Money amount={payment.amount} />
                </span>
                <span className={classes.eventStatus}>
                  <StatusPill tone={paymentTone(payment.status)}>{payment.status}</StatusPill>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.shipments.length > 0 ? (
        <section className={classes.section} aria-label="Parcels">
          <div className={classes.sectionHead}>
            <h3 className={classes.sectionTitle}>Parcels</h3>
            <span className={classes.sectionNote}>
              {data.shipments.length} {data.shipments.length === 1 ? 'parcel' : 'parcels'}
            </span>
          </div>
          <ul className={classes.items}>
            {data.shipments.map((shipment, i) => (
              <li key={`${shipment.trackingNumber ?? 'parcel'}-${i}`} className={classes.event}>
                <span className={classes.eventName}>{shipment.carrier ?? 'Parcel'}</span>
                <span className={classes.eventWhen}>
                  {shipment.trackingNumber ??
                    (shipment.shippedAt ? formatDate(shipment.shippedAt) : 'Awaiting dispatch')}
                </span>
                <span className={classes.eventStatus}>
                  <StatusPill tone={shipmentTone(shipment)}>{shipmentLabel(shipment)}</StatusPill>
                </span>
                {shipment.trackingStatusDescription ? (
                  <p className={classes.eventDetail}>{shipment.trackingStatusDescription}</p>
                ) : null}
                {shipment.trackingUrl ? (
                  <a
                    className={classes.tracking}
                    href={shipment.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Track this parcel
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.publicUrl ? (
        <>
          <a
            className={classes.cta}
            href={data.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open order page
          </a>
          <p className={classes.note}>
            The order page is where you pay, change payment method and follow the parcel — share it
            with us if you need help with this order.
          </p>
        </>
      ) : null}
    </div>
  );
}
