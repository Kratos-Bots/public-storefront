import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useBlocker, useLocation } from 'react-router';
import { notifications } from '@mantine/notifications';
import { BUILDER_PATH } from '@/app/builder-gate.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { FIXTURE_ORDER_REF } from '@/builder/editor/fixtures.ts';
import { usePreviewProduct } from '@/builder/editor/preview-product.ts';
import type { DocKey, LayoutKind } from '@/builder/types.ts';

/** Where under /__builder a doc is shown, so blocks reading route params get fixture params. */
export interface FixtureLocation {
  pattern: string;
  path: string;
  /** Search params the doc needs (the menu / web-app sheet's `?p=`); an owned one left out is removed. */
  params?: Record<string, string>;
}

export function fixtureLocation(docKey: DocKey, productId: number | null, layout: LayoutKind = 'storefront'): FixtureLocation {
  switch (docKey) {
    case 'product':
      // The storefront's product is a page; the menu / web-app one is the sheet over the catalogue,
      // opened by `?p=` (spec §11), so the exact preview's catalogue shows the real sheet.
      return layout === 'storefront'
        ? { pattern: 'p/:id', path: `p/${productId ?? 0}` }
        : { pattern: 'doc/:docKey', path: 'doc/product', params: { p: String(productId ?? 0) } };
    case 'account.order':
      return { pattern: 'account/orders/:ref', path: `account/orders/${FIXTURE_ORDER_REF}` };
    default:
      return { pattern: 'doc/:docKey', path: `doc/${docKey.replace(':', '-')}` };
  }
}

/** The search params a fixture location owns; everything else (?sf-builder=1…) is kept as it is. */
const OWNED_PARAMS = ['p'] as const;

/** `search` with each owned param set from `params`, or deleted when `params` has none (leaving the sheet drops `?p=`). */
function targetSearch(search: string, params: FixtureLocation['params']): string {
  const next = new URLSearchParams(search);
  for (const key of OWNED_PARAMS) {
    const value = params?.[key];
    if (value === undefined) next.delete(key);
    else next.set(key, value);
  }
  const out = next.toString();
  return out ? `?${out}` : '';
}

/**
 * Shows the editor at the fixture path of the open doc (e.g. /__builder/account/orders/NB0977), so
 * blocks that read route params find them. While the path catches up with a new doc, the current
 * route keeps rendering when it still matches — the product page moving from the sample product to
 * the preview product (or to another one picked in "Preview with") must not remount the canvas and
 * drop its undo history. The menu / web-app sheet's product rides in `?p=` (spec §11); a doc
 * without one drops it.
 */
export function FixtureRoutes({ children }: { children: ReactNode }) {
  const docKey = useEditorStore((s) => s.docKey);
  const layout = useEditorStore((s) => s.layout);
  const productId = usePreviewProduct().id;
  const location = useLocation();
  const { pattern, path, params } = fixtureLocation(docKey, productId, layout);
  const target = `${BUILDER_PATH}/${path}`;
  const search = targetSearch(location.search, params);
  return (
    <>
      {/* Keep the rest of the search (?sf-builder=1…): a frame reload must come back in builder mode. */}
      {(location.pathname !== target || location.search !== search) && (
        <Navigate to={{ pathname: target, search, hash: location.hash }} replace />
      )}
      <Routes>
        {/* Trailing splat: the exact preview nests the shop's own shell and page routes here. */}
        <Route path={`${pattern}/*`} element={children} />
      </Routes>
    </>
  );
}

/** Nothing inside the editor may take the frame away from /__builder (spec §6, Review Focus 5). */
export function useNavigationLock(): void {
  const blocker = useBlocker(({ nextLocation }) => !nextLocation.pathname.startsWith(BUILDER_PATH));
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    blocker.reset();
    notifications.show({ id: 'sf-builder-nav', message: 'Links don’t navigate while you edit. Pick a page from the Page menu instead.', position: 'bottom-center' });
  }, [blocker]);
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.('[data-sf-builder-canvas] a[href]')) event.preventDefault();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
}
