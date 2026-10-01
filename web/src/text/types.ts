/** Shared text types (editable-text spec §3). The backend mirrors these in zod; the editor imports them. */

/** BCP 47, canonical form, language[-Script][-REGION]: 'en', 'de', 'pt-BR', 'zh-Hant'. */
export type Locale = string;
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
export const PLURAL_CATEGORIES: readonly PluralCategory[] = ['zero', 'one', 'two', 'few', 'many', 'other'];
/** One key's value in one locale. A plural value has `other` plus any other CLDR categories. */
export type PluralForms = Partial<Record<Exclude<PluralCategory, 'other'>, string>> & { other: string };
export type TextValue = string | PluralForms;
/** Sparse: only keys the owner set. */
export type LocaleStrings = Record<string, TextValue>;

export interface TextLanguage {
  locale: Locale;
  /** '' = built-in formatting for `locale` (spec §6.5); else used for every formatter. */
  formatLocale: '' | Locale;
}
export interface SiteText { schemaVersion: 1; language: TextLanguage; strings: Record<Locale, LocaleStrings> }
export interface PageText { strings: Record<Locale, LocaleStrings> }

/** The two stored layers for the active locale, plus the language (the public read's `text`, spec §4.6). */
export interface TextLayers { locale: Locale; formatLocale: '' | Locale; shared: LocaleStrings; layout: LocaleStrings }
export interface PublishedText extends TextLayers { version: number }
/** What the editor and the version preview inject through `PageSetOverrideProvider`'s `text` prop. */
export type EditorText = TextLayers;

export const TEXT_LIMITS = { locales: 10, keysPerLocale: 3000, key: 100, value: 1000, placeholders: 10, docBytes: 256 * 1024 } as const;
export const DEFAULT_MAX = 200;
export const LOCALE_RE = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|\d{3}))?$/;
/** Identical to the backend's TEXT_KEY_RE (storefront-text/schemas.ts). */
export const KEY_RE = /^[a-z]+(?:\.[A-Za-z0-9][A-Za-z0-9_-]*){1,5}$/;

export function isLocale(x: unknown): x is Locale {
  if (typeof x !== 'string' || !LOCALE_RE.test(x)) return false;
  try { return Intl.getCanonicalLocales(x)[0] === x; } catch { return false; }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isPluralForms(v: unknown): v is PluralForms {
  if (!isPlainObject(v) || typeof v.other !== 'string') return false;
  return Object.entries(v).every(([k, s]) => (PLURAL_CATEGORIES as readonly string[]).includes(k) && typeof s === 'string');
}

export function isTextValue(v: unknown): v is TextValue {
  return typeof v === 'string' || isPluralForms(v);
}
