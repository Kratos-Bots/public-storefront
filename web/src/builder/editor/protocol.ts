import { z } from 'zod';
import { themeSchema } from '@/templates/theme-schema.ts';
import { MEDIA_SRC_RE } from '@/builder/define.ts';
import { CARD_KINDS, FIXED_ROUTE_KEYS, isCardKey, isRecord, type DocKey, type Issue, type LayoutKind, type PageSet, type PuckDoc } from '@/builder/types.ts';
import type { Theme } from '@/types/settings.ts';
import type { PageText, SiteText } from '@/text/types.ts';
import type { TextIssue } from '@/builder/editor/text/model.ts';
import { isStoreLocale } from '@/builder/editor/text/languages.ts';

/**
 * Spec §13 A6. The admin mirrors these shapes in
 * ecommerce-admin-frontend/src/features/storefront-settings/pages/protocol.ts — keep the two in step.
 */
export const BUILDER_PROTOCOL = 1 as const;

const CUSTOM_KEY_RE = /^page:[a-z0-9-]{1,60}$/;
/** What the admin may hand back as an uploaded image (spec A3): only the stored-media path the renderer accepts. */
export const UPLOAD_URL_RE = MEDIA_SRC_RE;
/** Same bound as the admin's LOAD_ID_MAX. */
export const LOAD_ID_MAX = 64;
/** The admin rejects a change carrying more issues than this. */
export const MAX_CHANGE_ISSUES = 500;
export const MAX_REQUEST_ID = 100;

export function isDocKey(key: string): key is DocKey {
  return key === 'shell' || isCardKey(key) || (FIXED_ROUTE_KEYS as readonly string[]).includes(key) || CUSTOM_KEY_RE.test(key);
}

const layoutSchema = z.enum(['storefront', 'menu', 'webapp']);
const docKeySchema = z.custom<DocKey>((v) => typeof v === 'string' && isDocKey(v));

// Structural only: the guard (validateDoc) is what decides whether a doc renders.
const componentSchema = z.looseObject({ type: z.string(), props: z.looseObject({ id: z.string() }) });
const docSchema = z.looseObject({
  root: z.looseObject({ props: z.record(z.string(), z.unknown()) }),
  content: z.array(componentSchema),
  zones: z.record(z.string(), z.array(componentSchema)).optional(),
});
// Structural only, like the docs: registry rules (unknown keys, placeholders, caps) are the
// editor's issues, not reasons to refuse a load. Locales must be real tags — Intl would throw.
const localeSchema = z.string().refine(isStoreLocale);
const textValueSchema = z.union([z.string(), z.record(z.string(), z.string())]);
const stringsSchema = z.record(localeSchema, z.record(z.string(), textValueSchema));
// A layout's overrides are read per language: a bad tag drops that language only (toPageSet), as
// a malformed siteText drops only the shared layer — never the whole load.
const pageTextSchema = z.object({ strings: z.record(z.string(), z.record(z.string(), textValueSchema)) });
const siteTextSchema = z.object({
  schemaVersion: z.literal(1),
  language: z.object({ locale: localeSchema, formatLocale: z.union([z.literal(''), localeSchema]) }),
  strings: stringsSchema,
});
const pageSetSchema = z.object({
  schemaVersion: z.literal(1),
  shell: docSchema,
  pages: z.record(z.string(), docSchema),
  // Spec §7.1: dropping this would erase every layout override on the next autosave.
  text: pageTextSchema.optional(),
  // Product-parts §10.3: without this the strict schema would strip every card design on load.
  cards: z.unknown().optional(),
});

const loadSchema = z.object({
  type: z.literal('sf-builder-load'),
  protocol: z.literal(BUILDER_PROTOCOL),
  loadId: z.string().min(1).max(LOAD_ID_MAX),
  layout: layoutSchema,
  pageSet: pageSetSchema.nullable(),
  theme: themeSchema,
  readOnly: z.boolean(),
  // Read separately (siteTextOf): a malformed doc must not drop the load.
  siteText: z.unknown().optional(),
});
const themeMessageSchema = z.object({ type: z.literal('sf-builder-theme'), theme: themeSchema });
// The admin never sends this today (spec A6 keeps it); nothing may rely on it.
const selectSchema = z.object({ type: z.literal('sf-builder-select-page'), docKey: docKeySchema });
const uploadResultSchema = z.object({
  type: z.literal('sf-builder-upload-result'),
  requestId: z.string().min(1).max(MAX_REQUEST_ID),
  url: z.string().regex(UPLOAD_URL_RE).nullable(),
  error: z.string().max(500).nullable(),
});

