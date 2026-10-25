import { useId, useMemo } from 'react';
import { useLocation } from 'react-router';
import { useText } from '@/text/runtime.tsx';
import { useWarehouseStore } from '@/features/warehouses/store.ts';
import { buildPickerTree } from '@/features/warehouses/picker-tree.ts';
import { useSelectedWarehouse } from '@/features/warehouses/use-warehouse.ts';
import { markChosenThisVisit } from '@/features/warehouses/visit.ts';
import type { Warehouse } from '@/types/warehouses.ts';
import { isWarehouseBarRoute } from '@/features/warehouses/bar-route.ts';
import classes from '@/features/warehouses/WarehouseStrip.module.css';

/**
 * "Shipping from: <warehouse>" - a slim strip pinned in the header (WarehouseBar) for shops that ship from more than one
 * warehouse. Renders nothing unless the feature is on and there is a real choice (two or more), so a
 * shop without it has exactly the page it always had. Mounted by the shared header bar, which all
 * three layouts draw, rather than as a page-builder block: it is shop chrome, not owner content.
 */
export function WarehouseStrip() {
  const { warehouses, selectedId, current, select } = useSelectedWarehouse();
  const { t } = useText();
  const { pathname } = useLocation();
  const id = useId();
  const groups = useWarehouseStore((s) => s.ctx.groups);
  const tree = useMemo(() => buildPickerTree(warehouses, groups ?? []), [warehouses, groups]);
  if (warehouses.length < 2 || !isWarehouseBarRoute(pathname)) return null;

  const optionLabel = (w: Warehouse) => {
    const label = w.country ? t('shell.warehouse.option', { name: w.name, country: w.country }) : w.name;
    return w.orderingEnabled === false ? `${label} (${t('shell.warehouse.paused.badge')})` : label;
  };
  // A shopper who switches from the header has chosen, so the pick-first prompt does not ask again.
  const choose = (value: string) => {
    select(Number(value));
    markChosenThisVisit();
  };
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
              onChange={(e) => choose(e.target.value)}
            >
              {tree.map((e) =>
                e.kind === 'group' ? (
                  <optgroup key={`g${e.group.id}`} label={e.group.name}>
                    {e.warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{optionLabel(w)}</option>
                    ))}
                  </optgroup>
                ) : (
                  <option key={e.warehouse.id} value={e.warehouse.id}>{optionLabel(e.warehouse)}</option>
                ),
              )}
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
