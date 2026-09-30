import { createElement, Fragment, type ReactNode } from 'react';
import { pluralCategory } from '@/text/plural.ts';
import { isStringKey, type NodeParams, type ParamArgs, type PluralKey, type StringKey, type TextKey } from '@/text/registry.ts';
import { resolveText } from '@/text/resolve.ts';
import type { Locale, LocaleStrings, PluralForms, TextLayers, TextValue } from '@/text/types.ts';

/*
 * The text API and the call-time snapshot, in a module that imports nothing outside `@/text/*` (and
 * React). Non-React code (lib/errors.ts, api/client.ts, zod messages, status helpers) imports
 * `textSnapshot` from here, never from runtime.tsx: runtime.tsx reaches the API client through
 * builder/published.ts, so going through it puts those modules in an import cycle where a
 * module-scope `textSnapshot()` could run before `snapshot` is initialised (TDZ).
 *
 * Rule: `textSnapshot()` is for call-time code outside React. A component reads `useText()` — the
 * snapshot is the deepest mounted provider, not the nearest, and reading it during render does not
 * re-render when the text changes (the editor's live preview relies on that). See docs/builder.md.
 */

export interface TextApi {
  locale: Locale;
  t<K extends StringKey>(key: K, ...p: ParamArgs<K>): string;
  tp<K extends PluralKey>(key: K, count: number, ...p: ParamArgs<K, 'count'>): string;
  tn<K extends TextKey>(key: K, params: NodeParams<K>, count?: number): ReactNode;
  /** A registered string key → t(key); anything else (a backend message) verbatim. */
  msg(value: string): string;
}

const EMPTY = Object.freeze({}) as LocaleStrings;
export const DEFAULT_TEXT_LAYERS: TextLayers = Object.freeze({ locale: 'en', formatLocale: '', shared: EMPTY, layout: EMPTY }) as TextLayers;
const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]{0,31})\}/g;

function fill(s: string, params: Readonly<Record<string, unknown>>): string {
  return s.replace(PLACEHOLDER, (m, name: string) => (Object.hasOwn(params, name) ? String(params[name]) : m));
}

const apis = new WeakMap<TextLayers, TextApi>();

export function createTextApi(layers: TextLayers): TextApi {
  const hit = apis.get(layers);
  if (hit) return hit;
  // The resolver memoises on the identity of this object, and a layer is never null (Task 1 carry).
  // Built once per layers object, since the API itself is memoised per layers object.
  const stored = { layout: layers.layout ?? EMPTY, shared: layers.shared ?? EMPTY };
  const resolved = resolveText(stored, layers.locale);
  const pick = (v: TextValue, count: number | undefined): string => {
    if (typeof v === 'string') return v;
    const forms = v as PluralForms;
    return count === undefined ? forms.other : (forms[pluralCategory(layers.locale, count) as keyof PluralForms] ?? forms.other);
  };
  const api: TextApi = {
    locale: layers.locale,
    t: ((key: string, params: Record<string, unknown> = {}) => fill(pick(resolved.value(key), undefined), params)) as TextApi['t'],
    tp: ((key: string, count: number, params: Record<string, unknown> = {}) =>
      fill(pick(resolved.value(key), count), { ...params, count: String(count) })) as TextApi['tp'],
    tn: ((key: string, params: Record<string, ReactNode>, count?: number) => {
      const s = pick(resolved.value(key), count);
      const all: Record<string, ReactNode> = count === undefined ? params : { ...params, count: String(count) };
      const out: ReactNode[] = [];
      let last = 0;
      let i = 0;
      for (const m of s.matchAll(PLACEHOLDER)) {
        if (m.index > last) out.push(s.slice(last, m.index));
        out.push(Object.hasOwn(all, m[1]!) ? createElement(Fragment, { key: i++ }, all[m[1]!]) : m[0]);
        last = m.index + m[0].length;
      }
      if (last < s.length) out.push(s.slice(last));
      return out;
    }) as TextApi['tn'],
    msg: (value) => (isStringKey(value) ? fill(pick(resolved.value(value), undefined), {}) : value),
  };
  apis.set(layers, api);
  return api;
}

/** The built-in English: what `useText()` returns outside any provider and what the snapshot holds with none mounted. */
export const DEFAULT_TEXT_API: TextApi = createTextApi(DEFAULT_TEXT_LAYERS);
let snapshot: TextApi = DEFAULT_TEXT_API;

/** Non-React code (lib/errors.ts, zod messages, status helpers): the mounted provider's text, read at call time. */
export function textSnapshot(): TextApi { return snapshot; }
/** Set by the text runtime (the deepest mounted provider). Not for feature code. */
export function setTextSnapshot(api: TextApi): void { snapshot = api; }
/** Marks a key held in module-scope data or component state (zod messages, status maps, setErrors). */
export function textKey<K extends StringKey>(key: K): K { return key; }
