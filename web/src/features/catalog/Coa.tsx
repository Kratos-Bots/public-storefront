import type { MouseEvent } from 'react';
import { ArrowUpRightIcon, ChevronIcon } from '@/components/icons.tsx';
import { coaHref, coaRows, displayableCoas, type CoaRow, type CoaRowKey } from '@/features/catalog/coa-format.ts';
import { isTelegramWebApp, openExternalLink } from '@/lib/telegram-webapp.ts';
import type { ProductCoa } from '@/types/catalog.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/catalog/Coa.module.css';

/** Literal keys, so the text registry can see every one of them in use. */
const LABEL_KEYS = {
  lab: 'product.coa.lab', amount: 'product.coa.amount',
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
      {...(button ? { 'data-sf-part': 'button', 'data-variant': 'filled' } : {})}
    >
      <span className={button ? classes.ctaText : undefined} aria-hidden={name ? true : undefined}>{children}</span>
      <ArrowUpRightIcon size={14} />
      <span className={classes.hint}>{name ? `${t('product.coa.viewNamed', { name })}. ` : ' '}{t('product.coa.newTab')}</span>
    </a>
  );
}

/** "99.957%" -> the number large, its unit small, so the figure reads as a measurement rather than a price. */
function Figure({ value }: { value: string }) {
  const match = /^([\d.,]+)(.*)$/.exec(value);
  if (!match || !match[2]) return <>{value}</>;
  return <>{match[1]}<span className={classes.unit}>{match[2]}</span></>;
}

/** Purity and amount: the two numbers a shopper checks first, set large. */
function Figures({ rows }: { rows: CoaRow[] }) {
  const { t } = useText();
  if (rows.length === 0) return null;
  return (
    <dl className={classes.figures}>
      {rows.map((row) => (
        <div key={row.key} className={classes.figure}>
          <dt className={classes.term}>{t(LABEL_KEYS[row.key])}</dt>
          <dd className={classes.big}><Figure value={row.value} /></dd>
        </div>
      ))}
    </dl>
  );
}

/** Batch and test date: small label-value pairs on one centred line that wraps when it must. */
function Facts({ rows }: { rows: CoaRow[] }) {
  const { t } = useText();
  if (rows.length === 0) return null;
  return (
    <dl className={classes.facts}>
      {rows.map((row) => (
        <div key={row.key} className={classes.fact}>
          <dt className={classes.term}>{t(LABEL_KEYS[row.key])}</dt>
          <dd className={row.key === 'batch' ? classes.code : classes.value}>{row.value}</dd>
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
  const titleKey: CoaRowKey | null = (['tested', 'lab'] as const).find((k) => get(k) !== undefined) ?? null;
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
        {purity ? <span className={classes.meta}><span className={classes.k}>{t('product.coa.purity')}</span> {purity}</span> : null}
        {amount ? <span className={classes.meta}>{amount}</span> : null}
        {batch ? <span className={classes.meta}><span className={classes.k}>{t('product.coa.batch')}</span> {batch}</span> : null}
        {lab ? <span className={classes.meta}>{lab}</span> : null}
      </div>
      {href ? <ReportLink href={href} className={classes.textLink} name={title}>{t('product.coa.view')}</ReportLink> : null}
    </li>
  );
}

/**
 * A product's lab report as one compact card: purity and amount as the headline figures, the supporting facts
 * underneath, one full-width button out to the report, and any earlier reports folded into the card's foot.
 * Draws nothing when no entry has anything to show.
 */
export function Coa({ coas }: { coas: readonly ProductCoa[] | null | undefined }) {
  const { t } = useText();
  const list = displayableCoas(coas);
  if (list.length === 0) return null;
  const [latest, ...earlier] = list as [ProductCoa, ...ProductCoa[]];
  const href = coaHref(latest);
  const rows = coaRows(latest);
  const figures = rows.filter((r) => r.key === 'purity' || r.key === 'amount');
  // Purity leads the amount whatever order the rows come in.
  figures.sort((a, b) => (a.key === 'purity' ? -1 : 1) - (b.key === 'purity' ? -1 : 1));
  const lab = rows.find((r) => r.key === 'lab')?.value;
  // The lab is named on the button when there is one; with no link to put it on, it stays a fact.
  const facts = rows.filter((r) => r.key !== 'purity' && r.key !== 'amount' && !(r.key === 'lab' && href));
  return (
    <div className={classes.root} data-sf-part="card">
      <div className={classes.body}>
        <Figures rows={figures} />
        <Facts rows={facts} />
        {href ? (
          <ReportLink href={href} className={classes.cta} button>
            {lab ? t('product.coa.viewFrom', { lab }) : t('product.coa.view')}
          </ReportLink>
        ) : null}
      </div>
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
