import { useQueryClient } from '@tanstack/react-query';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { OrderStatusFamily } from '@/builder/family-order-status.ts';
import type { FamilyValue, PartViewProps } from '@/builder/parts.ts';
import { orderChatMessage } from '@/lib/chat-links.ts';
import { publicOrderPromotions } from '@/lib/promotions.ts';
import { useText } from '@/text/runtime.tsx';
import { AddressCard } from '@/features/order-status/AddressCard.tsx';
import { ItemsCard } from '@/features/order-status/ItemsCard.tsx';
import { CancelOrder } from '@/features/order-status/CancelOrder.tsx';
import { invalidateAfterCancel } from '@/features/order-status/invalidate-after-cancel.ts';
import { PaymentSection } from '@/features/order-status/PaymentSection.tsx';
import { ShipmentCard } from '@/features/order-status/ShipmentCard.tsx';
import { StatusHero } from '@/features/order-status/StatusHero.tsx';
import classes from '@/features/order-status/OrderStatus.module.css';

// Thin adapters over today's components. A view holds no state or effect: the payment panel's
// `changing`, the txid form and the polling all stay in the components and the container.

function HeroView({ styleAttrs }: PartViewProps) {
  return <StatusHero order={OrderStatusFamily.useData().order} rootAttrs={styleAttrs} />;
}

/** `wrap` target: the block wrapper carries the style, so nothing is spread here. */
function PaymentView() {
  const { order, reference, accessKey } = OrderStatusFamily.useData();
  const queryClient = useQueryClient();
  return (
    <>
      <PaymentSection order={order} reference={reference} accessKey={accessKey} />
      <CancelOrder
        key={reference}
        reference={reference}
        accessKey={accessKey}
        viaLink
        canCancel={order.payment?.canCancel}
        blockedBy={order.payment?.cancelBlockedBy}
        onCancelled={() => invalidateAfterCancel(queryClient, reference, accessKey)}
      />
    </>
  );
}

/** `wrap` target, like Payment. */
function ShipmentsView() {
  const { order } = OrderStatusFamily.useData();
  return (
    <>
      {order.shipments.map((shipment, i) => (
        <ShipmentCard
          key={`${shipment.trackingNumber ?? 'parcel'}-${i}`}
          shipment={shipment}
          index={i}
          count={order.shipments.length}
        />
      ))}
    </>
  );
}

function ItemsView({ styleAttrs }: PartViewProps) {
  const { order } = OrderStatusFamily.useData();
  return <ItemsCard items={order.items} totals={order.totals} promotions={publicOrderPromotions(order)} currency={order.currency} rootAttrs={styleAttrs} />;
}

function AddressView({ styleAttrs }: PartViewProps) {
  const { order } = OrderStatusFamily.useData();
  return order.shippingAddress ? <AddressCard address={order.shippingAddress} rootAttrs={styleAttrs} /> : null;
}

function FooterView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { order } = OrderStatusFamily.useData();
  return (
    <footer className={classes.hero} {...styleAttrs}>
      <p className={classes.meta}>{t('order.footer.reference', { reference: order.reference })}</p>
      <p className={classes.detail}>{t('order.footer.questions')}</p>
      <ContactLinks prefill={orderChatMessage(order.reference)} />
    </footer>
  );
}

export const ORDER_STATUS_VIEWS: FamilyValue<never>['views'] = {
  OrderStatusHero: HeroView,
  OrderStatusPayment: PaymentView,
  OrderStatusShipments: ShipmentsView,
  OrderStatusItems: ItemsView,
  OrderStatusAddress: AddressView,
  OrderStatusFooter: FooterView,
};
