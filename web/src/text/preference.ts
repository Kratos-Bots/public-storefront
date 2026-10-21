import { isLocale, type Locale } from '@/text/types.ts';

/*
 * The shopper's language preference (storefront-languages spec §5). Order: `?lang=` (also stored) →
 * localStorage `sf.lang` → `navigator.languages`. Every storage access is in try/catch: private windows
 * and blocked site data throw.
 */

export const LANG_PARAM = 'lang';
export const LANG_STORAGE_KEY = 'sf.lang';
const MAX_TAGS = 5;
const MAX_BROWSER_TAGS = 3;

export function canonicalLocale(tag: unknown): Locale | null {
  if (typeof tag !== 'string' || !tag) return null;
  try {
    const c = Intl.getCanonicalLocales(tag)[0];
    return c && isLocale(c) ? c : null;
  } catch {
    return null;
  }
}

function readStored(): string | null {
  try { return window.localStorage.getItem(LANG_STORAGE_KEY); } catch { return null; }
}
function writeStored(locale: Locale): boolean {
  try { window.localStorage.setItem(LANG_STORAGE_KEY, locale); return true; } catch { return false; }
}
function urlLang(): string | null {
  try { return new URLSearchParams(window.location.search).get(LANG_PARAM); } catch { return null; }
}

/** Up to 5 canonical tags in preference order: the `?lang=` choice, the stored choice, then up to 3 browser languages. */
export function preferredLocales(): Locale[] {
  const fromUrl = canonicalLocale(urlLang());
  // A shared `?lang=` link switches that shopper until they pick again (accepted, spec §5).
  if (fromUrl) writeStored(fromUrl);
  let browser: readonly string[] = [];
  try { browser = window.navigator.languages?.length ? window.navigator.languages : [window.navigator.language]; } catch { /* none */ }
  const out: Locale[] = [];
  for (const raw of [fromUrl, canonicalLocale(readStored()), ...browser.slice(0, MAX_BROWSER_TAGS).map(canonicalLocale)]) {
    if (raw && !out.includes(raw)) out.push(raw);
  }
  return out.slice(0, MAX_TAGS);
}

/**
 * Saves the shopper's choice and reloads (no live swap, spec §1). When storage is blocked the choice
 * travels as `?lang=` instead. An existing `?lang=` is always rewritten or dropped so it cannot
 * override the new choice on reload.
 */
export function chooseLanguage(locale: Locale): void {
  const tag = canonicalLocale(locale);
  if (!tag) return;
  const stored = writeStored(tag);
  try {
    const url = new URL(window.location.href);
    if (!stored) url.searchParams.set(LANG_PARAM, tag);
    else if (url.searchParams.has(LANG_PARAM)) url.searchParams.delete(LANG_PARAM);
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
  } catch { /* the reload below still happens */ }
  window.location.reload();
}
