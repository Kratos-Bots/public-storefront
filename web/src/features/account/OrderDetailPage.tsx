import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@mantine/core';
import { Link, useParams } from 'react-router';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { Money } from '@/components/Money.tsx';
import { ArrowLeftIcon } from '@/components/icons.tsx';
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
import { paymentSignature } from '@/features/order-status/payment-state.ts';
import { countryName } from '@/features/checkout/CountrySelect.tsx';
import { OrderPaymentCard, type PaymentRead } from '@/features/account/OrderPaymentCard.tsx';
import { silentParts, partitionOrderItems, sideDraws } from '@/features/account/order-layout.ts';
import { StatusPill } from '@/features/account/StatusPill.tsx';
import { useOrder, useOrderPayment } from '@/features/account/queries.ts';
import { textKey, useText, type TextApi } from '@/text/runtime.tsx';
import { OrderFamily, type OrderData, type OrderPreview } from '@/builder/family-order.ts';
import { usePreviewFixture } from '@/builder/mode.ts';
import type { FamilyValue, PartViewProps } from '@/builder/parts.ts';
import { defaultSlotRenders, renderComponent } from '@/builder/render.tsx';
import type { BlockRenderContext, SlotRender } from '@/builder/define.ts';
import type { OrderShipment } from '@/types/orders.ts';
import type { ShipmentStatus } from '@/types/public-order.ts';
import classes from '@/features/account/OrderDetail.module.css';

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

const PAYMENT_STATUS = {
  pending: textKey('account.order.paymentStatus.pending'),
  completed: textKey('account.order.paymentStatus.completed'),
  failed: textKey('account.order.paymentStatus.failed'),
  cancelled: textKey('account.order.paymentStatus.cancelled'),
  expired: textKey('account.order.paymentStatus.expired'),
  refunded: textKey('account.order.paymentStatus.refunded'),
} as const;

/** A payment's status in plain words; a status this release does not know is shown as it came. */
function paymentStatusLabel(status: string, t: TextApi['t']): string {
  return Object.hasOwn(PAYMENT_STATUS, status) ? t(PAYMENT_STATUS[status as keyof typeof PAYMENT_STATUS]) : status;
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
      <ArrowLeftIcon size={14} />
      {t('account.order.backToOrders')}
    </Link>
  );
}

function HeadingView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { order: data } = OrderFamily.useData();
  return (
    <header className={classes.heading} {...styleAttrs}>
      <div className={classes.titleRow}>
        <h1 className={classes.title}>{data.reference}</h1>
        <StatusPill tone={orderStatusTone(data.status)}>{orderStatusLabel(data.status, t)}</StatusPill>
      </div>
      <p className={classes.meta}>{t('account.order.placed', { date: formatDate(data.createdAt) })}</p>
      {data.servicePoint ? <p className={classes.meta}>{t('account.order.collectFrom', { name: data.servicePoint.name })}</p> : null}
    </header>
  );
}

/**
 * What is owed, and the means to settle it. Paying runs through the customer's session: the payment section
 * is fed the order's payment view, so paying, changing method and submitting a crypto transaction id exist
 * once in the shop, and there is no access key anywhere on the way.
 */
function BalanceView({ styleAttrs }: PartViewProps) {
  const { order: data, payment: previewed } = OrderFamily.useData();
  const queryClient = useQueryClient();
  // A closed order can carry a balance on paper; there is nothing to pay on it.
  const closed = data.status === 'cancelled' || data.status === 'refunded';
  const owed = data.outstandingBalance > 0 && !closed;

  // Polled while a payment is open; the payment section refetches the same cache entry after any change.
  // In the editor's preview the state is the fixture's, and nothing is fetched.
  const query = useOrderPayment(data.reference, owed && !previewed);

  // The payment section refreshes the payment view itself; the account order (its payments list,
  // balance and cancel flags) has to follow when something it shows changed. Polling re-reads the
  // same order every few seconds, so only a changed signature counts, and the first one seen for a
  // reference is the initial load, which the account order already agrees with. Invalidating
  // ['order', ref] never touches the payment query, so this cannot feed itself.
  const signature = query.data ? paymentSignature(query.data) : null;
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

  const read: PaymentRead = previewed
    ? { data: previewed, isError: false, isFetching: false, refetch: () => undefined }
    : { data: query.data, isError: query.isError, isFetching: query.isFetching, refetch: query.refetch };
  return <OrderPaymentCard order={data} payment={read} styleAttrs={styleAttrs} />;
}

