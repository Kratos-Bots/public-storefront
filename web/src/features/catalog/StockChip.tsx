import { useText } from '@/text/runtime.tsx';
import type { StockStatus } from '@/types/catalog.ts';
import classes from '@/features/catalog/StockChip.module.css';

/** Availability, as a dot and a micro-caps label. Colour is never the only signal. */
export function StockChip({ status }: { status: StockStatus }) {
  const { t } = useText();
  return (
    <span className={`${classes.chip} ${classes[status]}`} data-sf-part="badge">
      <span className={classes.dot} aria-hidden />
      {t(status === 'in' ? 'product.stock.in' : status === 'low' ? 'product.stock.low' : 'product.stock.out')}
    </span>
  );
}
