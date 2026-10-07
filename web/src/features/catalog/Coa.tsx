import type { MouseEvent } from 'react';
import { ArrowUpRightIcon, ChevronIcon } from '@/components/icons.tsx';
import { coaHref, coaRows, displayableCoas, type CoaRow, type CoaRowKey } from '@/features/catalog/coa-format.ts';
import { isTelegramWebApp, openExternalLink } from '@/lib/telegram-webapp.ts';
import type { ProductCoa } from '@/types/catalog.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/catalog/Coa.module.css';

/** Literal keys, so the text registry can see every one of them in use. */
const LABEL_KEYS = {
  lab: 'product.coa.lab', sample: 'product.coa.sample', amount: 'product.coa.amount',
  purity: 'product.coa.purity', batch: 'product.coa.batch', tested: 'product.coa.tested',
} as const satisfies Record<CoaRowKey, string>;

/** Inside Telegram a new tab goes nowhere: hand the absolute address to the app, which opens it properly. */
function openInTelegram(event: MouseEvent<HTMLAnchorElement>, href: string) {
  if (!isTelegramWebApp()) return;
  event.preventDefault();
  openExternalLink(new URL(href, window.location.origin).toString());
}

function ReportLink({ href, className, name, children, button }: {
  href: string; className: string; name?: string; children: string; button?: boolean;
}) {
  const { t } = useText();
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => openInTelegram(event, href)}
      {...(button ? { 'data-sf-part': 'button', 'data-variant': 'default' } : {})}
    >
      <span aria-hidden={name ? true : undefined}>{children}</span>
      <ArrowUpRightIcon size={14} />
      <span className={classes.hint}>{name ? `${t('product.coa.viewNamed', { name })}. ` : ' '}{t('product.coa.newTab')}</span>
    </a>
  );
}

function Facts({ rows }: { rows: CoaRow[] }) {
  const { t } = useText();
  if (rows.length === 0) return null;
  return (
    <dl className={classes.facts}>
      {rows.map((row) => (
        <div key={row.key} className={classes.fact}>
          <dt className={classes.term}>{t(LABEL_KEYS[row.key])}</dt>
          <dd className={row.key === 'purity' ? classes.purity : classes.value}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One earlier report: its date (or whatever names it), the few figures it has, and its own link. */
function EarlierRow({ coa }: { coa: ProductCoa }) {
  const { t } = useText();
  const rows = coaRows(coa);
  const get = (key: CoaRowKey) => rows.find((r) => r.key === key)?.value;
  const titleKey: CoaRowKey | null = (['tested', 'lab', 'sample'] as const).find((k) => get(k) !== undefined) ?? null;
  const title = titleKey ? get(titleKey)! : t('product.coa.report');
  const href = coaHref(coa);
  const lab = titleKey === 'lab' ? undefined : get('lab');
  const purity = get('purity');
  const amount = get('amount');
  const batch = get('batch');
  return (
    <li className={classes.earlier}>
      <div className={classes.what}>
        <span className={classes.when}>{title}</span>
        {lab || purity || amount || batch ? (
          <span className={classes.meta}>
            {lab ? <span>{lab}</span> : null}
            {purity ? <span><span className={classes.k}>{t('product.coa.purity')}</span> {purity}</span> : null}
            {amount ? <span>{amount}</span> : null}
            {batch ? <span><span className={classes.k}>{t('product.coa.batch')}</span> {batch}</span> : null}
          </span>
        ) : null}
      </div>
      {href ? <ReportLink href={href} className={classes.textLink} name={title}>{t('product.coa.view')}</ReportLink> : null}
    </li>
  );
}

/**
 * A product's lab report: the newest one as a plain list of facts with one clear link to the full
 * report, and any earlier ones folded away. Draws nothing when no entry has anything to show.
 */
export function Coa({ coas }: { coas: readonly ProductCoa[] | null | undefined }) {
  const { t } = useText();
  const list = displayableCoas(coas);
  if (list.length === 0) return null;
  const [latest, ...earlier] = list as [ProductCoa, ...ProductCoa[]];
  const href = coaHref(latest);
  return (
    <div className={classes.root}>
      <Facts rows={coaRows(latest)} />
      {href ? <ReportLink href={href} className={classes.cta} button>{t('product.coa.view')}</ReportLink> : null}
      {earlier.length > 0 ? (
        <details className={classes.history}>
          <summary className={classes.summary}>
            <span>{t('product.coa.previous', { count: earlier.length })}</span>
            <ChevronIcon size={16} />
          </summary>
          <ul className={classes.list}>
            {earlier.map((coa) => <EarlierRow key={coa.id} coa={coa} />)}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
