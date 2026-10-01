// snapshot.ts first: it has no app imports, so it is fully evaluated before this module's cycle
// (runtime → builder/published → api/client → lib/errors) is entered.
import { createTextApi, DEFAULT_TEXT_API, DEFAULT_TEXT_LAYERS, setTextSnapshot, textSnapshot, type TextApi } from '@/text/snapshot.ts';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffectiveLayout } from '@/app/layout.ts';
import { PAGES_QUERY, pageSetQueryFn, pagesKey } from '@/builder/published.ts';
import { setFormatProfile } from '@/lib/format.ts';
import { formatProfileFor, LEGACY_PROFILE } from '@/text/format-profile.ts';
import type { TextLayers } from '@/text/types.ts';

// Re-exported so existing imports keep working. Non-React modules import these from '@/text/snapshot.ts'.
export { createTextApi, DEFAULT_TEXT_LAYERS, textKey, textSnapshot, type TextApi } from '@/text/snapshot.ts';

const DEFAULT_API = DEFAULT_TEXT_API;
const TextContext = createContext<TextApi>(DEFAULT_API);

/** Components. Outside any provider (boot screens, unit tests) this is the built-in English. */
export function useText(): TextApi { return useContext(TextContext); }

interface Mounted { api: TextApi; layers: TextLayers; depth: number }
/** Mounted providers in mount order. The deepest is active (an editor frame inside the app's provider). */
const mounted: Mounted[] = [];
const DepthContext = createContext(0);

function activate(): void {
  let top: Mounted | undefined;
  for (const m of mounted) if (!top || m.depth >= top.depth) top = m;
  setTextSnapshot(top ? top.api : DEFAULT_API);
  setFormatProfile(top ? formatProfileFor(top.layers) : LEGACY_PROFILE);
  const el = document.documentElement;
  const locale = textSnapshot().locale;
  if (el.lang !== locale) el.lang = locale;
}

/** Resolves one set of layers for its subtree: sets the format profile, the snapshot and `<html lang>` (the deepest mounted provider wins). */
export function TextLayerProvider({ text, children }: { text: TextLayers | null; children: ReactNode }) {
  const layers = text ?? DEFAULT_TEXT_LAYERS;
  // Stable per layers object (createTextApi is also memoised by identity), so a parent re-render with
  // the same layers — the editor's canvas re-renders on every doc edit — never re-runs the effect below.
  const api = useMemo(() => createTextApi(layers), [layers]);
  const profile = useMemo(() => formatProfileFor(layers), [layers]);
  const depth = useContext(DepthContext) + 1;
  // Synchronous, during render, before any child formats (spec §6.5, review focus 6). Idempotent.
  // An outer provider re-rendering on its own must not take over from a mounted inner one.
  // Known edge: while an inner provider is unmounting, a render of the outer subtree that happens
  // before the inner's effect cleanup runs still sees the inner's profile and snapshot; the cleanup's
  // activate() restores the outer one, and the next render is correct.
  if (!mounted.some((m) => m.depth > depth)) {
    setFormatProfile(profile);
    setTextSnapshot(api);
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
