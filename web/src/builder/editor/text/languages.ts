// web/src/builder/editor/text/languages.ts
import { categoriesFor, pluralCategory } from '@/text/plural.ts';

/**
 * The store language picker (spec §7.2): left-to-right languages only (RTL is a non-goal, §6.5),
 * each with its common regional variants for "Numbers and dates". Every tag must pass the
 * backend's locale rule (spec §4.3); the test pins that.
 */

export interface LanguageOption { code: string; regions: readonly string[] }

export const LANGUAGES: readonly LanguageOption[] = [
  { code: 'en', regions: ['en-US', 'en-GB', 'en-IE', 'en-AU', 'en-CA', 'en-NZ', 'en-IN', 'en-ZA'] },
  { code: 'de', regions: ['de-DE', 'de-AT', 'de-CH'] },
  { code: 'fr', regions: ['fr-FR', 'fr-BE', 'fr-CH', 'fr-CA'] },
  { code: 'es', regions: ['es-ES', 'es-MX', 'es-AR', 'es-CO', 'es-US'] },
  { code: 'it', regions: ['it-IT', 'it-CH'] },
  { code: 'pt', regions: ['pt-PT', 'pt-BR'] },
  { code: 'nl', regions: ['nl-NL', 'nl-BE'] },
  { code: 'sv', regions: ['sv-SE', 'sv-FI'] },
  { code: 'da', regions: ['da-DK'] },
  { code: 'nb', regions: ['nb-NO'] },
  { code: 'fi', regions: ['fi-FI'] },
  { code: 'is', regions: ['is-IS'] },
  { code: 'pl', regions: ['pl-PL'] },
  { code: 'cs', regions: ['cs-CZ'] },
  { code: 'sk', regions: ['sk-SK'] },
  { code: 'hu', regions: ['hu-HU'] },
  { code: 'ro', regions: ['ro-RO', 'ro-MD'] },
  { code: 'bg', regions: ['bg-BG'] },
  { code: 'hr', regions: ['hr-HR'] },
  { code: 'sl', regions: ['sl-SI'] },
  { code: 'sr-Latn', regions: ['sr-Latn-RS'] },
  { code: 'et', regions: ['et-EE'] },
  { code: 'lv', regions: ['lv-LV'] },
  { code: 'lt', regions: ['lt-LT'] },
  { code: 'el', regions: ['el-GR', 'el-CY'] },
  { code: 'uk', regions: ['uk-UA'] },
  { code: 'ru', regions: ['ru-RU'] },
  { code: 'tr', regions: ['tr-TR'] },
  { code: 'ca', regions: ['ca-ES'] },
  { code: 'ga', regions: ['ga-IE'] },
  { code: 'mt', regions: ['mt-MT'] },
  { code: 'id', regions: ['id-ID'] },
  { code: 'ms', regions: ['ms-MY'] },
  { code: 'vi', regions: ['vi-VN'] },
  { code: 'th', regions: ['th-TH'] },
  { code: 'ja', regions: ['ja-JP'] },
  { code: 'ko', regions: ['ko-KR'] },
  { code: 'zh-Hans', regions: ['zh-Hans-CN', 'zh-Hans-SG'] },
  { code: 'zh-Hant', regions: ['zh-Hant-TW', 'zh-Hant-HK'] },
  { code: 'hi', regions: ['hi-IN'] },
  { code: 'fil', regions: ['fil-PH'] },
  { code: 'sw', regions: ['sw-KE', 'sw-TZ'] },
];

/** Backend rule (spec §4.3), copied verbatim. */
export const LOCALE_RE = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|\d{3}))?$/;

export function isStoreLocale(tag: string): boolean {
  if (!LOCALE_RE.test(tag)) return false;
  try {
    return Intl.getCanonicalLocales(tag)[0] === tag;
  } catch {
    return false;
  }
}

/** What the owner typed → the canonical tag, or null when the backend would refuse it. */
export function canonicalTag(input: string): string | null {
  try {
    const tag = Intl.getCanonicalLocales(input.trim())[0];
    return tag && isStoreLocale(tag) ? tag : null;
  } catch {
    return null;
  }
}

const capitalise = (name: string, locale: string) => name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);

function displayName(tag: string): string {
  try {
    const name = new Intl.DisplayNames([tag], { type: 'language', languageDisplay: 'standard' }).of(tag);
    return name && name !== tag ? capitalise(name, tag) : tag;
  } catch {
    return tag;
  }
}

/** "Deutsch", "Français" — a language named in itself. */
export const nativeName = (code: string): string => displayName(code);

/** "Deutsch (Österreich) · 1.234,5 · 30.09.2026" */
export function variantLabel(tag: string): string {
  return `${displayName(tag)} · ${formatSample(tag)}`;
}

const SAMPLE_DATE = new Date(Date.UTC(2026, 8, 30, 12));
export function formatSample(tag: string): string {
  try {
    return `${new Intl.NumberFormat(tag).format(1234.5)} · ${new Intl.DateTimeFormat(tag, { timeZone: 'UTC' }).format(SAMPLE_DATE)}`;
  } catch {
    return tag;
  }
}

export function formatOptions(locale: string): Array<{ value: string; label: string }> {
  const lang = LANGUAGES.find((l) => l.code === locale);
  return [
    { value: '', label: `Built-in for ${nativeName(locale)}` },
    ...(lang?.regions ?? []).map((r) => ({ value: r, label: variantLabel(r) })),
  ];
}

/** The forms an owner fills for a plural key in this locale (spec §7.2), `other` last. */
export function pluralFormsFor(locale: string): string[] {
  return [...categoriesFor(locale).filter((c) => c !== 'other'), 'other'];
}

// 1 and 5 first, so English reads "1 item" / "5 items" (spec §7.2); the rest reach every CLDR category.
const SAMPLES = [1, 5, 2, 3, 4, 0, 6, 7, 11, 12, 21, 22, 25, 100, 101, 102, 1_000_000, 1.5];
/** The smallest count that picks this category, for the live example ("1 item" / "5 items"). */
export function sampleCount(locale: string, category: string): number {
  for (const n of SAMPLES) if (pluralCategory(locale, n) === category) return n;
  return 5;
}

/** `{count}` as `tp()` inserts it: String(n), never a grouped number (spec §6.4). */
export const fillExample = (form: string, n: number): string => form.replace(/\{count\}/g, String(n));
