import { useMemo } from 'react';
import { Button } from '@mantine/core';
import { Link, useParams } from 'react-router';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { Money } from '@/components/Money.tsx';
import { ApiError } from '@/lib/errors.ts';
import { formatDate, formatDateTime } from '@/lib/format.ts';
import { lineFigures, otherDiscount } from '@/lib/promotions.ts';
import {
  SHIPMENT_TONE,
  shipmentLabelKey,
  orderStatusLabel,
  orderStatusTone,
  type Tone,
} from '@/features/order-status/status.ts';
import { StatusPill } from '@/features/account/StatusPill.tsx';
import { useOrder } from '@/features/account/queries.ts';
import { useText, type TextApi } from '@/text/runtime.tsx';
import { OrderFamily, type OrderData } from '@/builder/family-order.ts';
import type { FamilyValue, PartViewProps } from '@/builder/parts.ts';
import { defaultSlotRenders } from '@/builder/render.tsx';
import type { SlotRender } from '@/builder/define.ts';
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
function shipmentLabel(shipment: OrderShipment, t: TextApi['t']): string {
  const key = shipmentLabelKey(shipment.status);
  return key ? t(key) : t('account.order.shippedFallback');
}

function shipmentTone(shipment: OrderShipment): Tone {
  return SHIPMENT_TONE[shipment.status as ShipmentStatus] ?? 'default';
}

function BackLinkView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  return (
    <Link to="/account/orders" className={classes.back} {...styleAttrs}>
      {t('account.order.backToOrders')}
    </Link>
  );
}

function HeadingView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { order: data } = OrderFamily.useData();
  return (
    <div className={classes.detailHead} {...styleAttrs}>
      <h2 className={classes.detailRef}>{data.reference}</h2>
      <StatusPill tone={orderStatusTone(data.status)}>{orderStatusLabel(data.status, t)}</StatusPill>
      <span className={classes.detailDate}>{t('account.order.placed', { date: formatDate(data.createdAt) })}</span>
    </div>
  );
}

function BalanceView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { order: data } = OrderFamily.useData();
  if (!(data.outstandingBalance > 0)) return null;
  return (
    <p className={classes.band} {...styleAttrs}>
      <span>{t('account.order.balanceDue')}</span>
      <span>
        <Money amount={data.outstandingBalance} />
      </span>
    </p>
  );
}

