import type { QueryClient } from '@tanstack/react-query';
import { fetchPublished, type Published } from '@/api/pages.ts';
import type { LayoutKind } from '@/builder/types.ts';

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
    const next = await fetchPublished(layout);
    if (next.pageSet !== null || next.text !== null) return next;
    return client.getQueryData<Published>(pagesKey(layout)) ?? NOTHING;
  };
}
