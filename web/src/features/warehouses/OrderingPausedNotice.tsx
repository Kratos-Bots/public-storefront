import { useWarehouseOrdering } from '@/features/warehouses/use-warehouse.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/warehouses/OrderingPausedNotice.module.css';

/**
 * Says that the warehouse the shopper is shipping from is not taking orders: the owner's own message when
 * there is one, else the shop-wide sentence naming the warehouse. Informational (the shop is still open
 * for browsing), so it carries a plain "i" and the info tone rather than the warning colour. Renders
 * nothing unless ordering is paused, so a shop without the feature draws no extra element. `bar` is the
 * full-width strip under the header; `inline` is the boxed form used inside the cart.
 */
export function OrderingPausedNotice({ variant = 'bar' }: { variant?: 'bar' | 'inline' }) {
  const { paused, message, name } = useWarehouseOrdering();
  const { t } = useText();
  if (!paused) return null;
  const text = message ?? t('shell.warehouse.paused.notice', { warehouse: name ?? '' });
  return (
    <div className={variant === 'bar' ? classes.bar : classes.inline} role="status" data-warehouse-paused="">
      <div className={classes.inner}>
        <svg className={classes.glyph} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 7.25v3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="5.1" r="0.9" fill="currentColor" />
        </svg>
        <p className={classes.text}>{text}</p>
      </div>
    </div>
  );
}