const inboundSchema = z.discriminatedUnion('type', [loadSchema, themeMessageSchema, selectSchema, uploadResultSchema]);

export interface LoadMessage {
  type: 'sf-builder-load';
  protocol: 1;
  /** Load identity: every sf-builder-change produced from this load echoes it. */
  loadId: string;
  layout: LayoutKind;
  pageSet: PageSet | null;
  theme: Theme;
  readOnly: boolean;
  /**
   * Spec §7.1. undefined (absent) = the admin can't save shared text: layout overrides only, shared
   * read-only. null = none stored yet. A malformed doc is treated as absent, never as "none".
   */
  siteText?: SiteText | null;
}
export type Inbound =
  | LoadMessage
  | { type: 'sf-builder-theme'; theme: Theme }
  | { type: 'sf-builder-select-page'; docKey: DocKey }
  | { type: 'sf-builder-upload-result'; requestId: string; url: string | null; error: string | null };

/** Widths the admin sizes the frame to; null = fill the available width. */
export const VIEWPORT_WIDTHS = [360, 768, 1280] as const;
export type ViewportWidth = (typeof VIEWPORT_WIDTHS)[number];

export type ReadyMessage = { type: 'sf-builder-ready'; protocol: 1 };
/** The text half of a change (spec §7.1); mirrors the admin's BuilderChangeText. */
export interface ChangeText {
  /** Only when the load carried siteText (a doc or null); always the full shared doc, never null. */
  siteText?: SiteText;
  textIssues: TextIssue[];
}
export type ChangeMessage = {
  type: 'sf-builder-change'; loadId: string; pageSet: PageSet; issues: Issue[];
  siteText?: SiteText; textIssues?: TextIssue[];
};
export type UploadRequestMessage = { type: 'sf-builder-upload-request'; requestId: string; file: File };
export type ViewportMessage = { type: 'sf-builder-viewport'; width: ViewportWidth | null };
export type Outbound = ReadyMessage | ChangeMessage | UploadRequestMessage | ViewportMessage;

/** Draft CSS never applies in a frameable page (see preview-listener.ts). */
function toTheme(theme: z.infer<typeof themeSchema>): Theme {
  return { ...theme, customCss: '' } as Theme;
}

function toPageSet(raw: z.infer<typeof pageSetSchema>): PageSet {
  const pages: PageSet['pages'] = {};
  for (const [key, doc] of Object.entries(raw.pages)) {
    if (key !== 'shell' && isDocKey(key) && !isCardKey(key)) pages[key as keyof PageSet['pages']] = doc as unknown as PuckDoc;
  }
  const text = raw.text ? pageTextOf(raw.text) : undefined;
  const cards = cardsFrom(raw.cards);
  return { schemaVersion: 1, shell: raw.shell as unknown as PuckDoc, pages, ...(text ? { text } : {}), ...(cards ? { cards } : {}) };
}

