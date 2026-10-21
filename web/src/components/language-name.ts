import type { Locale } from '@/text/types.ts';

/** A language's name in itself ("Français", "Español"), capitalised in its own locale; the tag when the runtime cannot name it. */
export function nativeName(tag: Locale): string {
  try {
    const name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag);
    if (name && name !== tag) return name.charAt(0).toLocaleUpperCase(tag) + name.slice(1);
  } catch { /* unknown tag or no Intl.DisplayNames */ }
  return tag;
}

/** The compact code a button shows: the upper-case primary subtag (fr-CA becomes FR). */
export const languageCode = (tag: Locale): string => tag.split('-')[0]!.toUpperCase();
