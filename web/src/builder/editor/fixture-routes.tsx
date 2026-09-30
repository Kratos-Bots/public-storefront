import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useBlocker, useLocation } from 'react-router';
import { notifications } from '@mantine/notifications';
import { BUILDER_PATH } from '@/app/builder-gate.ts';
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { FIXTURE_ACCESS_KEY, FIXTURE_ORDER_REF } from '@/builder/editor/fixtures.ts';
import type { DocKey } from '@/builder/types.ts';

/** Where under /__builder a doc is shown, so blocks reading route params get fixture params. */
export function fixtureLocation(docKey: DocKey, productId: number | null): { pattern: string; path: string } {
  switch (docKey) {
    case 'product':
      return { pattern: 'p/:id', path: `p/${productId ?? 0}` };
    case 'account.order':
      return { pattern: 'account/orders/:ref', path: `account/orders/${FIXTURE_ORDER_REF}` };
    case 'order-status':
      return { pattern: 'order/:ref/:accessKey', path: `order/${FIXTURE_ORDER_REF}/${FIXTURE_ACCESS_KEY}` };
    default:
      return { pattern: 'doc/:docKey', path: `doc/${docKey.replace(':', '-')}` };
  }
}

/**
 * Shows the editor at the fixture path of the open doc (e.g. /__builder/account/orders/NB0977), so
 * blocks that read route params find them. While the path catches up with a new doc, the current
 * route keeps rendering when it still matches — the product page moving from p/0 to the first real
 * product must not remount the canvas and drop its undo history.
 */
export function FixtureRoutes({ children }: { children: ReactNode }) {
  const docKey = useEditorStore((s) => s.docKey);
  const { data: catalog } = useCatalog();
  const location = useLocation();
  const { pattern, path } = fixtureLocation(docKey, catalog?.products[0]?.id ?? null);
  const target = `${BUILDER_PATH}/${path}`;
  return (
    <>
      {location.pathname !== target && <Navigate to={target} replace />}
      <Routes>
        <Route path={pattern} element={children} />
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
