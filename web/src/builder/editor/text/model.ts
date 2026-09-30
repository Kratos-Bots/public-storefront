import { KEY_RE, TEXT_LIMITS, isLocale, type Locale, type LocaleStrings, type PageText, type SiteText, type TextLanguage, type TextValue } from '@/text/types.ts';

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

/** What the editor holds while typing: a plural may not have `other` yet. Only postable drafts are TextValues. */
export type DraftValue = string | Partial<Record<PluralForm, string>>;

const has = (o: object, k: string): boolean => Object.hasOwn(o, k);
/** Own-key copy into a null-prototype object, so keys like 'constructor' or '__proto__' are plain data. */
function dict<T>(entries: Iterable<readonly [string, T]> = []): Record<string, T> {
  const out = Object.create(null) as Record<string, T>;
  for (const [k, v] of entries) Object.defineProperty(out, k, { value: v, writable: true, enumerable: true, configurable: true });
  return out;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** What can be typed or pasted: control characters go (a tab becomes a space); newlines stay. */
export function cleanInput(text: string): string {
  return text.replace(CONTROL_RE_G, (c) => (c === '\t' ? ' ' : ''));
}

/** '' → null (reset). A plural keeps its non-empty forms in CLDR order; none left → null. */
export function normalizeValue(value: DraftValue | null | undefined): DraftValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const s = cleanInput(value);
    return s === '' ? null : s;
  }
  const out: Partial<Record<PluralForm, string>> = {};
  for (const form of PLURAL_FORMS) {
    const v: unknown = has(value, form) ? (value as Record<string, unknown>)[form] : undefined;
    if (typeof v === 'string') {
      const s = cleanInput(v);
      if (s !== '') out[form] = s;
    }
  }
  return Object.keys(out).length === 0 ? null : out;
}

const sameValue = (a: DraftValue, b: DraftValue): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Set (or with null/'' reset) one key in one locale. Returns `strings` itself when nothing changed. */
export function withValue(strings: StringsByLocale, locale: Locale, key: string, value: DraftValue | null): StringsByLocale {
  const next = normalizeValue(value);
  const localeMap = has(strings, locale) ? strings[locale] : undefined;
  const current = localeMap && has(localeMap, key) ? localeMap[key] : undefined;
  if (next === null ? current === undefined : current !== undefined && sameValue(current, next)) return strings;
  const map: LocaleStrings = dict(Object.entries(localeMap ?? {}));
  if (next === null) delete map[key];
  else map[key] = next as TextValue;
  const out: StringsByLocale = dict(Object.entries(strings));
  if (Object.keys(map).length === 0) delete out[locale];
  else out[locale] = map;
  return out;
}

function isPostableString(s: unknown): s is string {
  if (typeof s !== 'string' || s.length < 1 || s.length > TEXT_LIMITS.value) return false;
  if (CONTROL_RE.test(s)) return false;
  return !/[{}]/.test(s.replace(PLACEHOLDER_RE_G, ''));
}

/** The backend counts DISTINCT placeholder names across all forms of a value. */
const withinPlaceholderCap = (forms: string[]): boolean =>
  new Set(forms.flatMap((f) => f.match(PLACEHOLDER_RE_G) ?? [])).size <= TEXT_LIMITS.placeholders;

/** Would the backend's `siteTextSchema` accept this value (spec §4.3)? Registry rules are not checked here. */
export function isPostable(value: unknown): boolean {
  if (typeof value === 'string') return isPostableString(value) && withinPlaceholderCap([value]);
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (!keys.includes('other')) return false;
  if (!keys.every((k) => (PLURAL_FORMS as readonly string[]).includes(k) && isPostableString(value[k]))) return false;
  return withinPlaceholderCap(Object.values(value) as string[]);
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isPostableKey = (k: string): boolean => k.length <= TEXT_LIMITS.key && KEY_RE.test(k) && !k.split('.').some((p) => FORBIDDEN_KEYS.has(p));

function postableStrings(strings: StringsByLocale): StringsByLocale {
  const out: StringsByLocale = dict();
  for (const [locale, map] of Object.entries(strings)) {
    if (!isLocale(locale)) continue;
    const kept: LocaleStrings = dict(Object.entries(map).filter(([k, v]) => isPostableKey(k) && isPostable(v)) as [string, TextValue][]);
    if (Object.keys(kept).length > 0) Object.defineProperty(out, locale, { value: kept, writable: true, enumerable: true, configurable: true });
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

export function valueStrings(value: DraftValue | undefined): string[] {
  if (value === undefined) return [];
  return typeof value === 'string' ? [value] : Object.values(value).filter((v): v is string => typeof v === 'string');
}
