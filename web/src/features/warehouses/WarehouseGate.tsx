import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { Brand } from '@/components/Brand.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { useText } from '@/text/runtime.tsx';
import { promptDecision } from '@/features/warehouses/prompt.ts';
import { useWarehouseStore, warehouseEnabled } from '@/features/warehouses/store.ts';
import { markChosenThisVisit, useChosenThisVisit } from '@/features/warehouses/visit.ts';
import type { Warehouse } from '@/types/warehouses.ts';
import classes from '@/features/warehouses/WarehouseGate.module.css';

/**
 * Asks "where should we ship from?" before any catalogue, once per visit, for shops that ship from
 * more than one warehouse and have switched the prompt on. Everything else passes straight through
 * with no wrapper element, so a shop without the prompt renders exactly what it always did. Settings
 * are resolved before the router mounts (SettingsBoundary), and `warehouseEnabled` reads the cached
 * settings until the sync pushes its answer, so the first render is `wait`, never the catalogue.
 */
export function WarehouseGate({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const ctx = useWarehouseStore((s) => s.ctx);
  const stored = useWarehouseStore((s) => s.warehouseId);
  const choose = useWarehouseStore((s) => s.choose);
  const chosen = useChosenThisVisit();
  const { pathname } = useLocation();
  const decision = promptDecision({
    promptOn: settings.features?.warehousePrompt === true,
    enabled: warehouseEnabled(ctx),
    list: ctx.list,
    failed: ctx.failed,
    chosen,
    builder: isBuilderMode(),
    pathname,
  });
  if (decision === 'pass') return <>{children}</>;
  if (decision === 'wait') return <PageSkeleton />;
  const pick = (w: Warehouse) => {
    choose(w.isDefault ? null : w.id);
    markChosenThisVisit();
  };
  return <Chooser list={ctx.list ?? []} stored={stored} onPick={pick} />;
}

function Chooser({ list, stored, onPick }: { list: Warehouse[]; stored: number | null; onPick: (w: Warehouse) => void }) {
  const { t } = useText();
  const heading = useRef<HTMLHeadingElement>(null);
  const uid = useId();
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <main className={classes.root} data-warehouse-prompt="">
      <div className={classes.panel}>
        <div className={classes.brand}>
          <Brand size="lg" />
        </div>
        <h1 ref={heading} tabIndex={-1} className={classes.title}>{t('shell.warehouse.prompt.title')}</h1>
        <p className={classes.lede}>{t('shell.warehouse.prompt.lede')}</p>
        <ul className={classes.list}>
          {list.map((w) => {
            const paused = w.orderingEnabled === false;
            // Only a non-default choice is remembered, so the default never carries the tag.
            const last = !w.isDefault && w.id === stored;
            const note = paused ? (w.orderingMessage?.trim() || t('shell.warehouse.paused.notice', { warehouse: w.name })) : null;
            const detail = `${uid}-${w.id}`;
            return (
              <li key={w.id}>
                <button
                  type="button"
                  className={classes.card}
                  aria-label={t('shell.warehouse.prompt.choose', { warehouse: w.name })}
                  aria-describedby={last || paused ? detail : undefined}
                  onClick={() => onPick(w)}
                >
                  <span className={classes.body}>
                    <span className={classes.name}>
                      {w.country ? t('shell.warehouse.option', { name: w.name, country: w.country }) : w.name}
                    </span>
                    {last || paused ? (
                      <span id={detail} className={classes.meta}>
                        {last ? <span className={classes.tag}>{t('shell.warehouse.prompt.lastTime')}</span> : null}
                        {paused ? <span className={classes.paused}>{t('shell.warehouse.paused.badge')}</span> : null}
                        {note ? <span className={classes.note}>{note}</span> : null}
                      </span>
                    ) : null}
                  </span>
                  <svg className={classes.arrow} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                    <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
