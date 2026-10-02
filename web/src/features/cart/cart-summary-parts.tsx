import { Link } from 'react-router';
import { CartSummaryFamily } from '@/builder/family-cart.ts';
import type { FamilyValue, PartViewProps } from '@/builder/parts.ts';
import { formatMoney } from '@/lib/format.ts';
import { nudgeSentence } from '@/lib/promotions.ts';
import { Slot } from '@/templates/runtime.tsx';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/cart/CartSummary.module.css';

/** The mixed pre-order notice; nothing otherwise. */
function NoticeView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { mixedPreorder } = CartSummaryFamily.useData();
  return mixedPreorder ? <p className={classes.notice} {...styleAttrs}>{t('cart.summary.mixedNotice')}</p> : null;
}

/**
 * Micro-caps label and item count left, the one weighty figure right, a heavy rule above. With
 * promotions applied the subtotal steps back, each promotion takes its row, and the weighty figure
 * becomes the basket after them; a nudge toward the next promotion sits above the lot.
 */
function SubtotalView({ styleAttrs }: PartViewProps) {
  const text = useText();
  const { t, tp } = text;
  const { count, subtotal, currency, promotions } = CartSummaryFamily.useData();
  const subtotalRow = (quiet: boolean, attrs?: typeof styleAttrs) => (
    <div className={quiet ? `${classes.ledger} ${classes.quiet}` : classes.ledger} {...attrs}>
      <span className={classes.label}>
        {t('common.totals.subtotal')}
        <span className={classes.units}>{tp('cart.summary.items', count)}</span>
      </span>
      <span className={classes.figure}>{formatMoney(subtotal, currency)}</span>
    </div>
  );
  // A free-shipping promotion takes nothing off the basket, so it can apply with a discount of 0:
  // the shopper still sees it earned, but there is no "after promotions" total to show.
  const hasDiscount = promotions !== null && promotions.discount > 0;
  const earnsFreeShipping = promotions !== null && promotions.promotions.some((p) => p.freeShipping && p.amount === 0);
  const applied = hasDiscount || earnsFreeShipping;
  const nudge = promotions?.nudge ?? null;
  if (!applied && !nudge) return subtotalRow(false, styleAttrs);
  return (
    <div className={classes.promoBlock} {...styleAttrs}>
      {nudge ? <p className={classes.nudge}>{nudgeSentence(nudge, text, (n) => formatMoney(n, currency))}</p> : null}
      {subtotalRow(hasDiscount)}
      {applied
        ? (
          <>
            {promotions.promotions.map((p) => (
              <div key={p.id} className={classes.promoRow}>
                {p.freeShipping && p.amount === 0
                  ? <span className={classes.promoLabel}>{t('common.promo.freeShipping', { label: p.label })}</span>
                  : (
                    <>
                      <span className={classes.promoLabel}>{p.label}</span>
                      <span className={classes.promoFigure}>−{formatMoney(p.amount, currency)}</span>
                    </>
                  )}
              </div>
            ))}
            {hasDiscount ? (
              <div className={`${classes.ledger} ${classes.net}`}>
                <span className={classes.label}>{t('cart.summary.afterPromotions')}</span>
                <span className={classes.figure}>{formatMoney(promotions.total, currency)}</span>
              </div>
            ) : null}
          </>
        )
        : null}
    </div>
  );
}

function TermsView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  return <p className={classes.terms} {...styleAttrs}>{t('cart.summary.terms')}</p>;
}

/** The checkout link, or the disabled button and its held note; in the web app only the held note when blocked. */
function CheckoutView() {
  const { t } = useText();
  const { blocked, onNavigate, primaryElsewhere, checkoutTo } = CartSummaryFamily.useData();
  if (primaryElsewhere) return blocked ? <p className={classes.held}>{t('cart.summary.held')}</p> : null;
  if (blocked) {
    return (
      <>
        <button type="button" className={classes.checkout} disabled data-sf-part="button" data-variant="filled" data-sf-cta="main">
          {t('cart.summary.checkout')}
          <Slot name="ButtonAdornment" variant="primary" cta />
        </button>
        <p className={classes.held}>{t('cart.summary.held')}</p>
      </>
    );
  }
  return (
    <Link to={checkoutTo} className={classes.checkout} onClick={onNavigate} data-sf-part="button" data-variant="filled" data-sf-cta="main">
      {t('cart.summary.checkout')}
      <Slot name="ButtonAdornment" variant="primary" cta />
    </Link>
  );
}

function ContinueView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { onNavigate } = CartSummaryFamily.useData();
  return (
    <Link to="/" className={classes.keep} onClick={onNavigate} {...styleAttrs}>
      {t('cart.summary.keepShopping')}
    </Link>
  );
}

export const CART_SUMMARY_VIEWS: FamilyValue<never>['views'] = {
  CartSummaryNotice: NoticeView,
  CartSummarySubtotal: SubtotalView,
  CartSummaryTerms: TermsView,
  CartSummaryCheckout: CheckoutView,
  CartSummaryContinue: ContinueView,
};
