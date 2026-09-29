import { z } from 'zod';
import { themeSchema } from '@/templates/theme-schema.ts';
import { MEDIA_SRC_RE } from '@/builder/define.ts';
import { FIXED_ROUTE_KEYS, isRecord, type DocKey, type Issue, type LayoutKind, type PageSet, type PuckDoc } from '@/builder/types.ts';
import type { Theme } from '@/types/settings.ts';

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
  return key === 'shell' || (FIXED_ROUTE_KEYS as readonly string[]).includes(key) || CUSTOM_KEY_RE.test(key);
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
const pageSetSchema = z.object({
  schemaVersion: z.literal(1),
  shell: docSchema,
  pages: z.record(z.string(), docSchema),
});

const loadSchema = z.object({
  type: z.literal('sf-builder-load'),
  protocol: z.literal(BUILDER_PROTOCOL),
  loadId: z.string().min(1).max(LOAD_ID_MAX),
  layout: layoutSchema,
  pageSet: pageSetSchema.nullable(),
  theme: themeSchema,
  readOnly: z.boolean(),
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
export type ChangeMessage = { type: 'sf-builder-change'; loadId: string; pageSet: PageSet; issues: Issue[] };
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
    if (key !== 'shell' && isDocKey(key)) pages[key as keyof PageSet['pages']] = doc as unknown as PuckDoc;
  }
  return { schemaVersion: 1, shell: raw.shell as unknown as PuckDoc, pages };
}

/** Anything that is not exactly one of the four admin messages is ignored (null). */
export function parseInbound(data: unknown): Inbound | null {
  const parsed = inboundSchema.safeParse(data);
  if (!parsed.success) return null;
  const msg = parsed.data;
  switch (msg.type) {
    case 'sf-builder-load':
      return { ...msg, protocol: BUILDER_PROTOCOL, theme: toTheme(msg.theme), pageSet: msg.pageSet ? toPageSet(msg.pageSet) : null };
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

export function changeMessage(loadId: string, pageSet: PageSet, issues: Issue[]): ChangeMessage {
  const pages: PageSet['pages'] = {};
  for (const [key, doc] of Object.entries(pageSet.pages) as Array<[keyof PageSet['pages'], PuckDoc | undefined]>) {
    if (doc) pages[key] = outboundDoc(doc);
  }
  return {
    type: 'sf-builder-change',
    loadId,
    pageSet: { schemaVersion: 1, shell: outboundDoc(pageSet.shell), pages },
    // drop:* guard issues are informational — the doc still renders — and would block Publish.
    issues: issues.filter((i) => !i.rule.startsWith('drop:')).slice(0, MAX_CHANGE_ISSUES),
  };
}