function ItemsView({ styleAttrs }: PartViewProps) {
  const { t, tp } = useText();
  const { order: data } = OrderFamily.useData();
  // `discountAmount` includes the promotions; the discount row is what is left once they have their own.
  const promotions = (data.promotions ?? []).filter((p) => p.amount > 0);
  const other = otherDiscount(data.discountAmount, data.promotionDiscount);
  return (
    <section className={classes.card} aria-label={t('account.order.items')} data-sf-part="card" {...styleAttrs}>
      <div className={classes.cardHead}>
        <h2 className={classes.cardTitle}>{t('account.order.items')}</h2>
        <span className={classes.cardNote}>{tp('account.order.lines', data.items.length)}</span>
      </div>
      <ul className={classes.lines}>
        {data.items.map((item, i) => {
          const promo = lineFigures(item.lineTotal, item.promotionDiscount);
          return (
            <li key={`${item.name}-${i}`} className={classes.line}>
              <span className={classes.lineName}>{item.name}</span>
              <span className={classes.lineQty}>
                {item.quantity} × <Money amount={item.unitPrice} />
              </span>
              <span className={classes.lineTotal}>
                {promo.discounted ? (
                  <>
                    <s className={classes.lineWas}><Money amount={item.lineTotal} /></s>
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

      <div className={classes.totals}>
        <div className={classes.sum}>
          <span className={classes.sumLabel}>{t('common.totals.subtotal')}</span>
          <span className={classes.sumFigure}><Money amount={data.subtotal} /></span>
        </div>
        <div className={classes.sum}>
          <span className={classes.sumLabel}>{t('common.totals.shipping')}</span>
          <span className={classes.sumFigure}><Money amount={data.shippingAmount} /></span>
        </div>
        {promotions.map((p, i) => (
          <div key={`${p.label}-${i}`} className={classes.sum}>
            <span className={classes.sumLabel}>{p.label}</span>
            <span className={`${classes.sumFigure} ${classes.sumGood}`}>−<Money amount={p.amount} /></span>
          </div>
        ))}
        {other > 0 ? (
          <div className={classes.sum}>
            <span className={classes.sumLabel}>{t('common.totals.discount')}</span>
            <span className={classes.sumFigure}>−<Money amount={other} /></span>
          </div>
        ) : null}
        <div className={`${classes.sum} ${classes.grand}`}>
          <span className={`${classes.sumLabel} ${classes.grandLabel}`}>{t('common.totals.total')}</span>
          <span className={`${classes.sumFigure} ${classes.grandFigure}`}><Money amount={data.totalAmount} /></span>
        </div>
      </div>
    </section>
  );
}

/** Where the order is going. For a collection order the point leads, and the address under it is the point's. */
function AddressView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { order: data } = OrderFamily.useData();
  const a = data.shippingAddress;
  if (!a) return null;
  const point = a.servicePoint ?? null;
  const cityLine = [[a.city, a.county].filter((s) => s?.trim()).join(', '), a.zip].filter((s) => s?.trim()).join(' ');
  const lines = [
    `${a.firstName ?? ''} ${a.surname ?? ''}`.trim(),
    a.addressLine1, a.addressLine2, a.addressLine3,
    cityLine,
    countryName(a.country ?? ''),
  ].filter((line): line is string => !!line && line.trim() !== '');
  const titleKey = point ? 'account.order.address.collection' : 'account.order.address.delivery';
  return (
    <section className={classes.card} aria-label={t(titleKey)} data-sf-part="card" {...styleAttrs}>
      <div className={classes.cardHead}>
        <h2 className={classes.cardTitle}>{t(titleKey)}</h2>
      </div>
      {point ? (
        <p className={classes.point}>
          <span className={classes.pointName}>{point.name}</span>
          <span className={classes.pointCarrier}>{t('account.order.address.viaCarrier', { carrier: point.carrier })}</span>
        </p>
      ) : null}
      <address className={classes.address}>
        {lines.map((line, i) => (
          <span key={`${i}-${line}`} className={classes.addressLine} data-address-line>{line}</span>
        ))}
      </address>
    </section>
  );
}

function PaymentsView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { order: data } = OrderFamily.useData();
  if (data.payments.length === 0) return null;
  return (
    <section className={classes.card} aria-label={t('account.order.payments')} data-sf-part="card" {...styleAttrs}>
      <div className={classes.cardHead}>
        <h2 className={classes.cardTitle}>{t('account.order.payments')}</h2>
      </div>
      <ul className={classes.events}>
        {data.payments.map((payment, i) => (
          <li key={`${payment.method}-${payment.createdAt}-${i}`} className={classes.event}>
            <span className={classes.eventName}>{payment.methodLabel ?? methodLabel(payment.method)}</span>
            <span className={classes.eventWhen}>{formatDateTime(payment.createdAt)}</span>
            <span className={classes.eventFigure}>
              <Money amount={payment.amount} />
            </span>
            <span className={classes.eventStatus}>
              <StatusPill tone={paymentTone(payment.status)}>{paymentStatusLabel(payment.status, t)}</StatusPill>
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
    <section className={classes.card} aria-label={t('account.order.parcels')} data-sf-part="card" {...styleAttrs}>
      <div className={classes.cardHead}>
        <h2 className={classes.cardTitle}>{t('account.order.parcels')}</h2>
        <span className={classes.cardNote}>{tp('account.order.parcelCount', data.shipments.length)}</span>
      </div>
      <ul className={classes.events}>
        {data.shipments.map((shipment, i) => (
          <li key={`${shipment.trackingNumber ?? 'parcel'}-${i}`} className={classes.event}>
            <span className={classes.eventName}>{shipment.carrier ?? t('account.order.parcelFallback')}</span>
            <span className={classes.eventWhen}>
              {shipment.trackingNumber ??
                (shipment.shippedAt ? formatDate(shipment.shippedAt) : t('account.order.awaitingDispatch'))}
            </span>
            <span className={`${classes.eventStatus} ${classes.eventStatusTop}`}>
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

/** The order's views (spec §5.4). */
export const ORDER_VIEWS: FamilyValue<OrderData>['views'] = {
  OrderBackLink: BackLinkView, OrderHeading: HeadingView, OrderBalance: BalanceView, OrderItems: ItemsView,
  OrderAddress: AddressView, OrderPayments: PaymentsView, OrderParcels: ParcelsView,
};

/** What an order page renders under when nothing hands it a context (tests, the no-argument entry point). */
const STANDALONE: BlockRenderContext = { editing: false, docKey: 'account.order', layout: 'storefront' };

/**
 * One order, in full: what it is waiting on, what was bought, where it is going, every parcel out of it
 * and every payment against it. While money is owed the balance part also carries the payment actions:
 * the payment section runs on the customer's session, so paying, switching method and submitting a
 * crypto txid exist once in the shop. There is no public order page.
 *
 * The OrderDetail container: the query and its pending / error / not-found screens stay here; the
 * content slot holds the parts. Without slots the default arrangement is drawn.
 */
export function OrderDetailPage({ slots, ctx = STANDALONE }: { slots?: { content: SlotRender }; ctx?: BlockRenderContext }) {
  const { t } = useText();
  const { ref } = useParams();
  // The editor previews a state from a fixture: nothing is fetched for it (see usePreviewFixture).
  const preview = usePreviewFixture<OrderPreview>('OrderDetail');
  const order = useOrder(preview ? undefined : ref);
  const legacy = useMemo(() => (slots ? null : defaultSlotRenders('OrderDetail', 'storefront', {}, 'account.order')), [slots]);
  const content = slots?.content ?? legacy!.content!;
  const detail = preview ? preview.detail : order.data;
  const value = useMemo(
    () => (detail ? { data: { order: detail, ...(preview ? { payment: preview.payment } : {}) }, views: ORDER_VIEWS } : null),
    [detail, preview],
  );

  if (!preview && order.isPending) return <PageSkeleton inline />;

  if ((!preview && order.isError) || !value || !detail) {
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

  // In the editor the slot stays one drop zone with its own wrappers, so it is drawn as one column:
  // sorting its items into columns would pull them out of the zone the owner is arranging.
  if (ctx.editing) {
    return <OrderFamily.Provider value={value}>{content({ className: classes.overview })}</OrderFamily.Provider>;
  }

  // The renderer emits a slot's blocks as bare children, and one grid cannot stack two columns
  // independently (rows couple their heights), so the page sorts the items into its areas itself.
  const base: BlockRenderContext = { editing: ctx.editing, docKey: ctx.docKey, layout: ctx.layout };
  const areas = partitionOrderItems(content.items);
  const two = sideDraws(areas.side, silentParts(detail));
  const draw = (items: typeof areas.main) => items.map((item) => renderComponent(item, base));
  return (
    <OrderFamily.Provider value={value}>
      <div className={classes.overview} data-columns={two ? 'two' : 'one'}>
        <div className={classes.head}>{draw(areas.head)}</div>
        <div className={classes.main}>
          {draw(areas.main)}
          {two ? null : draw(areas.side)}
        </div>
        {two ? <div className={classes.side}>{draw(areas.side)}</div> : null}
      </div>
    </OrderFamily.Provider>
  );
}
