import { isLocale, type TextLanguage } from '@/text/types.ts';

/** Intl locale argument per formatter kind; `undefined` = the viewer's own locale (spec §6.5). */
export interface FormatProfile {
  money: string | undefined;
  date: string | undefined;
  dateTime: string | undefined;
  number: string | undefined;
  regions: string[] | undefined;
  /** Sorting of country names; undefined = today's `localeCompare(b)` with no locale. */
  collation: string | undefined;
}

/** English with built-in formatting: every call site's v0.7.0 locale, unchanged. */
export const LEGACY_PROFILE: FormatProfile = Object.freeze({
  money: 'en', date: 'en-GB', dateTime: undefined, number: undefined, regions: ['en'], collation: undefined,
}) as FormatProfile;

function supported(tag: string): boolean {
  if (!isLocale(tag)) return false;
  try { return Intl.NumberFormat.supportedLocalesOf([tag]).length > 0 || Intl.DateTimeFormat.supportedLocalesOf([tag]).length > 0; } catch { return false; }
}

export function formatProfileFor(language: TextLanguage): FormatProfile {
  if (language.locale === 'en' && language.formatLocale === '') return LEGACY_PROFILE;
  const l = language.formatLocale || language.locale;
  if (!supported(l)) return LEGACY_PROFILE;
  return { money: l, date: l, dateTime: l, number: l, regions: [l], collation: l };
}