function cardsFrom(raw: unknown): PageSet['cards'] | undefined {
  if (!isRecord(raw)) return undefined;
  const out: NonNullable<PageSet['cards']> = {};
  for (const kind of CARD_KINDS) {
    const parsed = Object.hasOwn(raw, kind) ? docSchema.safeParse(raw[kind]) : null;
    if (parsed?.success) out[kind] = parsed.data as unknown as PuckDoc;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Languages with a tag the backend refuses (Intl could throw on it) are dropped; none left = none. */
function pageTextOf(raw: z.infer<typeof pageTextSchema>): PageText | undefined {
  const strings: PageText['strings'] = {};
  for (const [locale, map] of Object.entries(raw.strings)) {
    if (isStoreLocale(locale)) strings[locale] = map as PageText['strings'][string];
    else if (import.meta.env.DEV) console.warn(`[builder] ignored this layout's wording in "${locale}": not a language tag`);
  }
  return Object.keys(strings).length > 0 ? { strings } : undefined;
}

function siteTextOf(raw: unknown): SiteText | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const parsed = siteTextSchema.safeParse(raw);
  if (parsed.success) return parsed.data as SiteText;
  if (import.meta.env.DEV) console.warn('[builder] ignored a malformed siteText; shared text is read-only for this load', parsed.error.issues[0]);
  return undefined;
}

/** Anything that is not exactly one of the four admin messages is ignored (null). */
export function parseInbound(data: unknown): Inbound | null {
  const parsed = inboundSchema.safeParse(data);
  if (!parsed.success) return null;
  const msg = parsed.data;
  switch (msg.type) {
    case 'sf-builder-load': {
      const { siteText: rawSiteText, ...rest } = msg;
      const siteText = siteTextOf(rawSiteText);
      return {
        ...rest,
        protocol: BUILDER_PROTOCOL,
        theme: toTheme(msg.theme),
        pageSet: msg.pageSet ? toPageSet(msg.pageSet) : null,
        // Key presence is the signal: absent stays absent, never `siteText: undefined`.
        ...(siteText === undefined ? {} : { siteText }),
      };
    }
    case 'sf-builder-theme':
      return { type: msg.type, theme: toTheme(msg.theme) };
    default:
      return msg;
  }
}

// ---- storefront → admin ---------------------------------------------------------

export function readyMessage(): ReadyMessage {
  return { type: 'sf-builder-ready', protocol: BUILDER_PROTOCOL };
}

export function uploadRequestMessage(requestId: string, file: File): UploadRequestMessage {
  return { type: 'sf-builder-upload-request', requestId, file };
}

export function viewportMessage(width: ViewportWidth | null): ViewportMessage {
  return { type: 'sf-builder-viewport', width: width !== null && (VIEWPORT_WIDTHS as readonly number[]).includes(width) ? width : null };
}

const HTML_KEY_RE = /Html$/;

/**
 * A plain-data copy fit for postMessage and the admin's zod: every `*Html` value at any depth is a
 * string ('' when it was anything else), and non-data values (functions, symbols) are dropped.
 */
function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain);
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (HTML_KEY_RE.test(key)) out[key] = typeof v === 'string' ? v : '';
      else if (typeof v !== 'function' && typeof v !== 'symbol') out[key] = plain(v);
    }
    return out;
  }
  return value;
}

/** Every doc the admin receives has a root.props object and a content array. */
function outboundDoc(doc: PuckDoc): PuckDoc {
  const copy = (isRecord(doc) ? plain(doc) : {}) as Record<string, unknown>;
  const root = isRecord(copy.root) ? copy.root : {};
  return {
    ...copy,
    root: { ...root, props: isRecord(root.props) ? root.props : {} },
    content: Array.isArray(copy.content) ? copy.content : [],
  } as unknown as PuckDoc;
}

export function changeMessage(loadId: string, pageSet: PageSet, issues: Issue[], text?: ChangeText): ChangeMessage {
  const pages: PageSet['pages'] = {};
  for (const [key, doc] of Object.entries(pageSet.pages) as Array<[keyof PageSet['pages'], PuckDoc | undefined]>) {
    if (doc) pages[key] = outboundDoc(doc);
  }
  const out: PageSet = { schemaVersion: 1, shell: outboundDoc(pageSet.shell), pages };
  if (pageSet.text) out.text = plain(pageSet.text) as PageText;
  const cards: NonNullable<PageSet['cards']> = {};
  for (const kind of CARD_KINDS) { const doc = pageSet.cards?.[kind]; if (doc) cards[kind] = outboundDoc(doc); }
  if (Object.keys(cards).length > 0) out.cards = cards;
  return {
    type: 'sf-builder-change',
    loadId,
    pageSet: out,
    // drop:* guard issues are informational — the doc still renders — and would block Publish.
    issues: issues.filter((i) => !i.rule.startsWith('drop:')).slice(0, MAX_CHANGE_ISSUES),
    // Never null: posting "no shared text" would overwrite the store's shared doc with nothing.
    ...(text?.siteText ? { siteText: plain(text.siteText) as SiteText } : {}),
    ...(text ? { textIssues: text.textIssues.slice(0, MAX_CHANGE_ISSUES) } : {}),
  };
}
