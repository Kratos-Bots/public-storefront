import { TEXT_LIMITS, type Locale, type LocaleStrings, type PageText, type PluralForms, type SiteText, type TextLanguage, type TextValue } from '@/text/types.ts';

/**
 * The editor's view of text values (spec §3, §7.4). Pure: no store, no registry. What the backend
 * refuses on autosave (spec §4.3) is mirrored in `isPostable`, so the editor can keep a half-typed
 * value on screen — with an issue — without ever posting it.
 */

export type TextScope = 'shared' | 'layout';
/** One blocking text problem, as posted in sf-builder-change `textIssues` (spec §7.1). */
export interface TextIssue { scope: TextScope; key: string; rule: string; message: string }
export type StringsByLocale = Record<Locale, LocaleStrings>;

export const PLURAL_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;
export type PluralForm = (typeof PLURAL_FORMS)[number];
export const DEFAULT_LANGUAGE: TextLanguage = { locale: 'en', formatLocale: '' };

export const emptySiteText = (): SiteText => ({ schemaVersion: 1, language: { ...DEFAULT_LANGUAGE }, strings: {} });
export const emptyPageText = (): PageText => ({ strings: {} });

const CONTROL_RE = /[\u0000-\u0009\u000B-\u001F\u007F]/;
const CONTROL_RE_G = /[\u0000-\u0009\u000B-\u001F\u007F]/g;
const PLACEHOLDER_RE_G = /\{[A-Za-z][A-Za-z0-9]{0,31}\}/g;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** What can be typed or pasted: control characters go (a tab becomes a space); newlines stay. */
export function cleanInput(text: string): string {
  return text.replace(CONTROL_RE_G, (c) => (c === '\t' ? ' ' : ''));
}

/** '' → null (reset). A plural keeps its non-empty forms in CLDR order; none left → null. */
export function normalizeValue(value: TextValue | null | undefined): TextValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const s = cleanInput(value);
    return s === '' ? null : s;
  }
  const out: Partial<Record<PluralForm, string>> = {};
  for (const form of PLURAL_FORMS) {
    const v = (value as Partial<Record<PluralForm, unknown>>)[form];
    if (typeof v === 'string') {
      const s = cleanInput(v);
      if (s !== '') out[form] = s;
    }
  }
  return Object.keys(out).length === 0 ? null : (out as PluralForms);
}

const sameValue = (a: TextValue, b: TextValue): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Set (or with null/'' reset) one key in one locale. Returns `strings` itself when nothing changed. */
export function withValue(strings: StringsByLocale, locale: Locale, key: string, value: TextValue | null): StringsByLocale {
  const next = normalizeValue(value);
  const current = strings[locale]?.[key];
  if (next === null ? current === undefined : current !== undefined && sameValue(current, next)) return strings;
  const map: LocaleStrings = { ...(strings[locale] ?? {}) };
  if (next === null) delete map[key];
  else map[key] = next;
  const out: StringsByLocale = { ...strings };
  if (Object.keys(map).length === 0) delete out[locale];
  else out[locale] = map;
  return out;
}

function isPostableString(s: unknown): s is string {
  if (typeof s !== 'string' || s.length < 1 || s.length > TEXT_LIMITS.value) return false;
  if (CONTROL_RE.test(s)) return false;
  if (/[{}]/.test(s.replace(PLACEHOLDER_RE_G, ''))) return false;
  return new Set(s.match(PLACEHOLDER_RE_G) ?? []).size <= TEXT_LIMITS.placeholders;
}

/** Would the backend's `siteTextSchema` accept this value (spec §4.3)? Registry rules are not checked here. */
export function isPostable(value: unknown): boolean {
  if (typeof value === 'string') return isPostableString(value);
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (!keys.includes('other')) return false;
  return keys.every((k) => (PLURAL_FORMS as readonly string[]).includes(k) && isPostableString(value[k]));
}

function postableStrings(strings: StringsByLocale): StringsByLocale {
  const out: StringsByLocale = {};
  for (const [locale, map] of Object.entries(strings)) {
    const kept: LocaleStrings = {};
    for (const [key, v] of Object.entries(map)) if (isPostable(v)) kept[key] = v;
    if (Object.keys(kept).length > 0) out[locale] = kept;
  }
  return out;
}

export const hasStrings = (strings: StringsByLocale): boolean => Object.values(strings).some((m) => Object.keys(m).length > 0);

export function postableSiteText(doc: SiteText): SiteText {
  return { schemaVersion: 1, language: { locale: doc.language.locale, formatLocale: doc.language.formatLocale }, strings: postableStrings(doc.strings) };
}

/** undefined = nothing to send: `toPageSet` then omits `text`. */
export function postablePageText(doc: PageText): PageText | undefined {
  const strings = postableStrings(doc.strings);
  return hasStrings(strings) ? { strings } : undefined;
}

export function valueStrings(value: TextValue | undefined): string[] {
  if (value === undefined) return [];
  return typeof value === 'string' ? [value] : Object.values(value).filter((v): v is string => typeof v === 'string');
}
