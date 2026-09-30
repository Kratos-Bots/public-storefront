import { Component, useMemo, type ReactNode } from 'react';
import { Puck, type Data, type Overrides, type UiState } from '@puckeditor/core';
// Puck's styles without its @import of Inter from rsms.me: the frame loads nothing from third parties.
import '@puckeditor/core/no-external.css';
import { DocBoundary, RenderDoc } from '@/builder/render.tsx';
import { validateDoc } from '@/builder/guard.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { buildEditorConfig } from '@/builder/editor/config.ts';
import { docFor, isCustomKey } from '@/builder/editor/page-set.ts';
import { PageGround } from '@/builder/editor/page-ground.tsx';
import { ExactPreview, ExactRuntime } from '@/builder/editor/ExactPreview.tsx';
import type { DocKey, LayoutKind, PuckDoc } from '@/builder/types.ts';
import { isLockedOn } from '@/builder/editor/route-bound.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { useCurrentDoc, useIssues, useLockedPresent } from '@/builder/editor/use-issues.ts';
import { EditorHeader, PreviewAsControls, resetOrDelete, ViewportToggle } from '@/builder/editor/EditorHeader.tsx';
import { restingMarkIds, restingMarksCss } from '@/builder/editor/resting-marks.ts';
import { PagePicker } from '@/builder/editor/PagePicker.tsx';
import { EyeIcon, LockIcon, WarnIcon } from '@/builder/editor/icons.tsx';
import { PUCK_VIEWPORTS } from '@/builder/editor/viewports.ts';
import { CanvasTextScope } from '@/builder/editor/text/scope.tsx';
import { usePublishedTextSync } from '@/builder/editor/text/hooks.ts';
import { initialPanels } from '@/builder/editor/panels.ts';
import { TEXT_PLUGIN } from '@/builder/editor/text/plugin.tsx';
import { FieldsWithText } from '@/builder/editor/text/BlockText.tsx';
import styles from '@/builder/editor/Editor.module.css';

function BlockOverlay({ children, componentId, componentType }: { children: ReactNode; hover: boolean; isSelected: boolean; componentId: string; componentType: string }) {
  const docKey = useEditorStore((s) => s.docKey);
  const issues = useIssues();
  const flagged = issues.some((i) => i.docKey === docKey && i.blockId === componentId);
  const locked = isLockedOn(componentType, docKey);
  return (
    <>
      {children}
      {(locked || flagged) && (
        <span className={styles.overlayBadge} data-kind={flagged ? 'issue' : 'lock'}>
          {flagged ? <WarnIcon /> : <LockIcon />}
          {flagged ? 'Needs attention' : 'Required on this page'}
        </span>
      )}
    </>
  );
}

const OVERRIDES: Partial<Overrides> = { header: EditorHeader, componentOverlay: BlockOverlay, fields: FieldsWithText };
// Module constant: a new array per render would rebuild Puck's plugin rail every time.
const PLUGINS = [TEXT_PLUGIN];
// The canvas always fills the frame; the admin sizes the frame (sf-builder-viewport). Puck's own
// viewport controls stay hidden so there is one width control, in our header.
const INITIAL_UI: Partial<UiState> = {
  viewports: { current: { width: '100%', height: 'auto' }, controlsVisible: false, options: PUCK_VIEWPORTS },
};

interface CanvasBoundaryProps { children: ReactNode; fallback: ReactNode }

/**
 * Last line of defence around the whole canvas (each block already has its own boundary). Keyed by
 * the caller on (doc, epoch), so a crashed draft gets a fresh attempt after a reset, a reload or
 * a page switch instead of staying stuck on the fallback.
 */
