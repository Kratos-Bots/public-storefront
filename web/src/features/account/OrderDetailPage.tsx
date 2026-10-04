import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@mantine/core';
import { Link, useParams } from 'react-router';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { Money } from '@/components/Money.tsx';
import { fetchPublicOrder } from '@/api/public-order.ts';
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
import { CancelOrder } from '@/features/order-status/CancelOrder.tsx';
import { invalidateAfterCancel } from '@/features/order-status/invalidate-after-cancel.ts';
import { PaymentSection } from '@/features/order-status/PaymentSection.tsx';
import { cancelView } from '@/features/order-status/cancel-state.ts';
import { paymentSignature, pollInterval, visibleCryptoPayments } from '@/features/order-status/payment-state.ts';
import { SupportLinks } from '@/features/order-status/SupportLinks.tsx';
import { publicOrderKey } from '@/features/order-status/queries.ts';
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
      {data.servicePoint ? <span className={classes.detailDate}>{t('account.order.collectFrom', { name: data.servicePoint.name })}</span> : null}
    </div>
  );
}

/**
 * What is owed, and the means to settle it. The payment section is the public
 * order page's own component, fed the same public order through the order's
 * access key, so paying, changing method and submitting a crypto transaction id
 * exist once in the shop. Without an access key (order links not configured, or
 * an older backend) only the figure shows, as before.
 */
function BalanceView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { order: data } = OrderFamily.useData();
  const queryClient = useQueryClient();
  const owed = data.outstandingBalance > 0;
  const accessKey = data.accessKey ?? null;

  // The same key and polling as the order page itself, so the two share one cache entry.
  const publicOrder = useQuery({
    queryKey: publicOrderKey(data.reference, accessKey ?? ''),
    queryFn: () => fetchPublicOrder(data.reference, accessKey!),
    enabled: owed && !!accessKey,
    retry: false,
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data ? pollInterval(query.state.data) : false),
    refetchIntervalInBackground: true,
  });

  // The payment section refreshes the public order itself; the account order (its payments list,
  // balance and cancel flags) has to follow when something it shows changed. Polling re-reads the
  // same order every few seconds, so only a changed signature counts, and the first one seen for a
  // reference is the initial load, which the account order already agrees with. Invalidating
  // ['order', ref] never touches the public query, so this cannot feed itself.
  const signature = publicOrder.data ? paymentSignature(publicOrder.data) : null;
  // Per reference, so going A, B, A still notices a change to A made while B was showing.
  const seen = useRef(new Map<string, string>());
  useEffect(() => {
    if (!signature) return;
    const last = seen.current.get(data.reference);
    seen.current.set(data.reference, signature);
    if (last === undefined || last === signature) return;
    void queryClient.invalidateQueries({ queryKey: ['order', data.reference] });
  }, [signature, queryClient, data.reference]);

  if (!owed) return null;

  const figures = (
    <>
      <span>{t('account.order.balanceDue')}</span>
      <span>
        <Money amount={data.outstandingBalance} />
      </span>
    </>
  );
  const loaded = accessKey ? publicOrder.data : undefined;
  // What PaymentSection would draw: a way to pay, or crypto payments to show.
  const payable = loaded && (loaded.payment?.canPay || visibleCryptoPayments(loaded).length > 0) ? loaded : null;
  const cancelShows = cancelView(data.canCancel, data.cancelBlockedBy);
  // A balance with no way to pay it online and nothing else saying why (so never beside a payment section).
  const payHelp =
    !payable && !!loaded && loaded.payment?.canPay === false && cancelShows !== 'contact' &&
    data.status !== 'cancelled' && data.status !== 'refunded' && loaded.status !== 'cancelled' && loaded.status !== 'refunded';
  // The old bare band when there is nothing under it to show.
  if (!payable && !payHelp && cancelShows === 'none') return <p className={classes.band} {...styleAttrs}>{figures}</p>;

  return (
    <div className={classes.balance} {...styleAttrs}>
      <p className={classes.band}>{figures}</p>
      {payable ? <PaymentSection order={payable} reference={data.reference} accessKey={accessKey!} /> : null}
      {payHelp ? (
        <div>
          <p className={classes.payHelp}>{t('account.order.payHelp')}</p>
          <SupportLinks />
        </div>
      ) : null}
      <CancelOrder
        key={data.reference}
        reference={data.reference}
        canCancel={data.canCancel}
        blockedBy={data.cancelBlockedBy}
        onCancelled={() => invalidateAfterCancel(queryClient, data.reference, accessKey)}
      />
    </div>
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
 * it, and every parcel out of it. While money is owed the balance part also
 * carries the order's payment actions, by rendering the public order page's own
 * PaymentSection through the order's access key: paying, switching method and
 * submitting a crypto txid still exist once in the shop.
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
