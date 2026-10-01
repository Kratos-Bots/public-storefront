import { useEffect, useId, useRef, useState } from 'react';
import type { CryptoOption, PaymentMethod, Quote } from '@/types/checkout.ts';
import type { StyleAttrs } from '@/builder/define.ts';
import { useCartStore, selectSubtotal } from '@/stores/cart.ts';
import { Money } from '@/components/Money.tsx';
import { rowAnim } from '@/lib/motion.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/checkout/QuoteSummary.module.css';

export interface QuoteSummaryProps {
  /** The last quote the backend returned, or `undefined` before the first one. */
  quote: Quote | undefined;
  isFetching: boolean;
  /** A quote error the shopper still has to fix — the figures below are last-known. */
  stale: boolean;
  /** The payment method chosen on the payment step, if any. */
  method: PaymentMethod | undefined;
  /** The coin/network chosen inside a crypto method, if any. */
  combo: CryptoOption | null;
  /** Open the collapsed phone head once, when the shopper reaches the review —
   *  that is the one step whose whole job is checking these figures. */
  defaultOpen?: boolean;
  rootAttrs?: StyleAttrs;
}

/**
 * The docket. Everything the backend priced, in the order it priced it, closed
 * by the single figure the shopper is being asked for — the chosen method's
 * `chargeTotal` once there is one, the quote's `amountDue` until then.
 *
 * Before an address exists there is no quote to show, so it falls back to the
 * cart's own lines and says plainly that shipping and discounts are still to
 * come; that is cheaper than a shopper meeting the real total at the last step.
 */
