import { createContext, Fragment, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffectiveLayout } from '@/app/layout.ts';
import { PAGES_QUERY, pageSetQueryFn, pagesKey } from '@/builder/published.ts';
import { setFormatProfile } from '@/lib/format.ts';
import { formatProfileFor, LEGACY_PROFILE } from '@/text/format-profile.ts';
import { pluralCategory } from '@/text/plural.ts';
import { isStringKey, type NodeParams, type ParamArgs, type PluralKey, type StringKey, type TextKey } from '@/text/registry.ts';
import { resolveText } from '@/text/resolve.ts';
import type { Locale, LocaleStrings, PluralForms, TextLayers, TextValue } from '@/text/types.ts';

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
        out.push(Object.hasOwn(all, m[1]!) ? <Fragment key={i++}>{all[m[1]!]}</Fragment> : m[0]);
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

const DEFAULT_API = createTextApi(DEFAULT_TEXT_LAYERS);
const TextContext = createContext<TextApi>(DEFAULT_API);
let snapshot: TextApi = DEFAULT_API;

/** Components. Outside any provider (boot screens, unit tests) this is the built-in English. */
export function useText(): TextApi { return useContext(TextContext); }
/** Non-React code (lib/errors.ts, zod messages, status helpers): the mounted provider's text, read at call time. */
export function textSnapshot(): TextApi { return snapshot; }
/** Marks a key held in module-scope data or component state (zod messages, status maps, setErrors). */
export function textKey<K extends StringKey>(key: K): K { return key; }

interface Mounted { api: TextApi; layers: TextLayers; depth: number }
/** Mounted providers in mount order. The deepest is active (an editor frame inside the app's provider). */
const mounted: Mounted[] = [];
const DepthContext = createContext(0);

function activate(): void {
  let top: Mounted | undefined;
  for (const m of mounted) if (!top || m.depth >= top.depth) top = m;
  snapshot = top ? top.api : DEFAULT_API;
  setFormatProfile(top ? formatProfileFor(top.layers) : LEGACY_PROFILE);
  const el = document.documentElement;
  if (el.lang !== snapshot.locale) el.lang = snapshot.locale;
}

/** Resolves one set of layers for its subtree: sets the format profile, the snapshot and `<html lang>` (the deepest mounted provider wins). */
export function TextLayerProvider({ text, children }: { text: TextLayers | null; children: ReactNode }) {
  const layers = text ?? DEFAULT_TEXT_LAYERS;
  const api = createTextApi(layers);
  const depth = useContext(DepthContext) + 1;
  // Synchronous, during render, before any child formats (spec §6.5, review focus 6). Idempotent.
  // An outer provider re-rendering on its own must not take over from a mounted inner one.
  if (!mounted.some((m) => m.depth > depth)) {
    setFormatProfile(formatProfileFor(layers));
    snapshot = api;
  }
  useEffect(() => {
    // Effects run child-first, so the deepest provider is chosen explicitly; this also re-asserts after
    // StrictMode's mount → unmount → mount (main.tsx renders under StrictMode).
    const entry: Mounted = { api, layers, depth };
    mounted.push(entry);
    activate();
    return () => {
      mounted.splice(mounted.indexOf(entry), 1);
      activate();
    };
  }, [api, layers, depth]);
  return (
    <DepthContext.Provider value={depth}>
      <TextContext.Provider value={api}>{children}</TextContext.Provider>
    </DepthContext.Provider>
  );
}

/**
 * App level (spec §6.4): the published text of the effective layout. It never starts the read itself
 * (`enabled: false`) — PuckShell/PuckPage and the App prefetch own it, and nothing may fetch behind the
 * closed page or in the builder. While the read is pending it resolves the built-in defaults.
 */
export function TextProvider({ children }: { children: ReactNode }) {
  const layout = useEffectiveLayout();
  const client = useQueryClient();
  const query = useQuery({ queryKey: pagesKey(layout), queryFn: pageSetQueryFn(client, layout), ...PAGES_QUERY, enabled: false });
  return <TextLayerProvider text={query.data?.text ?? null}>{children}</TextLayerProvider>;
}
