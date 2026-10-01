import { PLURAL_CATEGORIES, type Locale, type PluralCategory } from '@/text/types.ts';

const rules = new Map<Locale, Intl.PluralRules>();

function rulesFor(locale: Locale): Intl.PluralRules {
  let r = rules.get(locale);
  if (!r) {
    try { r = new Intl.PluralRules(locale); } catch { r = new Intl.PluralRules('en'); }
    rules.set(locale, r);
  }
  return r;
}

/** `Intl.PluralRules(locale).select(n)`, memoised per locale. For 'en' this is `one` exactly when n === 1. */
export function pluralCategory(locale: Locale, n: number): PluralCategory {
  return rulesFor(locale).select(n) as PluralCategory;
}

/** The categories a locale uses, `other` last — the Text panel shows one input per category. */
export function categoriesFor(locale: Locale): PluralCategory[] {
  const cats = rulesFor(locale).resolvedOptions().pluralCategories as PluralCategory[];
  // Runtimes differ in the order resolvedOptions() lists them (Node: 'few many one other'); use CLDR order.
  const rest = cats.filter((c) => c !== 'other').sort((a, b) => PLURAL_CATEGORIES.indexOf(a) - PLURAL_CATEGORIES.indexOf(b));
  return [...rest, 'other'];
}
