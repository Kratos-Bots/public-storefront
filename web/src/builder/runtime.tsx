import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useSettings } from '@/app/settings.ts';
import { useEffectiveLayout } from '@/app/layout.ts';
import { fetchPageSet } from '@/api/pages.ts';
import { validateDoc } from '@/builder/guard.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { DocBoundary, RenderDoc } from '@/builder/render.tsx';
import type { DocKey, LayoutKind, PageRootProps, PageSet, PuckDoc, RouteKey } from '@/builder/types.ts';

export const pagesKey = (layout: LayoutKind) => ['pages', layout] as const;

/**
 * Read once per page load: same 30 s stale time as settings, but never refetched on
 * window focus — a publish must not swap the page under a shopper mid-checkout.
 */
export const PAGES_QUERY = { staleTime: 30_000, refetchOnWindowFocus: false, retry: false } as const;

const PageSetOverrideContext = createContext<{ pageSet: PageSet | null } | null>(null);

/** The editor and preview frames inject a draft set; nothing inside fetches the published one. */
export function PageSetOverrideProvider({ pageSet, children }: { pageSet: PageSet | null; children: ReactNode }) {
  const value = useMemo(() => ({ pageSet }), [pageSet]);
  return <PageSetOverrideContext.Provider value={value}>{children}</PageSetOverrideContext.Provider>;
}

export function usePageSet(layout: LayoutKind): { pageSet: PageSet | null; isLoading: boolean } {
  const override = useContext(PageSetOverrideContext);
  const query = useQuery({
    queryKey: pagesKey(layout),
    queryFn: () => fetchPageSet(layout),
    ...PAGES_QUERY,
    enabled: override === null,
  });
  if (override) return { pageSet: override.pageSet, isLoading: false };
  return { pageSet: query.data ?? null, isLoading: query.isPending };
}

export interface ResolvedDoc { doc: PuckDoc; isDefault: boolean }

/** The published doc if it passes the guard, else the route's default; null only for an unknown custom page. */
export function resolveDoc(pageSet: PageSet | null, docKey: DocKey, layout: LayoutKind): ResolvedDoc | null {
  const stored = pageSet ? (docKey === 'shell' ? pageSet.shell : pageSet.pages[docKey]) : undefined;
  if (stored) {
    const { doc } = validateDoc(stored, docKey, layout);
    if (doc) return { doc, isDefault: false };
  }
  const fallback = defaultDoc(docKey, layout);
  return fallback ? { doc: fallback, isDefault: true } : null;
}

/** Root title/description of a page; '' leaves the app's own title and description alone. */
function usePageMeta(root: PageRootProps | null): void {
  const { brand } = useSettings();
  const title = root?.title ?? '';
  const description = root?.description ?? '';
  useEffect(() => {
    if (!title) return;
    document.title = title;
    return () => {
      document.title = brand.title;
    };
  }, [title, brand.title]);
  useEffect(() => {
    if (!description) return;
    let meta = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    const created = meta === null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    const previous = meta.content;
    meta.content = description;
    return () => {
      if (created) meta.remove();
      else meta.content = previous;
    };
  }, [description]);
}

/** Every route element (spec §5.1): the page's document — published, or v0.6.0's default. */
export function PuckPage({ routeKey }: { routeKey: RouteKey }) {
  const layout = useEffectiveLayout();
  const { pageSet } = usePageSet(layout);
  const resolved = resolveDoc(pageSet, routeKey, layout);
  usePageMeta(resolved ? resolved.doc.root.props : null);
  if (!resolved) return <Navigate to="/" replace />;
  const page = <RenderDoc doc={resolved.doc} docKey={routeKey} layout={layout} />;
  const fallback = resolved.isDefault ? null : defaultDoc(routeKey, layout);
  if (!fallback) return page;
  return (
    <DocBoundary docKey={routeKey} fallback={<RenderDoc doc={fallback} docKey={routeKey} layout={layout} />}>
      {page}
    </DocBoundary>
  );
}