class CanvasBoundary extends Component<CanvasBoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('[builder] the editor canvas failed to render', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function CanvasFailed() {
  const docKey = useEditorStore((s) => s.docKey);
  const touched = useEditorStore((s) => docKey in s.docs);
  return (
    <div className={styles.readOnly}>
      <header className={styles.bar}>
        <div className={styles.group}>
          <PagePicker />
        </div>
      </header>
      <div className={styles.failed} role="alert">
        <h2 className={styles.failedTitle}>This page can’t open in the editor</h2>
        <p>Something in its saved blocks stops the editor from showing it. Other pages are unaffected.</p>
        {touched && (
          <button type="button" className={styles.buttonDanger} onClick={() => resetOrDelete(docKey)}>
            {isCustomKey(docKey) ? 'Delete page' : 'Reset page to default'}
          </button>
        )}
      </div>
    </div>
  );
}

function ReadOnlyView() {
  const docKey = useEditorStore((s) => s.docKey);
  const layout = useEditorStore((s) => s.layout);
  const docs = useEditorStore((s) => s.docs);
  const epoch = useEditorStore((s) => s.epoch);
  const viewport = useEditorStore((s) => s.viewport);
  const doc = useMemo(() => shownDoc(docFor(docs, docKey, layout), docKey, layout), [docs, docKey, layout]);
  return (
    <div className={styles.readOnly} data-exact={viewport !== null ? '' : undefined}>
      <header className={styles.bar}>
        <div className={styles.group}>
          <PagePicker />
          <span className={styles.readOnlyBadge}>
            <EyeIcon />
            Published version · read only
          </span>
        </div>
        <div className={`${styles.group} ${styles.groupEnd}`}>
          <ViewportToggle />
          <PreviewAsControls />
        </div>
      </header>
      {viewport !== null ? (
        // A width preset: the same exact, full-runtime render as while editing (shell, system
        // mounts, the page's own chrome choice), so a published version is judged as shoppers see it.
        <div className={styles.exactBody} data-sf-builder-exact={viewport} data-sf-builder-canvas="">
          <ExactRuntime
            failTitle="This page can’t be shown"
            failBody="Part of the published version failed to render. Shoppers see the default page instead."
          />
        </div>
      ) : (
        <div className={styles.readOnlyCanvas}>
          {/* Keyed on the loaded set and the page: a crash in one version never sticks to the next. */}
          <DocBoundary
            key={`${epoch}|${docKey}`}
            docKey={docKey}
            fallback={
              <div className={styles.failed} role="alert">
                <h2 className={styles.failedTitle}>This page can’t be shown</h2>
                <p>Part of the published version failed to render. Shoppers see the default page instead.</p>
              </div>
            }
          >
            <CanvasTextScope>
              <PageGround docKey={docKey} layout={layout}>
                <RenderDoc doc={doc} docKey={docKey} layout={layout} />
              </PageGround>
            </CanvasTextScope>
          </DocBoundary>
        </div>
      )}
    </div>
  );
}

/** A doc as the storefront would render it: the guard's version, else the route's default. */
function shownDoc(raw: PuckDoc, docKey: DocKey, layout: LayoutKind): PuckDoc {
  return validateDoc(raw, docKey, layout).doc ?? defaultDoc(docKey, layout) ?? raw;
}

/** Issue outlines and lock marks on the open doc, visible without hovering (see resting-marks.ts). */
function RestingMarks() {
  const doc = useCurrentDoc();
  const docKey = useEditorStore((s) => s.docKey);
  const issues = useIssues();
  const css = useMemo(() => restingMarksCss(restingMarkIds(doc, docKey, issues)), [doc, docKey, issues]);
  return css ? <style data-sf-builder-marks="">{css}</style> : null;
}

export function EditorCanvas() {
  // Before the read-only return: a published version without siteText still needs the shared wording.
  usePublishedTextSync();
  const docKey = useEditorStore((s) => s.docKey);
  const layout = useEditorStore((s) => s.layout);
  const epoch = useEditorStore((s) => s.epoch);
  const readOnly = useEditorStore((s) => s.readOnly);
  const viewport = useEditorStore((s) => s.viewport);
  // Memoised on the sorted names of the locked blocks present, not the doc: edits don't rebuild it.
  const present = useLockedPresent();
  const config = useMemo(() => buildEditorConfig(docKey, layout, present), [docKey, layout, present]);
  // Puck's `data` is initial state: read the store once per (doc, epoch) and let Puck own it after.
  const data = useMemo(() => {
    const s = useEditorStore.getState();
    return docFor(s.docs, s.docKey, s.layout) as unknown as Data;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey, layout, epoch]);
  // Also initial state, once per mount: a narrow frame opens with the Blocks panel closed.
  const ui = useMemo<Partial<UiState>>(
    () => ({ ...INITIAL_UI, ...initialPanels(window.innerWidth) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [docKey, layout, epoch],
  );

  if (readOnly) return <ReadOnlyView />;
  const mount = `${docKey}|${epoch}`;
  return (
    <CanvasBoundary key={mount} fallback={<CanvasFailed />}>
      {viewport !== null && <ExactPreview width={viewport} />}
      <div className={styles.puckHost} hidden={viewport !== null}>
        <RestingMarks />
        <CanvasTextScope>
          <Puck
            key={mount}
            config={config}
            data={data}
            // The mount epoch travels with every change, so a late onChange from a canvas that a load,
            // reset or new page replaced is ignored by the store.
            onChange={(next) => useEditorStore.getState().updateDoc(docKey, next, epoch)}
            iframe={{ enabled: false }}
            viewports={PUCK_VIEWPORTS}
            ui={ui}
            overrides={OVERRIDES}
            plugins={PLUGINS}
            height="100dvh"
          />
        </CanvasTextScope>
      </div>
    </CanvasBoundary>
  );
}
