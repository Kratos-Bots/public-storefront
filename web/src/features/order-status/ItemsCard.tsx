import { formatMoney } from '@/lib/format.ts';
import { FADE } from '@/lib/motion.ts';
import { useText } from '@/text/runtime.tsx';
import type { OrderItem, OrderTotals } from '@/types/public-order.ts';
import classes from '@/features/order-status/OrderStatus.module.css';

export interface ItemsCardProps {
  items: OrderItem[];
  totals: OrderTotals;
  /** The order's own currency, which can differ from the shop's current one. */
  currency: string;
}

/** What was ordered, and what it came to. */
export function ItemsCard({ items, totals, currency }: ItemsCardProps) {
  const { t } = useText();
  const money = (amount: number) => formatMoney(amount, currency);
  const fee = totals.paymentFeeAmount ?? 0;

  return (
    <section className={`${classes.card} ${FADE}`} aria-label={t('order.items.title')} data-sf-part="card">
      <p className={classes.cardEyebrow}>{t('order.items.title')}</p>

      <ul className={classes.items}>
        {items.map((item, i) => (
          <li key={`${item.productName}-${i}`} className={classes.item}>
            <span className={classes.itemName}>{item.productName}</span>
            <span className={classes.itemQty}>
              {item.quantity} × {money(item.unitPrice)}
              {item.isPreorder ? <span className={classes.itemFlag}>{t('common.product.preorder')}</span> : null}
            </span>
            <span className={classes.itemTotal}>{money(item.totalPrice)}</span>
          </li>
        ))}
      </ul>

      <dl className={classes.totals}>
        <TotalRow label={t('common.totals.subtotal')} figure={money(totals.subtotal)} />
        <TotalRow
          label={t('order.items.delivery')}
          figure={totals.shippingAmount === 0 ? t('order.items.free') : money(totals.shippingAmount)}
          good={totals.shippingAmount === 0}
        />
        {totals.discountAmount > 0 ? (
          <TotalRow label={t('common.totals.discount')} figure={`− ${money(totals.discountAmount)}`} good />
        ) : null}
        {/* Deliberately NOT `totals.paymentFeeLabel`: the backend builds that from
            the gateway's display name ('OxaPay discount'), and this page never
            names the processor to the customer. */}
        {fee !== 0 ? (
          <TotalRow
            label={fee < 0 ? t('order.items.paymentDiscount') : t('common.totals.paymentFee')}
            figure={`${fee < 0 ? '− ' : '+ '}${money(Math.abs(fee))}`}
            good={fee < 0}
          />
        ) : null}
        {totals.taxAmount > 0 ? <TotalRow label={t('order.items.tax')} figure={money(totals.taxAmount)} /> : null}
        <div className={`${classes.row} ${classes.grand}`}>
          <dt className={classes.rowLabel}>{t('common.totals.total')}</dt>
          <dd className={`${classes.rowFigure} ${classes.grandFigure}`}>{money(totals.totalAmount)}</dd>
        </div>
      </dl>
    </section>
  );
}

function TotalRow({ label, figure, good }: { label: string; figure: string; good?: boolean }) {
  return (
    <div className={classes.row}>
      <dt className={classes.rowLabel}>{label}</dt>
      <dd className={good ? `${classes.rowFigure} ${classes.rowGood}` : classes.rowFigure}>
        {figure}
      </dd>
    </div>
  );
}
