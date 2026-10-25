import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { Brand } from '@/components/Brand.tsx';
import { HelpIcon } from '@/components/icons.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { useFaqAvailable } from '@/features/faq/use-faq-available.ts';
import { useText } from '@/text/runtime.tsx';
import { promptDecision } from '@/features/warehouses/prompt.ts';
import { buildPickerTree, findGroupEntry } from '@/features/warehouses/picker-tree.ts';
import { useWarehouseStore, warehouseEnabled } from '@/features/warehouses/store.ts';
import { markChosenThisVisit, useChosenThisVisit } from '@/features/warehouses/visit.ts';
import type { Warehouse, WarehouseGroup } from '@/types/warehouses.ts';
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
  return <Chooser list={ctx.list ?? []} groups={ctx.groups ?? []} stored={stored} onPick={pick} />;
}

function Chooser({ list, groups, stored, onPick }: { list: Warehouse[]; groups: WarehouseGroup[]; stored: number | null; onPick: (w: Warehouse) => void }) {
  const { t } = useText();
  const heading = useRef<HTMLHeadingElement>(null);
  const uid = useId();
  const { supportLinks, brand, support } = useSettings();
  const faq = useFaqAvailable();
  const [openGroupId, setOpenGroupId] = useState<number | null>(null);
  const tree = useMemo(() => buildPickerTree(list, groups), [list, groups]);
  // A group that vanished or collapsed to one warehouse while it was open leaves `open` null: the top screen.
  const open = openGroupId !== null ? findGroupEntry(tree, openGroupId) : null;
  // The Help page has something for the shopper: tickets, an FAQ, or a way to reach the shop.
  const canHelp = support?.enabled === true || faq || supportLinks.length > 0 || Boolean(brand.links.whatsapp || brand.links.telegram);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [openGroupId]);
  const groupDescription = open?.group.description?.trim() || null;

  return (
    <main className={classes.root} data-warehouse-prompt="">
      <div className={classes.panel}>
        <div className={classes.brand}>
          <Brand size="lg" />
        </div>
        {open ? (
          <button type="button" className={classes.back} onClick={() => setOpenGroupId(null)}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M10 3.5 5.5 8 10 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t('shell.warehouse.prompt.back')}
          </button>
        ) : null}
        <h1 ref={heading} tabIndex={-1} className={classes.title}>{open ? open.group.name : t('shell.warehouse.prompt.title')}</h1>
        {open ? (groupDescription ? <p className={classes.lede}>{groupDescription}</p> : null) : <p className={classes.lede}>{t('shell.warehouse.prompt.lede')}</p>}
        <ul className={classes.list}>
          {(open ? open.warehouses.map((warehouse) => ({ kind: 'warehouse' as const, warehouse })) : tree).map((entry) => {
            if (entry.kind === 'group') {
              const { group } = entry;
              const last = entry.warehouses.some((w) => !w.isDefault && w.id === stored);
              const detail = `${uid}-g${group.id}`;
              const about = `${detail}-about`;
              const description = group.description?.trim() || null;
              const describedBy = [description ? about : null, detail].filter(Boolean).join(' ');
              return (
                <li key={`g${group.id}`}>
                  <button
                    type="button"
                    className={classes.card}
                    aria-label={t('shell.warehouse.prompt.openGroup', { group: group.name })}
                    aria-describedby={describedBy}
                    onClick={() => setOpenGroupId(group.id)}
                  >
                    <span className={classes.body}>
                      <span className={classes.name}>{group.name}</span>
                      {description ? <span id={about} className={classes.description}>{description}</span> : null}
                      <span id={detail} className={classes.meta}>
                        <span className={classes.count}>{t('shell.warehouse.prompt.groupCount', { count: entry.warehouses.length })}</span>
                        {last ? <span className={classes.tag}>{t('shell.warehouse.prompt.lastTime')}</span> : null}
                      </span>
                    </span>
                    <svg className={classes.arrow} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              );
            }
            return <WarehouseCard key={entry.warehouse.id} w={entry.warehouse} stored={stored} onPick={onPick} />;
          })}
        </ul>
        {canHelp ? (
          <p className={classes.help}>
            <Link to="/help" className={classes.helpLink}>
              <HelpIcon size={18} />
              {t('shell.warehouse.prompt.help')}
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}

/** One warehouse button: the whole card is the tap target. Shared by the top screen and a group's screen. */
function WarehouseCard({ w, stored, onPick }: { w: Warehouse; stored: number | null; onPick: (w: Warehouse) => void }) {
  const { t } = useText();
  const uid = useId();
  const paused = w.orderingEnabled === false;
  // Only a non-default choice is remembered, so the default never carries the tag.
  const last = !w.isDefault && w.id === stored;
  const note = paused ? w.orderingMessage?.trim() || null : null;
  const detail = `${uid}-${w.id}`;
  const about = `${detail}-about`;
  const description = w.description?.trim() || null;
  const describedBy = [description ? about : null, last || paused ? detail : null].filter(Boolean).join(' ') || undefined;
  return (
    <li>
      <button
        type="button"
        className={classes.card}
        aria-label={t('shell.warehouse.prompt.choose', { warehouse: w.name })}
        aria-describedby={describedBy}
        onClick={() => onPick(w)}
      >
        <span className={classes.body}>
          <span className={classes.name}>
            {w.country ? t('shell.warehouse.option', { name: w.name, country: w.country }) : w.name}
          </span>
          {description ? <span id={about} className={classes.description}>{description}</span> : null}
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
}
