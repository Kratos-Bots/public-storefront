import { useId } from 'react';
import { useLocation } from 'react-router';
import { useText } from '@/text/runtime.tsx';
import { useSelectedWarehouse } from '@/features/warehouses/use-warehouse.ts';
import type { Warehouse } from '@/types/warehouses.ts';
import classes from '@/features/warehouses/WarehouseStrip.module.css';

/** Changing warehouse mid-checkout (or on the page that follows it) would only confuse: the choice is made while browsing. */
export function warehousePickerHidden(pathname: string): boolean {
  return /^\/(checkout|order-placed|payment)(\/|$)/.test(pathname);
}

/**
 * "Shipping from: <warehouse>" - a slim strip under the header for shops that ship from more than one
 * warehouse. Renders nothing unless the feature is on and there is a real choice (two or more), so a
 * shop without it has exactly the page it always had. Mounted by the shared header bar, which all
 * three layouts draw, rather than as a page-builder block: it is shop chrome, not owner content.
 */
export function WarehouseStrip() {
  const { warehouses, selectedId, current, select } = useSelectedWarehouse();
  const { t } = useText();
  const { pathname } = useLocation();
  const id = useId();
  if (warehouses.length < 2 || warehousePickerHidden(pathname)) return null;

  const optionLabel = (w: Warehouse) => (w.country ? t('shell.warehouse.option', { name: w.name, country: w.country }) : w.name);
  return (
    <div className={classes.strip} data-warehouse-picker="">
      <div className={classes.inner}>
        <label className={classes.field} htmlFor={id}>
          <span className={classes.label}>{t('shell.warehouse.label')}</span>
          <span className={classes.control}>
            <select
              id={id}
              className={classes.select}
              value={selectedId ?? current?.id ?? ''}
              onChange={(e) => select(Number(e.target.value))}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{optionLabel(w)}</option>
              ))}
            </select>
            <svg className={classes.caret} viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false">
              <path d="M2.25 4.5 6 8.25 9.75 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </label>
      </div>
    </div>
  );
}
