import type { QueryClient } from '@tanstack/react-query';
import { fetchPublished, type Published } from '@/api/pages.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { isPreviewMode } from '@/app/preview-listener.ts';
import type { LayoutKind } from '@/builder/types.ts';
import { loadPack, packLanguage } from '@/text/packs/index.ts';
import { preferredLocales } from '@/text/preference.ts';

export const pagesKey = (layout: LayoutKind) => ['pages', layout] as const;

/**
 * Read once per page load and never again: nothing (a remount, focus, a reconnect, time) refetches
 * it — a publish must not swap the page or its wording under a shopper mid-checkout.
 */
export const PAGES_QUERY = {
  staleTime: Infinity, refetchOnMount: false, refetchOnReconnect: false, refetchOnWindowFocus: false, retry: false,
} as const;

const NOTHING: Published = { pageSet: null, text: null };

/** fetchPublished resolves "nothing" on any failure; should the query run again, a failed read keeps what this page load has. */
export function pageSetQueryFn(client: QueryClient, layout: LayoutKind): () => Promise<Published> {
  return async () => {
    // The builder canvas and previews show the editor's text, never the visitor's language.
    const prefer = isBuilderMode() || isPreviewMode() ? [] : preferredLocales();
    const next = await fetchPublished(layout, prefer);
    // The pack must be in before the query resolves: the resolver and the text API memoise on the layers
    // object, so a pack arriving later would leave a stale English resolution. A failed chunk means English.
    if (next.text && packLanguage(next.text.locale)) {
      try { await loadPack(next.text.locale); } catch { /* fall back to English */ }
    }
    if (next.pageSet !== null || next.text !== null) return next;
    return client.getQueryData<Published>(pagesKey(layout)) ?? NOTHING;
  };
}
