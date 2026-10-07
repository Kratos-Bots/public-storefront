import type { ProductCoa } from '@/types/catalog.ts';

/** The labelled values a certificate can show, in the order a shopper reads them. */
export type CoaRowKey = 'lab' | 'sample' | 'amount' | 'purity' | 'batch' | 'tested';
export interface CoaRow { key: CoaRowKey; value: string }

const text = (v: string | null | undefined): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s : null;
};

/** At most `digits` decimals, trailing zeros trimmed. Not localised: it is a measurement, not prose. */
function trimmed(n: number, digits: number): string {
  return String(Number(n.toFixed(digits)));
}

export function formatPurity(n: number | null | undefined): string | null {
  return typeof n === 'number' && Number.isFinite(n) ? `${trimmed(n, 3)}%` : null;
}

export function formatMg(n: number | null | undefined): string | null {
  return typeof n === 'number' && Number.isFinite(n) ? `${trimmed(n, 2)} mg` : null;
}

/**
 * Where the report lives: the lab's own page, else the uploaded file through the Worker's media route.
 * The backend only sends https lab URLs, but a link is the one thing here a shopper clicks, so anything
 * else is refused rather than trusted.
 */
export function coaHref(coa: ProductCoa): string | null {
  const url = text(coa.reportUrl);
  if (url && /^https?:\/\//i.test(url)) return url;
  // The Worker's route takes exactly a positive integer id and a 32-hex key; build nothing it would not accept
  // (the key is the credential, so a path-ish or odd value is never spliced into a URL).
  const key = text(coa.fileKey);
  return key && Number.isInteger(coa.id) && coa.id > 0 && /^[a-f0-9]{32}$/.test(key) ? `/media/coas/${coa.id}/${key}` : null;
}

/** The values the certificate has, as label key + display value; empty when it has none. */
export function coaRows(coa: ProductCoa): CoaRow[] {
  const pairs: Array<[CoaRowKey, string | null]> = [
    ['lab', text(coa.lab)],
    ['sample', text(coa.sampleName)],
    ['amount', formatMg(coa.mgAmount)],
    ['purity', formatPurity(coa.purity)],
    ['batch', text(coa.batch)],
    ['tested', text(coa.testDate)],
  ];
  return pairs.flatMap(([key, value]) => (value === null ? [] : [{ key, value }]));
}

/** Something to show: at least one value or a link to the report. */
export function hasDisplayableCoa(coa: ProductCoa): boolean {
  return coaRows(coa).length > 0 || coaHref(coa) !== null;
}

/**
 * The entries worth drawing, newest first as the backend sent them. Tolerates an absent or malformed list (older backend).
 * An entry needs an integer id (it is the React key) and the first of any repeated id wins.
 */
export function displayableCoas(coas: readonly ProductCoa[] | null | undefined): ProductCoa[] {
  if (!Array.isArray(coas)) return [];
  const seen = new Set<number>();
  return coas.filter((c) => {
    if (typeof c !== 'object' || c === null || !Number.isInteger(c.id) || seen.has(c.id) || !hasDisplayableCoa(c)) return false;
    seen.add(c.id);
    return true;
  });
}
