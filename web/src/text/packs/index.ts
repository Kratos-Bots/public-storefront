import type { TextArea } from '@/text/define.ts';
import type { TextKey } from '@/text/registry.ts';
import type { Locale, PluralForms, TextValue } from '@/text/types.ts';

/*
 * Built-in translation packs (storefront-languages spec §3): the wording of every non-fixed registry key
 * in French, Italian and Spanish. A pack is the third layer of the resolver, after the owner's layout and
 * shared text and before the built-in English. English never goes through here.
 */

/** A language's wording, keyed by full registry key. Fixed keys (closed.*, boot.*) are never in a pack. */
export type Pack = Readonly<Partial<Record<TextKey, TextValue>>>;
/** One area's pack file: every key of the area, a string for a string key and plural forms for a plural key. */
export type AreaPack<A extends TextArea<string, unknown>> = {
  [K in keyof A['entries']]: A['entries'][K] extends { readonly en: infer V } ? (V extends string ? string : PluralForms) : never;
};

export const PACK_LANGUAGES = ['fr', 'it', 'es'] as const;
export type PackLanguage = (typeof PACK_LANGUAGES)[number];

/** The pack language of a store locale by its primary subtag (`fr-CA` → `fr`), or null (English included). */
export function packLanguage(locale: Locale): PackLanguage | null {
  const primary = locale.split('-')[0]!;
  return (PACK_LANGUAGES as readonly string[]).includes(primary) ? (primary as PackLanguage) : null;
}

// One dynamic import per language: its own lazy chunk, never in the English bundle.
const LOADERS: Record<PackLanguage, () => Promise<{ default: Pack }>> = {
  fr: () => import('@/text/packs/fr/index.ts'),
  it: () => import('@/text/packs/it/index.ts'),
  es: () => import('@/text/packs/es/index.ts'),
};
const loaded = new Map<PackLanguage, Pack>();
const loading = new Map<PackLanguage, Promise<void>>();

/** Loads the pack for a locale's language (a no-op for English and unsupported languages). Rejects if the chunk fails. */
export function loadPack(locale: Locale): Promise<void> {
  const lang = packLanguage(locale);
  if (!lang || loaded.has(lang)) return Promise.resolve();
  let p = loading.get(lang);
  if (!p) {
    p = LOADERS[lang]().then((m) => { loaded.set(lang, m.default); }).finally(() => { loading.delete(lang); });
    loading.set(lang, p);
  }
  return p;
}

/** The loaded pack for a locale, synchronously; undefined until `loadPack` has resolved (or for English). */
export function packFor(locale: Locale): Pack | undefined {
  const lang = packLanguage(locale);
  return lang ? loaded.get(lang) : undefined;
}

/** Loads every pack (the editor shows pack values for all offered languages). Failures are swallowed. */
export async function preloadPacks(): Promise<void> {
  await Promise.all(PACK_LANGUAGES.map((l) => loadPack(l).catch(() => undefined)));
}
