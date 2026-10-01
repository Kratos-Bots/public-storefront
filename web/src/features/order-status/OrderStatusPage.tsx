import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { InvalidLinkError, fetchPublicOrder } from '@/api/public-order.ts';
import { useSettings } from '@/app/settings.ts';
import { OrderStatusFamily, type OrderStatusData, type OrderStatusSlots } from '@/builder/family-order-status.ts';
import type { SlotRender } from '@/builder/define.ts';
import { usePreviewFixture } from '@/builder/mode.ts';
import { flattenTypes } from '@/builder/parts.ts';
import { defaultSlotRenders } from '@/builder/render.tsx';
import { saveOrder } from '@/stores/saved-orders.ts';
import {
  InvalidLinkScreen,
  LoadingScreen,
  NetworkErrorScreen,
} from '@/features/order-status/StateScreens.tsx';
import { ORDER_STATUS_VIEWS } from '@/features/order-status/order-status-parts.tsx';
import { pollInterval, visibleCryptoPayments } from '@/features/order-status/payment-state.ts';
import { publicOrderKey } from '@/features/order-status/queries.ts';
import { useText } from '@/text/runtime.tsx';
import type { PublicOrder } from '@/types/public-order.ts';
import classes from '@/features/order-status/OrderStatus.module.css';

/**
 * One order, opened from a link in a chat message. The link itself is the
 * credential — no session, no login — so this is the only page in the shop a
 * signed-out customer can see their own order on.
 *
 * It has two jobs, in this order: get the order paid while money is owed, and
 * say where the parcel is once it isn't. The OrderStatus container's parts
 * (hero, payment, tracking, items, address, footer) draw the page; this
 * component owns the query, the polling, the title and the screens.
 */
export interface OrderStatusPageProps {
  /** The OrderStatus block's slots; omitted = the default arrangement (tests, v0.7.0 call sites). */
  slots?: OrderStatusSlots;
}

export function OrderStatusPage({ slots }: OrderStatusPageProps = {}) {
  const { ref, accessKey } = useParams<{ ref: string; accessKey: string }>();
  const { brand } = useSettings();
  const { t } = useText();

  // The editor supplies a fixture order; a shopper never has one (null outside the editor).
  const fixture = usePreviewFixture<PublicOrder>('OrderStatus');

  const orderQuery = useQuery({
    queryKey: publicOrderKey(ref ?? '', accessKey ?? ''),
    queryFn: () => fetchPublicOrder(ref!, accessKey!),
    enabled: !fixture && !!ref && !!accessKey,
    retry: false,
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data ? pollInterval(query.state.data) : false),
    // A customer watching a hosted checkout in another tab is not looking at
    // this one, and that is exactly when it most needs to keep up.
    refetchIntervalInBackground: true,
  });

  const order = fixture ?? orderQuery.data;

  useEffect(() => {
    document.title = order ? t('order.documentTitle', { reference: order.reference, shop: brand.name }) : brand.title;
    return () => {
      document.title = brand.title;
    };
  }, [order, brand.name, brand.title, t]);

  // Only a link that has answered is worth remembering — a mistyped one never
  // reaches the store (and a preview's fixture order never does).
  const loaded = !!order && !fixture;
  useEffect(() => {
    if (loaded && ref && accessKey) saveOrder(ref, accessKey);
  }, [loaded, ref, accessKey]);

  const legacy = useMemo(
    () => (slots ? null : (defaultSlotRenders('OrderStatus', 'storefront', {}, 'order-status') as unknown as OrderStatusSlots)),
    [slots],
  );
  const s = slots ?? legacy!;

  const data = useMemo<OrderStatusData | null>(
    () => (order ? { order, reference: ref ?? order.reference, accessKey: accessKey ?? '' } : null),
    [order, ref, accessKey],
  );
  const value = useMemo(() => (data ? { data, views: ORDER_STATUS_VIEWS } : null), [data]);

  // A link with no parameters is as unusable as one the backend rejected.
  if (!fixture && (!ref || !accessKey || orderQuery.error instanceof InvalidLinkError)) return <InvalidLinkScreen />;
  if (orderQuery.isError) return <NetworkErrorScreen onRetry={() => void orderQuery.refetch()} />;
  if (!order || !value) return <LoadingScreen />;

  // A part that draws nothing for this order: the wide layout counts only what will show. The
  // hero, items and footer always draw, and so does any content block.
  const silent = new Set<string>();
  if (!(order.payment?.canPay || visibleCryptoPayments(order).length > 0)) silent.add('OrderStatusPayment');
  if (order.shipments.length === 0) silent.add('OrderStatusShipments');
  if (!order.shippingAddress) silent.add('OrderStatusAddress');
  // The action column earns its own track only when it has something in it — otherwise the wide
  // layout would draw an empty half beside the summary.
  // A content block (Section, Columns) wrapping only silent parts draws nothing either.
  const shows = (items: SlotRender['items']) =>
    items.some((item) => {
      if (silent.has(item.type)) return false;
      const inner = flattenTypes([item]).slice(1);
      return inner.length === 0 || inner.some((t) => !silent.has(t));
    });
  const wide = shows(s.action.items) && shows(s.summary.items);

  return (
    <OrderStatusFamily.Provider value={value}>
      <div className={wide ? `${classes.page} ${classes.pageWide}` : classes.page}>
        {s.top()}
        {/* Both columns always render, and `action` precedes `summary` in the DOM at every width:
            paying comes before tracking and the order details, because it is the only thing on this
            page the customer can still change the outcome of. */}
        <div className={wide ? `${classes.layout} ${classes.layoutWide}` : classes.layout}>
          {s.action({ className: classes.column })}
          {s.summary({ className: classes.column })}
        </div>
        {s.bottom()}
      </div>
    </OrderStatusFamily.Provider>
  );
}
