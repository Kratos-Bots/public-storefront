import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Link, useParams } from 'react-router';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { Money } from '@/components/Money.tsx';
import { ArrowLeftIcon } from '@/components/icons.tsx';
import { OrderGoneError } from '@/api/orders.ts';
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
import { invalidateOrderGone } from '@/features/order-status/order-gone.ts';
import { paymentMovedOn, paymentSignature } from '@/features/order-status/payment-state.ts';
import { countryName } from '@/features/checkout/CountrySelect.tsx';
import { OrderPaymentCard, type PaymentRead } from '@/features/account/OrderPaymentCard.tsx';
import { isOwed, silentParts, partitionOrderItems, sideDraws } from '@/features/account/order-layout.ts';
import { takeTitleFocus } from '@/features/account/title-focus.ts';
import { StatusPill } from '@/features/account/StatusPill.tsx';
import { useOrder, useOrderPayment } from '@/features/account/queries.ts';
import { textKey, useText, type TextApi } from '@/text/runtime.tsx';
import { OrderFamily, type OrderData, type OrderPreview } from '@/builder/family-order.ts';
import { usePreviewFixture } from '@/builder/mode.ts';
import type { FamilyValue, PartViewProps } from '@/builder/parts.ts';
import { defaultSlotRenders, renderComponent } from '@/builder/render.tsx';
import type { BlockRenderContext, SlotRender } from '@/builder/define.ts';
import type { OrderDetail, OrderShipment } from '@/types/orders.ts';
import type { ShipmentStatus } from '@/types/public-order.ts';
import classes from '@/features/account/OrderDetail.module.css';

/** What a payment is called when the shop sent no name for it: the gateway's id read as words, never a raw slug. */
function methodLabel(method: string): string {
  return method
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}

/**
 * A collection point's carrier arrives as the carrier's slug ('evri'), where a parcel's carrier arrives named
 * ('Evri'). Anything already cased is left alone; a short lowercase slug is an acronym (dpd, ups), a longer one a name.
 */
