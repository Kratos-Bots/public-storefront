import type { StyleAttrs } from '@/builder/define.ts';
import { formatMoney } from '@/lib/format.ts';
import { FADE } from '@/lib/motion.ts';
import { lineFigures, otherDiscount } from '@/lib/promotions.ts';
import { useText } from '@/text/runtime.tsx';
import type { OrderItem, OrderTotals, PublicOrderPromotion } from '@/types/public-order.ts';
import classes from '@/features/order-status/OrderStatus.module.css';

export interface ItemsCardProps {
  items: OrderItem[];
  totals: OrderTotals;
  /** The promotion breakdown (`publicOrderPromotions`); `discount` is the part of `totals.discountAmount` they account for. */
  promotions?: { discount: number; promotions: PublicOrderPromotion[] };
  /** The order's own currency, which can differ from the shop's current one. */
  currency: string;
  /** The OrderStatusItems part's style attributes (none outside a styled part). */
  rootAttrs?: StyleAttrs;
}

/** What was ordered, and what it came to. */
export function ItemsCard({ items, totals, promotions, currency, rootAttrs }: ItemsCardProps) {
  const { t } = useText();
  const money = (amount: number) => formatMoney(amount, currency);
  const fee = totals.paymentFeeAmount ?? 0;

  return (
    <section className={`${classes.card} ${FADE}`} aria-label={t('order.items.title')} data-sf-part="card" {...rootAttrs}>
      <p className={classes.cardEyebrow}>{t('order.items.title')}</p>

      <ul className={classes.items}>
        {items.map((item, i) => {
          const promo = lineFigures(item.totalPrice, item.promotionDiscount);
          return (
          <li key={`${item.productName}-${i}`} className={classes.item}>
            <span className={classes.itemName}>{item.productName}</span>
            <span className={classes.itemQty}>
              {item.quantity} × {money(item.unitPrice)}
              {item.isPreorder ? <span className={classes.itemFlag}>{t('common.product.preorder')}</span> : null}
            </span>
            <span className={classes.itemTotal}>
              {promo.discounted ? (
                <>
                  <s className={classes.itemWas}>{money(item.totalPrice)}</s>
                  {promo.free ? <span className={classes.rowGood}>{t('common.promo.free')}</span> : money(promo.net)}
                </>
              ) : (
                money(item.totalPrice)
              )}
            </span>
          </li>
          );
        })}
      </ul>

      <dl className={classes.totals}>
        <TotalRow label={t('common.totals.subtotal')} figure={money(totals.subtotal)} />
        <TotalRow
          label={t('order.items.delivery')}
          figure={totals.shippingAmount === 0 ? t('order.items.free') : money(totals.shippingAmount)}
          good={totals.shippingAmount === 0}
        />
        {/* `discountAmount` includes the promotions: each has its own row, and the discount row is the rest. */}
        {(promotions?.promotions ?? []).map((p, i) => (
          <TotalRow key={`${p.label}-${i}`} label={p.label} figure={`− ${money(p.amount)}`} good />
        ))}
        {otherDiscount(totals.discountAmount, promotions?.discount) > 0 ? (
          <TotalRow label={t('common.totals.discount')} figure={`− ${money(otherDiscount(totals.discountAmount, promotions?.discount))}`} good />
        ) : null}
        {/* Deliberately NOT `totals.paymentFeeLabel`: the backend builds that from
            the shop's own name for the method ('Pay with crypto discount'); this
            page words the row from its own text instead. */}
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
