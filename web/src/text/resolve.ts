import { formsOf, hasBadBrace, placeholdersIn, placeholdersOf, type TextEntry } from '@/text/define.ts';
import { TEXT_ENTRIES } from '@/text/registry.ts';
import { DEFAULT_MAX, isPluralForms, type Locale, type LocaleStrings, type TextValue } from '@/text/types.ts';

// Rule messages are editor UI (spec §12: the editor's own text is not translated).
export type TextRule = 'unknown-key' | 'type-mismatch' | 'unknown-placeholder' | 'bad-brace' | 'too-long' | 'empty' | 'fixed';
export type TextCheck = { ok: true } | { ok: false; rule: TextRule; message: string };
export interface Resolved {
  readonly locale: Locale;
  value(key: string): TextValue;
  /** True when `value(key)` is the release's built-in English (no valid stored value) — its plural form is picked with 'en' rules. */
  builtIn(key: string): boolean;
}
export interface TextResolver {
  checkValue(key: string, value: unknown): TextCheck;
  resolveText(layers: { layout: LocaleStrings; shared: LocaleStrings }, locale: Locale): Resolved;
}

const OK: TextCheck = { ok: true };
const fail = (rule: TextRule, message: string): TextCheck => ({ ok: false, rule, message });
const warned = new Set<string>();
function warnOnce(id: string, message: string): void {
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(`[text] ${message}`);
}

export function createResolver(entries: Readonly<Record<string, TextEntry>>): TextResolver {
  function checkValue(key: string, value: unknown): TextCheck {
    const entry = Object.hasOwn(entries, key) ? entries[key] : undefined;
    if (!entry) return fail('unknown-key', 'This line is not used by this version of the shop.');
    if (entry.fixed) return fail('fixed', 'This line cannot be edited.');
    const plural = isPluralForms(entry.en);
    if (typeof value === 'string' ? plural : !(isPluralForms(value) && plural)) {
      return fail('type-mismatch', plural ? 'This line needs one wording per count.' : 'This line takes a single wording.');
    }
    const allowed = placeholdersOf(entry);
    const max = entry.max ?? DEFAULT_MAX;
    for (const form of formsOf(value as TextValue)) {
      if (!form.trim()) return fail('empty', 'A wording cannot be empty — clear the box to use the default.');
      if (hasBadBrace(form)) return fail('bad-brace', 'Curly braces are only for placeholders such as {name}.');
      const unknown = placeholdersIn(form).find((n) => !allowed.has(n));
      if (unknown) {
        const names = [...allowed].map((n) => `{${n}}`).join(', ');
        return fail('unknown-placeholder', `{${unknown}} is not available here${names ? ` — use ${names}` : ''}.`);
      }
      if (form.length > max) return fail('too-long', `Keep it to ${max} characters.`);
    }
    return OK;
  }

  const memo = new WeakMap<object, Map<Locale, Resolved>>();

  function resolveText(layers: { layout: LocaleStrings; shared: LocaleStrings }, locale: Locale): Resolved {
    let byLocale = memo.get(layers);
    if (!byLocale) { byLocale = new Map(); memo.set(layers, byLocale); }
    const hit = byLocale.get(locale);
    if (hit) return hit;
    for (const layer of [layers.layout, layers.shared]) {
      for (const key of Object.keys(layer)) {
        if (!Object.hasOwn(entries, key)) warnOnce(`unknown:${key}`, `ignoring "${key}": not a key of this release`);
      }
    }
    const cache = new Map<string, { v: TextValue; builtIn: boolean }>();
    const lookup = (key: string): { v: TextValue; builtIn: boolean } => {
      const cached = cache.get(key);
      if (cached) return cached;
      const entry = Object.hasOwn(entries, key) ? entries[key] : undefined;
      let hit = { v: entry ? entry.en : key, builtIn: true } as { v: TextValue; builtIn: boolean };
      if (entry) {
        for (const [scope, layer] of [['layout', layers.layout], ['shared', layers.shared]] as const) {
          if (!Object.hasOwn(layer, key)) continue;
          const c = checkValue(key, layer[key]);
          if (c.ok) { hit = { v: layer[key]!, builtIn: false }; break; }
          warnOnce(`${scope}:${key}:${c.rule}`, `ignoring the ${scope} value of "${key}" (${c.rule})`);
        }
      }
      cache.set(key, hit);
      return hit;
    };
    const resolved: Resolved = {
      locale,
      value: (key) => lookup(key).v,
      builtIn: (key) => lookup(key).builtIn,
    };
    byLocale.set(locale, resolved);
    return resolved;
  }

  return { checkValue, resolveText };
}

const shared = createResolver(TEXT_ENTRIES);
/** Also used by the editor to turn rejections into issues (spec §6.3, §7.2). */
export const checkValue = shared.checkValue;
export const resolveText = shared.resolveText;
