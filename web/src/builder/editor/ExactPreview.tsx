import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Route, Routes } from 'react-router';
import { Chromeless } from '@/layouts/Chromeless.tsx';
import { DocBoundary } from '@/builder/render.tsx';
import { PageSetOverrideProvider, PuckPage, PuckShell, resolveDoc } from '@/builder/runtime.tsx';
import { BuilderModeProvider } from '@/builder/mode.ts';
import { stableStringify, toPageSet } from '@/builder/editor/page-set.ts';
import { prepareDocs } from '@/builder/editor/prepare.ts';
import { guardHiddenCanvasHotkeys } from '@/builder/editor/preview-keys.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { useEditorText } from '@/builder/editor/text/hooks.ts';
import { EyeIcon } from '@/builder/editor/icons.tsx';
import type { ViewportWidth } from '@/builder/editor/protocol.ts';
import { CardDesignProvider } from '@/builder/card-design.tsx';
import { PageSetContext } from '@/builder/page-set-context.ts';
import { isCardKey, type DocKey, type LayoutKind, type RouteKey } from '@/builder/types.ts';
import styles from '@/builder/editor/Editor.module.css';

/**
 * The route a doc is previewed on. The shell and the card docs have no page of their own: preview
 * them around the catalogue, the shop's front door. So is the menu / web-app product doc, a sheet
 * over the catalogue: the fixture location carries `?p=<preview id>`, so the real sheet opens on
 * the draft (spec §11).
 */
export const routeKeyFor = (docKey: DocKey, layout: LayoutKind): RouteKey =>
  docKey === 'shell' || isCardKey(docKey) || (docKey === 'product' && layout !== 'storefront') ? 'catalog' : docKey;

/**
 * A width preset (Phone / Tablet / Desktop) is an exact preview: the admin has sized the frame to
 * that width, so media queries match, and the draft renders through the storefront's own runtime —
 * PageSetOverrideProvider with the draft set, then PuckShell (header, footer, cart drawer, cart bar
 * and the other system mounts) around PuckPage, or Chromeless for a `chrome: 'none'` page, exactly
 * as the live routes do. Fixture mode stays on; there are no editor hints (`editing: false`).
 *
 * The routes nest under the fixture route (fixture-routes.tsx gives it a trailing `/*`), so blocks
 * read the same fixture params (`p/:id`, `order/:ref/:accessKey`). PuckShell's route-key lookup
 * finds no `handle` here, so the chrome choice PuckShell would make from it is made below instead.
 *
 * Nothing can be edited while it shows, so nothing is posted (session.ts), and Puck's hotkeys are
 * held back (preview-keys.ts). "Back to editing" returns to Fit, where the still-mounted Puck
 * canvas carries on with its selection and undo history.
 */
export function ExactPreview({ width }: { width: ViewportWidth }) {
  const back = useRef<HTMLButtonElement>(null);
  // Keyboard users land on the way back, not at the top of the document.
  useEffect(() => back.current?.focus({ preventScroll: true }), []);
  // Before paint: no keystroke may reach the hidden canvas while this shows.
  useLayoutEffect(() => guardHiddenCanvasHotkeys(window), []);

  return (
    <div className={styles.exact} data-sf-builder-exact={width}>
      <div className={styles.exactBar} role="region" aria-label="Exact preview">
        <span className={styles.exactLabel}>
          <EyeIcon />
          <span>Previewing at <strong>{width} px</strong></span>
        </span>
        <button ref={back} type="button" className={styles.button} onClick={() => useEditorStore.getState().setViewport(null)}>
          Back to editing
        </button>
      </div>
      {/* Its own scroller, so the shop's sticky header sticks under this bar, not behind it. */}
      <div className={styles.exactBody} data-sf-builder-canvas="">
        <ExactRuntime
          failTitle="This page can’t be previewed"
          failBody="Part of the draft failed to render. Go back to editing and check its blocks."
        />
      </div>
    </div>
  );
}

/**
 * The open doc of the loaded set, rendered by the storefront's own runtime (see ExactPreview):
 * the width presets while editing, and the read-only version view at a width preset, both use it.
 */
export function ExactRuntime({ failTitle, failBody }: { failTitle: string; failBody: string }) {
  const docKey = useEditorStore((s) => s.docKey);
  const layout = useEditorStore((s) => s.layout);
  const docs = useEditorStore((s) => s.docs);
  const previewAs = useEditorStore((s) => s.previewAs);
  const mode = useMemo(() => ({ editing: false, previewAs }), [previewAs]);
  const pageText = useEditorStore((s) => s.pageText);
  const text = useEditorText();
  const pageSet = useMemo(() => toPageSet(prepareDocs(docs), layout, pageText), [docs, layout, pageText]);
  const routeKey = routeKeyFor(docKey, layout);
  const page = resolveDoc(pageSet, routeKey, layout);
  const chromeless = page?.doc.root.props.chrome === 'none';
  // PuckShell mounts these itself; the chrome-less frame gets them here, as PuckShell would (spec §6.2).
  const setValue = useMemo(() => ({ pageSet, layout }), [pageSet, layout]);

  return (
    <BuilderModeProvider value={mode}>
      <PageSetOverrideProvider pageSet={pageSet} text={text}>
        <DocBoundary
          key={stableStringify(pageSet)}
          docKey={routeKey}
          fallback={
            <div className={styles.failed} role="alert">
              <h2 className={styles.failedTitle}>{failTitle}</h2>
              <p>{failBody}</p>
            </div>
          }
        >
          {page ? (
            <Routes>
              <Route
                element={chromeless ? (
                  <PageSetContext.Provider value={setValue}>
                    <CardDesignProvider cards={pageSet.cards} layout={layout}>
                      <Chromeless />
                    </CardDesignProvider>
                  </PageSetContext.Provider>
                ) : <PuckShell />}
              >
                <Route index element={<PuckPage key={routeKey} routeKey={routeKey} />} />
              </Route>
            </Routes>
          ) : (
            <p className={styles.failed} role="alert">This page no longer exists.</p>
          )}
        </DocBoundary>
      </PageSetOverrideProvider>
    </BuilderModeProvider>
  );
}
