import { stockLabel } from '@/lib/format.ts';
import type { StockStatus } from '@/types/catalog.ts';
import classes from '@/features/catalog/StockChip.module.css';

/** Availability, as a dot and a micro-caps label. Colour is never the only signal. */
export function StockChip({ status }: { status: StockStatus }) {
  return (
    <span className={`${classes.chip} ${classes[status]}`}>
      <span className={classes.dot} aria-hidden />
      {stockLabel(status)}
    </span>
  );
}