function ItemsView({ styleAttrs }: PartViewProps) {
  const { t, tp } = useText();
  const { order: data } = OrderFamily.useData();
  // `discountAmount` includes the promotions; the discount row is what is left once they have their own.
  const promotions = (data.promotions ?? []).filter((p) => p.amount > 0);
  const other = otherDiscount(data.discountAmount, data.promotionDiscount);
  return (
    <section className={classes.section} aria-label={t('account.order.items')} {...styleAttrs}>
      <div className={classes.sectionHead}>
        <h3 className={classes.sectionTitle}>{t('account.order.items')}</h3>
        <span className={classes.sectionNote}>
          {tp('account.order.lines', data.items.length)}
        </span>
      </div>
      <ul className={classes.items}>
        {data.items.map((item, i) => {
          const promo = lineFigures(item.lineTotal, item.promotionDiscount);
          return (
            <li key={`${item.name}-${i}`} className={classes.item}>
              <span className={classes.itemName}>{item.name}</span>
              <span className={classes.itemQty}>
                {item.quantity} × <Money amount={item.unitPrice} />
              </span>
              <span className={classes.itemTotal}>
                {promo.discounted ? (
                  <>
                    <s className={classes.itemWas}><Money amount={item.lineTotal} /></s>
                    {promo.free ? <span className={classes.free}>{t('common.promo.free')}</span> : <Money amount={promo.net} />}
                  </>
                ) : (
                  <Money amount={item.lineTotal} />
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <div className={classes.row}>
        <span className={classes.rowLabel}>{t('common.totals.subtotal')}</span>
        <span className={classes.rowFigure}>
          <Money amount={data.subtotal} />
        </span>
      </div>
      <div className={classes.row}>
        <span className={classes.rowLabel}>{t('common.totals.shipping')}</span>
        <span className={classes.rowFigure}>
          <Money amount={data.shippingAmount} />
        </span>
      </div>
      {promotions.map((p, i) => (
        <div key={`${p.label}-${i}`} className={classes.row}>
          <span className={`${classes.rowLabel} ${classes.rowLabelWrap}`}>{p.label}</span>
          <span className={`${classes.rowFigure} ${classes.rowGood}`}>
            −<Money amount={p.amount} />
          </span>
        </div>
      ))}
      {other > 0 ? (
        <div className={classes.row}>
          <span className={classes.rowLabel}>{t('common.totals.discount')}</span>
          <span className={classes.rowFigure}>
            −<Money amount={other} />
          </span>
        </div>
      ) : null}
      <div className={`${classes.row} ${classes.grand}`}>
        <span className={classes.rowLabel}>{t('common.totals.total')}</span>
        <span className={`${classes.rowFigure} ${classes.grandFigure}`}>
          <Money amount={data.totalAmount} />
        </span>
      </div>
    </section>
  );
}

function PaymentsView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { order: data } = OrderFamily.useData();
  if (data.payments.length === 0) return null;
  return (
    <section className={classes.section} aria-label={t('account.order.payments')} {...styleAttrs}>
      <div className={classes.sectionHead}>
        <h3 className={classes.sectionTitle}>{t('account.order.payments')}</h3>
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
  );
}

function ParcelsView({ styleAttrs }: PartViewProps) {
  const { t, tp } = useText();
  const { order: data } = OrderFamily.useData();
  if (data.shipments.length === 0) return null;
  return (
    <section className={classes.section} aria-label={t('account.order.parcels')} {...styleAttrs}>
      <div className={classes.sectionHead}>
        <h3 className={classes.sectionTitle}>{t('account.order.parcels')}</h3>
        <span className={classes.sectionNote}>
          {tp('account.order.parcelCount', data.shipments.length)}
        </span>
      </div>
      <ul className={classes.items}>
        {data.shipments.map((shipment, i) => (
          <li key={`${shipment.trackingNumber ?? 'parcel'}-${i}`} className={classes.event}>
            <span className={classes.eventName}>{shipment.carrier ?? t('account.order.parcelFallback')}</span>
            <span className={classes.eventWhen}>
              {shipment.trackingNumber ??
                (shipment.shippedAt ? formatDate(shipment.shippedAt) : t('account.order.awaitingDispatch'))}
            </span>
            <span className={classes.eventStatus}>
              <StatusPill tone={shipmentTone(shipment)}>{shipmentLabel(shipment, t)}</StatusPill>
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
                {t('account.order.trackParcel')}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Two siblings (the link and its note): the part's style, if any, lands on the block's wrapper. */
function PageLinkView() {
  const { t } = useText();
  const { order: data } = OrderFamily.useData();
  if (!data.publicUrl) return null;
  return (
    <>
      <a
        className={classes.cta}
        href={data.publicUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-sf-part="button"
        data-variant="filled"
      >
        {t('account.order.openOrderPage')}
      </a>
      <p className={classes.note}>
        {t('account.order.orderPageNote')}
      </p>
    </>
  );
}

/** The order's views (spec §5.4): the v0.7.0 JSX of each piece. */
export const ORDER_VIEWS: FamilyValue<OrderData>['views'] = {
  OrderBackLink: BackLinkView, OrderHeading: HeadingView, OrderBalance: BalanceView, OrderItems: ItemsView,
  OrderPayments: PaymentsView, OrderParcels: ParcelsView, OrderPageLink: PageLinkView,
};

/**
 * One order, in full: what was bought, what it came to, every payment against
 * it, and every parcel out of it. Payment actions deliberately live on the
 * order's own public page — that page already owns paying, switching method and
 * submitting a crypto txid, and duplicating them here would be a second
 * implementation of the most consequential screen in the shop.
 *
 * The OrderDetail container: the query and its pending / error / not-found screens stay
 * here; the content slot holds the parts. Without slots the default arrangement is drawn.
 */
export function OrderDetailPage({ slots }: { slots?: { content: SlotRender } }) {
  const { t } = useText();
  const { ref } = useParams();
  const order = useOrder(ref);
  const legacy = useMemo(() => (slots ? null : defaultSlotRenders('OrderDetail', 'storefront', {}, 'account.order')), [slots]);
  const content = slots?.content ?? legacy!.content!;
  const value = useMemo(() => (order.data ? { data: { order: order.data }, views: ORDER_VIEWS } : null), [order.data]);

  if (order.isPending) return <PageSkeleton inline />;

  if (order.isError || !value) {
    const missing = order.error instanceof ApiError && order.error.status === 404;
    return (
      <EmptyState
        eyebrow={t('account.order.title')}
        title={missing ? t('account.order.notFoundTitle') : t('account.order.loadFailedTitle')}
        description={
          missing
            ? t('account.order.notFoundBody')
            : t('account.order.loadFailedBody')
        }
        action={
          missing ? (
            <Button component={Link} to="/account/orders" variant="default" size="sm">
              {t('account.order.allOrders')}
            </Button>
          ) : (
            <Button variant="default" size="sm" onClick={() => void order.refetch()}>
              {t('common.actions.tryAgain')}
            </Button>
          )
        }
      />
    );
  }

  return (
    <OrderFamily.Provider value={value}>
      {content({ className: classes.body })}
    </OrderFamily.Provider>
  );
}
