import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { Navigate, useMatches } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@/app/settings.ts';
import { useEffectiveLayout } from '@/app/layout.ts';
import { PAGES_QUERY, pageSetQueryFn, pagesKey } from '@/builder/published.ts';
import { validateDoc } from '@/builder/guard.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { DocBoundary, RenderDoc } from '@/builder/render.tsx';
import { countBlocks } from '@/builder/rules.ts';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { Chromeless } from '@/layouts/Chromeless.tsx';
import { StorefrontFrame } from '@/layouts/StorefrontShell.tsx';
import { MenuFrame } from '@/layouts/MenuShell.tsx';
import { WebAppFrame } from '@/layouts/WebAppShell.tsx';
import { ShellStateContext, useShellStateValue } from '@/layouts/shell-context.ts';
import { customPageKey, isCardKey, isFixedRouteKey } from '@/builder/types.ts';
import type { DocKey, LayoutKind, PageRootProps, PageSet, PuckDoc, RouteKey } from '@/builder/types.ts';
import { TextLayerProvider } from '@/text/runtime.tsx';
import type { EditorText } from '@/text/types.ts';

export { pagesKey, PAGES_QUERY, pageSetQueryFn } from '@/builder/published.ts';

const PageSetOverrideContext = createContext<{ pageSet: PageSet | null } | null>(null);

/** The editor and preview frames inject a draft set (and, with `text`, the edited words); nothing inside fetches the published one. */
export function PageSetOverrideProvider({ pageSet, text, children }: { pageSet: PageSet | null; text?: EditorText; children: ReactNode }) {
  const value = useMemo(() => ({ pageSet }), [pageSet]);
  const inner = <PageSetOverrideContext.Provider value={value}>{children}</PageSetOverrideContext.Provider>;
  return text === undefined ? inner : <TextLayerProvider text={text}>{inner}</TextLayerProvider>;
}

export function usePageSet(layout: LayoutKind): { pageSet: PageSet | null; isLoading: boolean } {
  const override = useContext(PageSetOverrideContext);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: pagesKey(layout),
    queryFn: pageSetQueryFn(client, layout),
    ...PAGES_QUERY,
    enabled: override === null,
  });
  if (override) return { pageSet: override.pageSet, isLoading: false };
  return { pageSet: query.data?.pageSet ?? null, isLoading: query.isPending };
}

export interface ResolvedDoc { doc: PuckDoc; isDefault: boolean }

/** The published doc if it passes the guard, else the route's default; null only for an unknown custom page. */
export function resolveDoc(pageSet: PageSet | null, docKey: DocKey, layout: LayoutKind): ResolvedDoc | null {
  const stored = !pageSet || isCardKey(docKey) ? undefined : docKey === 'shell' ? pageSet.shell : pageSet.pages[docKey];
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
  const { pageSet, isLoading } = usePageSet(layout);
  // Wait for the published set (read once per page load) rather than paint the default and
  // swap it a moment later. Under an override isLoading is always false.
  const resolved = isLoading ? null : resolveDoc(pageSet, routeKey, layout);
  usePageMeta(resolved ? resolved.doc.root.props : null);
  if (isLoading) return <PageSkeleton inline />;
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

/** The route key of the deepest matched route carrying `handle.routeKey` (router.tsx sets them). */
export function useCurrentRouteKey(): RouteKey | null {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const match = matches[i]!;
    const key = (match.handle as { routeKey?: unknown } | undefined)?.routeKey;
    if (key === 'page') return customPageKey(match.params.slug);
    if (typeof key === 'string' && isFixedRouteKey(key)) return key;
  }
  return null;
}

type Frame = ComponentType<{ children: ReactNode; cartBar?: boolean }>;
const FRAMES: Record<LayoutKind, Frame> = { storefront: StorefrontFrame, menu: MenuFrame, webapp: WebAppFrame };

/**
 * Replaces ShellSwitch (spec §5.1): the layout's frame and its system mounts (§5.4 — cart
 * drawer, login modal, Telegram chrome, Overlay slot) around the shell document. A page whose
 * root says `chrome: 'none'` gets the chromeless frame instead (v0.6.0's shared-order-link page).
 * One ShellStateContext wraps header and page alike, so the header search reaches the outlet.
 */
export function PuckShell() {
  const layout = useEffectiveLayout();
  const { pageSet, isLoading } = usePageSet(layout);
  const routeKey = useCurrentRouteKey();
  const shellState = useShellStateValue();
  // Set once the published shell has crashed and DocBoundary shows the default instead (it never
  // resets for the shell, so neither does this): the bar decision must follow the doc on screen.
  const [shellFailed, setShellFailed] = useState(false);
  const onShellFallback = useCallback(() => setShellFailed(true), []);

  // As PuckPage: wait for the published set rather than paint the default shell and swap it.
  // A route whose default document is chromeless (the shared order link) paints its brand header
  // at once, as v0.6.0 did; the page inside shows the inline skeleton until the set is in.
  if (isLoading) {
    // Accepted trade-off: this reads the route's DEFAULT doc, since the published one isn't in yet.
    // A published doc that flips that route's chrome (say an order-status page set to chrome:
    // 'shell') briefly shows the Chromeless skeleton before its shell frame paints: a short flash,
    // once per page load, instead of a blank screen on every route while the set loads.
    const fallbackPage = routeKey && isFixedRouteKey(routeKey) ? defaultDoc(routeKey, layout) : null;
    return fallbackPage?.root.props.chrome === 'none' ? <Chromeless /> : <PageSkeleton />;
  }

  const page = routeKey ? resolveDoc(pageSet, routeKey, layout) : null;
  if (page?.doc.root.props.chrome === 'none') return <Chromeless />;

  const shell = resolveDoc(pageSet, 'shell', layout);
  if (!shell) throw new Error(`[builder] no default shell document for the ${layout} layout`);
  const Frame = FRAMES[layout];
  const body = <RenderDoc doc={shell.doc} docKey="shell" layout={layout} />;
  const fallback = shell.isDefault ? null : defaultDoc('shell', layout);
  const onScreen = fallback && shellFailed ? fallback : shell.doc;

  return (
    <ShellStateContext.Provider value={shellState}>
      {/* The phone cart bar is a block owners can place; if the shell has none, the frame mounts it. */}
      <Frame cartBar={!countBlocks(onScreen).has('MobileCartBar')}>
        {fallback ? (
          <DocBoundary docKey="shell" onFallback={onShellFallback} fallback={<RenderDoc doc={fallback} docKey="shell" layout={layout} />}>{body}</DocBoundary>
        ) : (
          body
        )}
      </Frame>
    </ShellStateContext.Provider>
  );
}