function carrierLabel(carrier: string): string {
  const c = carrier.trim();
  if (c !== c.toLowerCase()) return c;
  return c.length <= 3 ? c.toUpperCase() : methodLabel(c);
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
  // A closed order says so in words, and whether any money moved: the status pill alone does not.
  const moved = data.payments.some((p) => p.status === 'completed' || p.status === 'refunded');
  const closedNote =
    data.status === 'refunded'
      ? t('account.order.refundedNote')
      : data.status === 'cancelled'
        ? `${t('account.order.cancelledNote')}${moved ? '' : ` ${t('account.order.nothingCharged')}`}`
        : null;
  return (
    <header className={classes.heading} {...styleAttrs}>
      <div className={classes.titleRow}>
        <h1 className={classes.title} tabIndex={-1} data-order-title>{data.reference}</h1>
        <StatusPill tone={orderStatusTone(data.status)}>{orderStatusLabel(data.status, t)}</StatusPill>
      </div>
      <p className={classes.meta}>{t('account.order.placed', { date: formatDate(data.createdAt) })}</p>
      {data.servicePoint ? <p className={classes.meta}>{t('account.order.collectFrom', { name: data.servicePoint.name })}</p> : null}
      {closedNote ? <p className={classes.meta}>{closedNote}</p> : null}
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
  const owed = isOwed(data);

  // Polled while a payment is open; the payment section refetches the same cache entry after any change.
  // In the editor's preview the state is the fixture's, and nothing is fetched.
  const query = useOrderPayment(data.reference, owed && !previewed);

  // The payment section refreshes the payment view itself; the account order (its payments list,
  // balance and cancel flags) and the orders list have to follow when something they show changed.
  // Polling re-reads the same order every few seconds, so only a changed signature counts, and the
  // first one seen for a reference is the initial load, which the account order normally agrees with:
  // unless the view already says the order has moved on (the payment view is the fresher read), in
  // which case the account order is refetched at once. Invalidating ['order', ref] never touches the
  // payment query, so this cannot feed itself.
  const signature = query.data ? paymentSignature(query.data) : null;
  const movedOn = query.data ? paymentMovedOn(query.data, data.status) : false;
  // Per reference, so going A, B, A still notices a change to A made while B was showing.
  const seen = useRef(new Map<string, string>());
  useEffect(() => {
    if (!signature) return;
    const last = seen.current.get(data.reference);
    seen.current.set(data.reference, signature);
    if ((last === undefined || last === signature) && !movedOn) return;
    void queryClient.invalidateQueries({ queryKey: ['order', data.reference] });
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
  }, [signature, movedOn, queryClient, data.reference]);

  // The payment read answering 404 means the order is not this customer's any more; once is enough, the
  // order read then says so itself.
  const gone = query.error instanceof OrderGoneError;
  useEffect(() => {
    if (gone) invalidateOrderGone(queryClient, data.reference);
  }, [gone, queryClient, data.reference]);

  if (!owed) return null;

  const read: PaymentRead = previewed
    ? { data: previewed, isError: false, isFetching: false, refetch: () => undefined }
    : { data: query.data, isError: query.isError, error: query.error, isFetching: query.isFetching, refetch: query.refetch };
  // Keyed on the reference: the card remembers that its last read failed, which belongs to one order only.
  return <OrderPaymentCard key={data.reference} order={data} payment={read} styleAttrs={styleAttrs} />;
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
        {data.items.length > 1 ? <span className={classes.cardNote}>{tp('account.order.lines', data.items.length)}</span> : null}
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

/**
 * Where the order is going. A collection order leads with the point (its name and carrier, then its address),
 * and the customer's own name comes last, said to be who collects. A closed order is not going anywhere, so its
 * card carries a neutral title.
 */
function AddressView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { order: data } = OrderFamily.useData();
  const a = data.shippingAddress;
  if (!a) return null;
  const point = a.servicePoint ?? null;
  const cityLine = [[a.city, a.county].filter((s) => s?.trim()).join(', '), a.zip].filter((s) => s?.trim()).join(' ');
  const person = `${a.firstName ?? ''} ${a.surname ?? ''}`.trim();
  const lines = [
    ...(point ? [] : [person]),
    a.addressLine1, a.addressLine2, a.addressLine3,
    cityLine,
    countryName(a.country ?? ''),
  ].filter((line): line is string => !!line && line.trim() !== '');
  const closed = data.status === 'cancelled' || data.status === 'refunded';
  const titleKey = closed ? 'account.order.address.neutral' : point ? 'account.order.address.collection' : 'account.order.address.delivery';
  return (
    <section className={classes.card} aria-label={t(titleKey)} data-sf-part="card" {...styleAttrs}>
      <div className={classes.cardHead}>
        <h2 className={classes.cardTitle}>{t(titleKey)}</h2>
      </div>
      <address className={classes.address}>
        {point ? (
          <>
            <span className={classes.pointName} data-address-line>{point.name}</span>
            <span className={classes.pointCarrier} data-address-line>{t('account.order.address.viaCarrier', { carrier: carrierLabel(point.carrier) })}</span>
          </>
        ) : null}
        {lines.map((line, i) => (
          <span key={`${i}-${line}`} className={point && i === 0 ? `${classes.addressLine} ${classes.pointGap}` : classes.addressLine} data-address-line>{line}</span>
        ))}
        {point && person ? (
          <span className={`${classes.addressLine} ${classes.collecting}`} data-address-line>{t('account.order.address.collecting', { name: person })}</span>
        ) : null}
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
            <span className={`${classes.eventWhen} ${classes.eventRef}`}>
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

/**
 * What the page says about the order changing under the customer, with nothing drawn: a payment that arrives while
 * they are looking is announced once (a notification, and a polite status region for screen readers), and after a
 * cancel the focus the cancel control held moves to the page heading. Never on the first load of an order that was
 * already paid or cancelled: only a change seen on this page counts.
 */
function OrderAnnouncements({ order }: { order: OrderDetail }) {
  const { t } = useText();
  const owed = isOwed(order);
  const closed = order.status === 'cancelled' || order.status === 'refunded';
  const before = useRef({ reference: order.reference, owed });
  const [received, setReceived] = useState<string | null>(null);

  useEffect(() => {
    const prev = before.current;
    before.current = { reference: order.reference, owed };
    if (prev.reference !== order.reference) { setReceived(null); return; }
    if (prev.owed && !owed && !closed) {
      const message = t('account.order.paymentReceived');
      setReceived(message);
      notifications.show({ message });
    }
  }, [order.reference, owed, closed, t]);

  useEffect(() => {
    if (order.status === 'cancelled' && takeTitleFocus(order.reference)) {
      document.querySelector<HTMLElement>('[data-order-title]')?.focus();
    }
  }, [order.status, order.reference]);

  return <p className={classes.srOnly} role="status">{received}</p>;
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

  // The screens that stand in for the page carry the page's one h1 themselves: the account greeting that usually
  // provides it is hidden on an order page.
  if (!preview && order.isPending) {
    return (
      <>
        <h1 className={classes.srOnly}>{t('account.order.title')}</h1>
        <PageSkeleton inline />
      </>
    );
  }

  // A failed background refetch with the order still cached keeps the page (a focus refetch on a flaky connection
  // must not destroy an open dialog); a 404 does not, since the order is gone for this customer.
  const missing = !preview && order.error instanceof ApiError && order.error.status === 404;
  if ((!preview && order.isError && (!order.data || missing)) || !value || !detail || missing) {
    return (
      <EmptyState
        as="h1"
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
  const silent = silentParts(detail);
  const areas = partitionOrderItems(content.items, silent);
  const two = sideDraws(areas.side, silent);
  const draw = (items: typeof areas.main) => items.map((item) => renderComponent(item, base));
  return (
    <OrderFamily.Provider value={value}>
      <div className={classes.page}>
        <OrderAnnouncements order={detail} />
        <div className={classes.overview} data-columns={two ? 'two' : 'one'}>
          <div className={classes.head}>{draw(areas.head)}</div>
          <div className={classes.main}>
            {draw(areas.main)}
            {two ? null : draw(areas.side)}
          </div>
          {two ? <div className={classes.side}>{draw(areas.side)}</div> : null}
        </div>
      </div>
    </OrderFamily.Provider>
  );
}
