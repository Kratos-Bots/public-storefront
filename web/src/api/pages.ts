import { api, unwrap } from '@/api/client.ts';
import { CARD_KINDS, isRecord, type LayoutKind, type PageSet, type PuckDoc } from '@/builder/types.ts';
import { isLocale, isTextValue, type LocaleStrings, type PublishedText } from '@/text/types.ts';

/** Product-parts §10.3: only `tile` / `row` whose value is a doc shape; a malformed `cards` is dropped alone. */
export function cardsOf(raw: unknown): PageSet['cards'] | undefined {
  if (!isRecord(raw)) return undefined;
  const out: NonNullable<PageSet['cards']> = {};
  for (const kind of CARD_KINDS) {
    const doc = Object.hasOwn(raw, kind) ? raw[kind] : undefined;
    if (isRecord(doc) && Array.isArray(doc.content)) out[kind] = doc as unknown as PuckDoc;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** `{ version, data }` from the public route → the set, or null for anything that is not a schema-1 set. */
export function toPageSet(body: unknown): PageSet | null {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  const set = body.data;
  if (set.schemaVersion !== 1 || !isRecord(set.shell) || !isRecord(set.pages)) return null;
  const { cards, ...rest } = set;
  const clean = cardsOf(cards);
  return { ...(rest as unknown as PageSet), ...(clean ? { cards: clean } : {}) };
}

/** Every page waits on the set before its first paint; past this it paints the defaults instead. */
export const PAGE_SET_TIMEOUT_MS = 4000;

/**
 * `retry: 0`, a short timeout, and no shopper token: the route is public, and a request without
 * Authorization is one the Worker can edge-cache for signed-in shoppers too. The shared client's
 * hook sets the header first; this per-request hook runs after it and takes it off again.
 */
export const PAGE_SET_REQUEST = {
  retry: 0,
  timeout: PAGE_SET_TIMEOUT_MS,
  hooks: { beforeRequest: [(request: Request) => { request.headers.delete('Authorization'); }] },
};

/** One read of `storefront/pages/:layout` (spec §5): the layout's published set and the active locale's two text layers. */
export interface Published { pageSet: PageSet | null; text: PublishedText | null }
const NOTHING: Published = Object.freeze({ pageSet: null, text: null }) as Published;

function toLocaleStrings(v: unknown): LocaleStrings | null {
  if (!isRecord(v)) return null;
  const out: LocaleStrings = {};
  // A malformed value is dropped per key; the resolver re-checks everything else against this release.
  for (const [k, val] of Object.entries(v)) if (isTextValue(val)) out[k] = val;
  return out;
}

export function toPublishedText(raw: unknown): PublishedText | null {
  if (!isRecord(raw)) return null;
  const { version, locale, formatLocale } = raw;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) return null;
  if (!isLocale(locale)) return null;
  if (formatLocale !== '' && !isLocale(formatLocale)) return null;
  const shared = toLocaleStrings(raw.shared);
  const layout = toLocaleStrings(raw.layout);
  if (!shared || !layout) return null;
  return { version, locale, formatLocale: formatLocale as PublishedText['formatLocale'], shared, layout };
}

/** `data` of the public read → Published. A v0.7.0 backend sends no `text`; a malformed `text` alone is dropped. */
export function toPublished(body: unknown): Published {
  if (!isRecord(body)) return NOTHING;
  return { pageSet: toPageSet(body), text: toPublishedText(body.text) };
}

/**
 * The latest published set and text for a layout. Never rejects: a 404 (backend older than
 * v0.7.0), a 503 (kill switch), a timeout, a network error or a malformed body all mean
 * "nothing published", and every page renders its default document. `retry: 0`: the shared
 * client retries a GET once, which would make a 503 two requests on every page load.
 */
export async function fetchPublished(layout: LayoutKind): Promise<Published> {
  try {
    return toPublished(await unwrap<unknown>(api.get(`storefront/pages/${layout}`, PAGE_SET_REQUEST)));
  } catch {
    return NOTHING;
  }
}

/** v0.7.0's entry point, kept for callers that only need the set. */
export async function fetchPageSet(layout: LayoutKind): Promise<PageSet | null> {
  return (await fetchPublished(layout)).pageSet;
}