export function QuoteSummary({
  quote,
  isFetching,
  stale,
  method,
  combo,
  defaultOpen = false,
  rootAttrs,
}: QuoteSummaryProps) {
  const { t, tn, tp } = useText();
  const [open, setOpen] = useState(defaultOpen);
  const autoOpened = useRef(defaultOpen);
  const bodyId = useId();

  // Once, and only ever to open: a shopper who closes it on the review step has
  // said what they want and must not be overruled on the next render.
  useEffect(() => {
    if (!defaultOpen || autoOpened.current) return;
    autoOpened.current = true;
    setOpen(true);
  }, [defaultOpen]);
  const lines = useCartStore((s) => s.lines);
  const localSubtotal = useCartStore((s) => selectSubtotal(s.lines));

  const items = quote
    ? quote.items.map((i) => ({
        key: i.productId,
        name: i.name,
        quantity: i.quantity,
        lineTotal: i.lineTotal,
        tierApplied: i.tierApplied,
        isPreorder: i.isPreorder,
      }))
    : lines.map((l) => ({
        key: l.productId,
        name: l.displayName,
        quantity: l.quantity,
        lineTotal: l.unitPrice * l.quantity,
        tierApplied: l.unitPrice < l.basePrice,
        isPreorder: l.isPreorder,
      }));
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  const charge = combo?.chargeTotal ?? method?.chargeTotal ?? null;
  const due = quote?.amountDue ?? null;
  const heroAmount = charge ?? due;
  const heroLabel =
    due === 0 ? t('checkout.summary.nothingToPay') : charge !== null ? t('checkout.summary.toPay') : t('checkout.summary.amountDue');
  const fee = combo ? combo.fee : method ? method.fee : 0;
  const feeLabel = (combo?.feeLabel || method?.feeLabel) ?? '';
  const feeRateText = (combo?.feeRateText || method?.feeRateText) ?? '';

  return (
    <section
      className={classes.docket}
      {...rootAttrs}
      data-open={open}
      data-stale={stale}
      data-fetching={isFetching}
      aria-label={t('checkout.summary.ariaLabel')}
    >
      <button
        type="button"
        className={classes.toggle}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={classes.toggleLabel}>{open ? t('checkout.summary.hide') : t('checkout.summary.ariaLabel')}</span>
        <span className={classes.toggleFigure}>
          <Money amount={heroAmount ?? quote?.grandTotal ?? localSubtotal} />
        </span>
        <span className={classes.caret} aria-hidden />
      </button>

      <div className={classes.body} id={bodyId}>
        <header className={classes.head}>
          <h2 className={classes.headName}>{t('checkout.summary.heading')}</h2>
          <span className={classes.headRule} aria-hidden />
          <span className={classes.headCount}>{tp('cart.summary.items', count)}</span>
        </header>

        <ul className={classes.items}>
          {items.map((item, idx) => (
            <li
              className={`${classes.item} ${rowAnim(idx).className}`}
              style={rowAnim(idx).style}
              key={item.key}
            >
              <span className={classes.itemQty}>{item.quantity}×</span>
              <span className={classes.itemName}>
                {item.name}
                {item.tierApplied ? <span className={classes.tag}>{t('checkout.summary.bulk')}</span> : null}
                {item.isPreorder ? (
                  <span className={`${classes.tag} ${classes.tagWarn}`}>{t('common.product.preorder')}</span>
                ) : null}
              </span>
              <span className={classes.itemFigure}>
                <Money amount={item.lineTotal} />
              </span>
            </li>
          ))}
        </ul>

        <div className={classes.ledger}>
          <div className={classes.row}>
            <span className={classes.rowLabel}>{t('common.totals.subtotal')}</span>
            <span className={classes.rowFigure}>
              <Money amount={quote ? quote.subtotal : localSubtotal} />
            </span>
          </div>

          {quote?.coupon ? (
            <div className={`${classes.row} ${classes.discount}`}>
              <span className={classes.rowLabel}>
                {tn('checkout.summary.discountCode', { code: <span className={classes.rowNote}>{quote.coupon.code}</span> })}
              </span>
              <span className={classes.rowFigure}>
                −
                <Money amount={quote.coupon.discountAmount + quote.coupon.shippingDiscount} />
              </span>
            </div>
          ) : null}

          {quote && quote.selectedShippingOptionId !== null ? (
            <div className={classes.row}>
              <span className={classes.rowLabel}>{t('common.totals.shipping')}</span>
              <span className={classes.rowFigure}>
                {quote.shippingAmount === 0 ? t('checkout.shipping.free') : <Money amount={quote.shippingAmount} />}
              </span>
            </div>
          ) : null}

          {quote ? (
            <div className={`${classes.row} ${classes.total}`}>
              <span className={classes.rowLabel}>{t('common.totals.total')}</span>
              <span className={classes.rowFigure}>
                <Money amount={quote.grandTotal} />
              </span>
            </div>
          ) : null}

          {quote && quote.storeCredit.applied > 0 ? (
            <div className={`${classes.row} ${classes.credit}`}>
              <span className={classes.rowLabel}>{t('common.totals.storeCredit')}</span>
              <span className={classes.rowFigure}>
                −<Money amount={quote.storeCredit.applied} />
              </span>
            </div>
          ) : null}

          {quote && charge !== null && due !== null ? (
            <>
              <div className={classes.row}>
                <span className={classes.rowLabel}>{t('checkout.summary.amountDue')}</span>
                <span className={classes.rowFigure}>
                  <Money amount={due} />
                </span>
              </div>
              {fee !== 0 ? (
                <div className={classes.row}>
                  <span className={classes.rowLabel}>
                    {feeLabel || t('common.totals.paymentFee')}{' '}
                    {feeRateText ? <span className={classes.rowNote}>{feeRateText}</span> : null}
                  </span>
                  <span className={classes.rowFigure}>
                    {fee > 0 ? '+' : '−'}
                    <Money amount={Math.abs(fee)} />
                  </span>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        {heroAmount !== null ? (
          <div className={classes.hero}>
            <span className={classes.heroLabel}>{heroLabel}</span>
            <span className={classes.heroFigure}>
              <Money amount={heroAmount} />
            </span>
          </div>
        ) : null}

        {quote ? (
          due === 0 ? (
            <p className={classes.note} data-tone="success">
              {t('checkout.summary.creditCovers')}
            </p>
          ) : null
        ) : (
          <p className={classes.note}>{t('checkout.summary.pending')}</p>
        )}
      </div>
    </section>
  );
}
