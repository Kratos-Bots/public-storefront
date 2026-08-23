import { useEffect } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { InvalidLinkError, fetchPublicOrder } from '@/api/public-order.ts';
import { useSettings } from '@/app/settings.ts';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { orderChatMessage } from '@/lib/chat-links.ts';
import { saveOrder } from '@/stores/saved-orders.ts';
import { AddressCard } from '@/features/order-status/AddressCard.tsx';
import { ItemsCard } from '@/features/order-status/ItemsCard.tsx';
import { PaymentSection } from '@/features/order-status/PaymentSection.tsx';
import { ShipmentCard } from '@/features/order-status/ShipmentCard.tsx';
import { StatusHero } from '@/features/order-status/StatusHero.tsx';
import {
  InvalidLinkScreen,
  LoadingScreen,
  NetworkErrorScreen,
} from '@/features/order-status/StateScreens.tsx';
import { pollInterval, visibleCryptoPayments } from '@/features/order-status/payment-state.ts';
import { publicOrderKey } from '@/features/order-status/queries.ts';
import classes from '@/features/order-status/OrderStatus.module.css';

/**
 * One order, opened from a link in a chat message. The link itself is the
 * credential — no session, no login — so this is the only page in the shop a
 * signed-out customer can see their own order on.
 *
 * It has two jobs, in this order: get the order paid while money is owed, and
 * say where the parcel is once it isn't.
 */
export function OrderStatusPage() {
  const { ref, accessKey } = useParams<{ ref: string; accessKey: string }>();
  const { brand } = useSettings();

  const orderQuery = useQuery({
    queryKey: publicOrderKey(ref ?? '', accessKey ?? ''),
    queryFn: () => fetchPublicOrder(ref!, accessKey!),
    enabled: !!ref && !!accessKey,
    retry: false,
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data ? pollInterval(query.state.data) : false),
    // A customer watching a hosted checkout in another tab is not looking at
    // this one, and that is exactly when it most needs to keep up.
    refetchIntervalInBackground: true,
  });

  const order = orderQuery.data;

  useEffect(() => {
    document.title = order ? `Order ${order.reference} — ${brand.name}` : brand.title;
    return () => {
      document.title = brand.title;
    };
  }, [order, brand.name, brand.title]);

  // Only a link that has answered is worth remembering — a mistyped one never
  // reaches the store.
  const loaded = !!order;
  useEffect(() => {
    if (loaded && ref && accessKey) saveOrder(ref, accessKey);
  }, [loaded, ref, accessKey]);

  // A link with no parameters is as unusable as one the backend rejected.
  if (!ref || !accessKey || orderQuery.error instanceof InvalidLinkError) return <InvalidLinkScreen />;
  if (orderQuery.isError) return <NetworkErrorScreen onRetry={() => void orderQuery.refetch()} />;
  if (!order) return <LoadingScreen />;

  // The action column earns its own track only when it has something in it —
  // otherwise the wide layout would draw an empty half beside the summary.
  const hasActions =
    !!order.payment?.canPay ||
    visibleCryptoPayments(order).length > 0 ||
    order.shipments.length > 0;

  return (
    <div className={hasActions ? `${classes.page} ${classes.pageWide}` : classes.page}>
      <StatusHero order={order} />

      <div className={hasActions ? `${classes.layout} ${classes.layoutWide}` : classes.layout}>
        <div className={classes.column}>
          {/* Paying comes before tracking: it is the only thing on this page the
              customer can still change the outcome of. */}
          <PaymentSection order={order} reference={ref} accessKey={accessKey} />
          {order.shipments.map((shipment, i) => (
            <ShipmentCard
              key={`${shipment.trackingNumber ?? 'parcel'}-${i}`}
              shipment={shipment}
              index={i}
              count={order.shipments.length}
            />
          ))}
        </div>

        <div className={classes.column}>
          <ItemsCard items={order.items} totals={order.totals} currency={order.currency} />
          {order.shippingAddress ? <AddressCard address={order.shippingAddress} /> : null}
        </div>
      </div>

      <footer className={classes.hero}>
        <p className={classes.meta}>Order {order.reference}</p>
        <p className={classes.detail}>Questions about this order? Message us and quote that reference.</p>
        <ContactLinks prefill={orderChatMessage(order.reference)} />
      </footer>
    </div>
  );
}
