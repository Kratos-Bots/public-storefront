import { Link } from 'react-router';
import { CartSummaryFamily } from '@/builder/family-cart.ts';
import type { FamilyValue, PartViewProps } from '@/builder/parts.ts';
import { formatMoney } from '@/lib/format.ts';
import { Slot } from '@/templates/runtime.tsx';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/cart/CartSummary.module.css';

/** The mixed pre-order notice; nothing otherwise. */
function NoticeView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { mixedPreorder } = CartSummaryFamily.useData();
  return mixedPreorder ? <p className={classes.notice} {...styleAttrs}>{t('cart.summary.mixedNotice')}</p> : null;
}

/** Micro-caps label and item count left, the one weighty figure right, a heavy rule above. */
function SubtotalView({ styleAttrs }: PartViewProps) {
  const { t, tp } = useText();
  const { count, subtotal, currency } = CartSummaryFamily.useData();
  return (
    <div className={classes.ledger} {...styleAttrs}>
      <span className={classes.label}>
        {t('common.totals.subtotal')}
        <span className={classes.units}>{tp('cart.summary.items', count)}</span>
      </span>
      <span className={classes.figure}>{formatMoney(subtotal, currency)}</span>
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
