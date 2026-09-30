import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { setPuckHistorySource, useEditorStore } from '@/builder/editor/store.ts';
import { usePuck, useGetPuck } from '@/builder/editor/use-puck.ts';
import { useHints, useIssues, useLockedPresent } from '@/builder/editor/use-issues.ts';
import { blockMenu } from '@/builder/editor/config.ts';
import { insertTarget, type InsertApi } from '@/builder/editor/insert-target.ts';
import { docLabel, LAYOUT_LABELS } from '@/builder/editor/page-catalog.ts';
import { isCustomKey } from '@/builder/editor/page-set.ts';
import { focusPagePickerSoon, PagePicker } from '@/builder/editor/PagePicker.tsx';
import { FloatingPanel } from '@/builder/editor/floating.tsx';
import { VIEWPORT_OPTIONS } from '@/builder/editor/viewports.ts';
import { cssString } from '@/builder/editor/resting-marks.ts';
import { rememberPanel, shouldAutoCloseBlocks, WIDE_FRAME_QUERY } from '@/builder/editor/panels.ts';
import { CheckIcon, PanelLeftIcon, PanelRightIcon, PlusIcon, RedoIcon, TextIcon, TipIcon, UndoIcon, WarnIcon } from '@/builder/editor/icons.tsx';
import { useTextIssues } from '@/builder/editor/text/hooks.ts';
import { useTextUi } from '@/builder/editor/text/ui-store.ts';
import { TextOverlay } from '@/builder/editor/text/TextOverlay.tsx';
import { useWideFrame } from '@/builder/editor/text/plugin.tsx';
import { puckHistoryView, redoStep, setAnchorSource, undoStep } from '@/builder/editor/text/history.ts';
import { rowFor } from '@/builder/editor/text/catalog.ts';
import { blockDef } from '@/builder/rules.ts';
import { registerLiveCanvas } from '@/builder/editor/late-upload.ts';
import type { PreviewAs } from '@/builder/mode.ts';
import type { DocKey, Issue } from '@/builder/types.ts';
import styles from '@/builder/editor/Editor.module.css';

const domId = (reactId: string) => reactId.replace(/[^A-Za-z0-9_-]/g, '');

// ── new page ─────────────────────────────────────────────────────────────────

function NewPage() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reset = () => { setSlug(''); setTitle(''); setError(null); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = useEditorStore.getState().createPage(slug.trim(), title);
    if (problem) { setError(problem); return; }
    focusPagePickerSoon();
    reset();
    dialog.current?.close();
  };
  return (
    <>
      <button type="button" className={styles.button} onClick={() => dialog.current?.showModal()}>
        <PlusIcon />
        New page
      </button>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="sfb-new-page-title" onClose={reset}>
        <form onSubmit={submit} className={styles.dialogBody}>
          <h2 id="sfb-new-page-title" className={styles.dialogTitle}>New page</h2>
          <p className={styles.dialogLead}>A page of your own, reachable at its address. It starts empty.</p>
          <label className={styles.stack}>
            <span className={styles.fieldLabel}>Address</span>
            <span className={styles.prefixed}>
              <span aria-hidden="true">/pages/</span>
              <input
                aria-label="Page address"
                aria-describedby="sfb-new-page-hint"
                value={slug}
                onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-')); setError(null); }}
                placeholder="about-us"
                maxLength={60}
                autoComplete="off"
                spellCheck={false}
                required
              />
            </span>
            <span id="sfb-new-page-hint" className={styles.fieldHint}>Lowercase letters, digits and hyphens.</span>
          </label>
          <label className={styles.stack}>
            <span className={styles.fieldLabel}>Title</span>
            <input
              aria-label="Page title"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError(null); }}
              placeholder="About us"
              maxLength={120}
              required
            />
          </label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.dialogActions}>
            <button type="button" className={styles.buttonQuiet} onClick={() => dialog.current?.close()}>Cancel</button>
            <button type="submit" className={styles.buttonPrimary}>Create page</button>
          </div>
        </form>
      </dialog>
    </>
  );
}

// ── add block ────────────────────────────────────────────────────────────────

/**
 * A button and a menu — not a native <select>: on Windows and in Firefox the arrow keys fire
 * `change` on a closed select, which would insert a block per keypress. Arrow keys move, Enter
 * inserts, Escape closes; focus returns to the button.
 */
function AddBlock() {
  const docKey = useEditorStore((s) => s.docKey);
  const layout = useEditorStore((s) => s.layout);
  const present = useLockedPresent();
  const dispatch = usePuck((s) => s.dispatch);
  const getPuck = useGetPuck();
  const groups = useMemo(() => blockMenu(docKey, layout, present), [docKey, layout, present]);
  const [open, setOpen] = useState(false);
  const [afterSelected, setAfterSelected] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = domId(useId());

  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
  const show = () => {
    setAfterSelected(getPuck().appState.ui.itemSelector !== null);
    setOpen(true);
  };
  const hide = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  // First item takes focus when the menu opens.
  useEffect(() => {
    if (open) items()[0]?.focus();
  }, [open]);

  const insert = (componentType: string) => {
    const api = getPuck();
    const target = insertTarget(api as unknown as InsertApi, componentType);
    dispatch({ type: 'insert', componentType, destinationIndex: target.index, destinationZone: target.zone });
    dispatch({ type: 'setUi', ui: { itemSelector: { index: target.index, zone: target.zone } }, recordHistory: false });
    hide(true);
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    if (list.length === 0) return;
    const at = list.indexOf(document.activeElement as HTMLElement);
    const move = (i: number) => { e.preventDefault(); list[(i + list.length) % list.length]?.focus(); };
    if (e.key === 'ArrowDown') move(at + 1);
    else if (e.key === 'ArrowUp') move(at < 0 ? list.length - 1 : at - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(list.length - 1);
    else if (e.key === 'Tab') hide(false);
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className={styles.addBlock}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => (open ? hide(false) : show())}
        onKeyDown={(e) => {
          if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) { e.preventDefault(); show(); }
        }}
      >
        <PlusIcon />
        Add block
      </button>
      <FloatingPanel
        anchor={button}
        open={open}
        onClose={(reason) => hide(reason === 'escape')}
        className={styles.menuPanel}
      >
        {/* Only menu items may live inside role="menu": the hints sit beside it and describe it. */}
        <p id={`${id}-hint`} className={styles.menuHint}>
          {groups.length === 0
            ? 'Nothing more can go on this page.'
            : afterSelected ? 'Adds after the selected block.' : 'Adds at the end of the page.'}
        </p>
        <div ref={menu} id={`${id}-menu`} role="menu" aria-label="Blocks to add" aria-describedby={`${id}-hint`} onKeyDown={onMenuKey}>
          {groups.map((g) => (
            <div key={g.category} role="group" aria-labelledby={`${id}-${g.category}`} className={styles.menuGroup}>
              <div id={`${id}-${g.category}`} className={styles.menuGroupTitle}>{g.title}</div>
              {g.blocks.map((b) => (
                <button key={b.name} type="button" role="menuitem" tabIndex={-1} className={styles.menuItem} data-block={b.name} onClick={() => insert(b.name)}>
                  {b.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </FloatingPanel>
    </>
  );
}

// ── history / panels ─────────────────────────────────────────────────────────

/**
 * One timeline for block and text edits (spec §7.4): Puck owns block history, the store owns text
 * snapshots anchored to Puck's entries (text/history.ts decides which to step).
 *
 * Every read of Puck's history goes through `getPuck()` at call time — Puck updates that store
 * synchronously from its app store, so it is live — never a value captured at render, which is
 * stale inside Puck's onChange and the microtask after it.
 */
function useUnifiedHistory() {
  const getPuck = useGetPuck();
  const hasPast = usePuck((s) => s.history.hasPast);
  const hasFuture = usePuck((s) => s.history.hasFuture);
  const textPast = useEditorStore((s) => s.textPast.length > 0);
  const textFuture = useEditorStore((s) => s.textFuture.length > 0);
  const view = () => puckHistoryView(getPuck().history);
  const undo = () => {
    const s = useEditorStore.getState();
    const step = undoStep(s.textPast.at(-1), view());
    if (step === 'text') s.undoText();
    else if (step === 'doc') getPuck().history.back();
  };
  const redo = () => {
    const s = useEditorStore.getState();
    const step = redoStep(s.textFuture.at(-1), view());
    if (step === 'text') s.redoText();
    else if (step === 'doc') getPuck().history.forward();
    else if (step === 'discard') s.discardTextFuture();
  };
  return { undo, redo, view, canUndo: hasPast || textPast, canRedo: hasFuture || textFuture };
}

function History() {
  const getPuck = useGetPuck();
  const { undo, redo, view, canUndo, canRedo } = useUnifiedHistory();
  // Text edits are stamped with the Puck entry current when they were made, and the store reads
  // Puck's history to tell a canvas undo/redo from a new block edit. Both read Puck live.
  useEffect(() => {
    setAnchorSource(() => puckHistoryView(getPuck().history).anchor);
    setPuckHistorySource(() => puckHistoryView(getPuck().history));
    return () => { setAnchorSource(null); setPuckHistorySource(null); };
  }, [getPuck]);
  // Puck's own hotkeys listen on document and would undo a block while the owner types in a text
  // field. Take the keys first when the next step is a text step. Inside the text UI nothing else
  // is taken: with no text step (a block step, or nothing), the field keeps its own native undo.
  const onKey = (e: globalThis.KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    const z = key === 'z' || e.code === 'KeyZ';
    const isUndo = z && !e.shiftKey;
    const isRedo = (z && e.shiftKey) || key === 'y' || e.code === 'KeyY';
    if (!isUndo && !isRedo) return;
    const s = useEditorStore.getState();
    if (s.viewport !== null) return; // the exact preview's guard owns these keys (preview-keys.ts)
    const target = e.target as Element | null;
    const inText = typeof target?.closest === 'function' && target.closest('[data-sfb-text]') !== null;
    const step = isUndo ? undoStep(s.textPast.at(-1), view()) : redoStep(s.textFuture.at(-1), view());
    if (step === 'discard') {
      // A text redo the owner branched away from: drop it, as the Redo button does. In a field the
      // key then stays the field's own redo; elsewhere it is spent on the drop, like one click.
      s.discardTextFuture();
      if (inText) return;
    } else if (step !== 'text') {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (step === 'text') { if (isUndo) undo(); else redo(); }
  };
  // One listener per mount; it calls the latest handler through a ref.
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;
  useEffect(() => {
    const listener = (e: globalThis.KeyboardEvent) => onKeyRef.current(e);
    window.addEventListener('keydown', listener, true);
    return () => window.removeEventListener('keydown', listener, true);
  }, []);
  return (
    <span className={styles.pair}>
      <button type="button" className={styles.iconButton} aria-label="Undo" title="Undo" disabled={!canUndo} onClick={undo}>
        <UndoIcon />
      </button>
      <button type="button" className={styles.iconButton} aria-label="Redo" title="Redo" disabled={!canRedo} onClick={redo}>
        <RedoIcon />
      </button>
    </span>
  );
}

/** Opens the Text panel (every wording on the site); pressed while it shows. */
function TextButton({ buttonRef }: { buttonRef: RefObject<HTMLButtonElement | null> }) {
  const open = useTextUi((s) => s.open);
  return (
    <button ref={buttonRef} type="button" className={styles.button} aria-pressed={open} onClick={() => (open ? useTextUi.getState().hide() : useTextUi.getState().show())}>
      <TextIcon />
      Text
    </button>
  );
}

/**
 * Wide: the Text panel is Puck's `text` sidebar tab. Narrow: an overlay. Keeps the two in step
 * (spec §7.2): opening shows the tab, closing returns to Blocks; picking another rail tab or
 * hiding the left sidebar closes the panel.
 */
export function useTextPanelPlacement(): { overlay: boolean } {
  const wide = useWideFrame();
  const open = useTextUi((s) => s.open);
  const dispatch = usePuck((s) => s.dispatch);
  const current = usePuck((s) => s.appState.ui.plugin?.current ?? null);
  const leftVisible = usePuck((s) => s.appState.ui.leftSideBarVisible);
  useEffect(() => {
    if (!wide) {
      // Narrowed while the tab showed: its body is empty below the wide width, so give Blocks back.
      if (current === 'text') dispatch({ type: 'setUi', ui: { plugin: { current: 'blocks' } }, recordHistory: false });
      return;
    }
    if (open && (current !== 'text' || !leftVisible)) {
      dispatch({ type: 'setUi', ui: { plugin: { current: 'text' }, leftSideBarVisible: true }, recordHistory: false });
    } else if (!open && current === 'text') {
      dispatch({ type: 'setUi', ui: { plugin: { current: 'blocks' } }, recordHistory: false });
    }
    // Only when the owner asks (open changes) or the width class flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, wide]);
  useEffect(() => {
    if (!wide) return;
    const ui = useTextUi.getState();
    const showing = current === 'text' && leftVisible;
    if (showing && !ui.open) ui.show();
    if (!showing && ui.open) ui.hide();
  }, [current, leftVisible, wide]);
  return { overlay: open && !wide };
}

/**
 * Puck's own header held the sidebar toggles; ours replaces it, so they live here. Under 638 px
 * (the Phone width) Puck shows one panel at a time, so opening one closes the other — as Puck does.
 */
function PanelToggles() {
  const dispatch = usePuck((s) => s.dispatch);
  const left = usePuck((s) => s.appState.ui.leftSideBarVisible);
  const right = usePuck((s) => s.appState.ui.rightSideBarVisible);
  // The admin can narrow the frame while someone edits at Fit: the Blocks panel steps aside
  // (unless they opened it themselves). Width presets are exact previews with Puck hidden, so a
  // change while previewing is not a reason to touch the panels.
  useEffect(() => {
    const query = window.matchMedia?.(WIDE_FRAME_QUERY);
    if (!query) return;
    const onChange = () => {
      if (useEditorStore.getState().viewport !== null || !shouldAutoCloseBlocks(query.matches)) return;
      dispatch({ type: 'setUi', ui: { leftSideBarVisible: false }, recordHistory: false });
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [dispatch]);
  const toggle = (side: 'left' | 'right') => {
    const narrow = !window.matchMedia?.('(min-width: 638px)').matches;
    const visible = side === 'left' ? left : right;
    rememberPanel(side, !visible);
    dispatch({
      type: 'setUi',
      ui: side === 'left'
        ? { leftSideBarVisible: !visible, ...(narrow ? { rightSideBarVisible: false } : {}) }
        : { rightSideBarVisible: !visible, ...(narrow ? { leftSideBarVisible: false } : {}) },
      recordHistory: false,
    });
  };
  return (
    <span className={styles.pair}>
      <button type="button" className={styles.iconButton} aria-label="Blocks panel" title="Blocks panel" aria-pressed={left} onClick={() => toggle('left')}>
        <PanelLeftIcon />
      </button>
      <button type="button" className={styles.iconButton} aria-label="Settings panel" title="Settings panel" aria-pressed={right} onClick={() => toggle('right')}>
        <PanelRightIcon />
      </button>
    </span>
  );
}

// ── preview controls (no Puck hooks: the read-only view uses them too) ───────

/** The admin does the actual resizing (sf-builder-viewport, posted by the session). */
export function ViewportToggle() {
  const viewport = useEditorStore((s) => s.viewport);
  return (
    <div className={styles.segmented} role="group" aria-label="Preview width">
      {VIEWPORT_OPTIONS.map((v) => (
        <button
          key={String(v.width)}
          type="button"
          aria-pressed={viewport === v.width}
          title={v.width ? `Preview at ${v.width} px wide` : 'Fill the available width'}
          onClick={() => useEditorStore.getState().setViewport(v.width)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

export function PreviewAsControls() {
  const previewAs = useEditorStore((s) => s.previewAs);
  const set = (patch: Partial<PreviewAs>) => useEditorStore.getState().setPreviewAs(patch);
  return (
    <div className={styles.previewAs} role="group" aria-label="Preview as">
      <span className={styles.caption} aria-hidden="true">Preview as</span>
      <select aria-label="Preview as — session" value={previewAs.session} onChange={(e) => set({ session: e.target.value as PreviewAs['session'] })}>
        <option value="signed-out">Signed out</option>
        <option value="signed-in">Signed in</option>
        <option value="signed-in-orders">Signed in, has orders</option>
      </select>
      <select aria-label="Preview as — cart" value={previewAs.cart} onChange={(e) => set({ cart: e.target.value as PreviewAs['cart'] })}>
        <option value="empty">Empty cart</option>
        <option value="items">Cart with items</option>
      </select>
    </div>
  );
}

// ── reset / delete ───────────────────────────────────────────────────────────

/** Reset a fixed page (or delete a custom one); the canvas remounts, so focus goes to the Page picker. */
export function resetOrDelete(docKey: DocKey): void {
  focusPagePickerSoon();
  useEditorStore.getState().resetDoc(docKey);
}

function ResetPage() {
  const docKey = useEditorStore((s) => s.docKey);
  const touched = useEditorStore((s) => docKey in s.docs);
  const [confirming, setConfirming] = useState(false);
  const custom = isCustomKey(docKey);
  const label = custom ? 'Delete page' : 'Reset page to default';
  if (!confirming) {
    return (
      <button
        type="button"
        className={styles.buttonQuiet}
        disabled={!touched}
        title={touched ? undefined : 'This page already matches the default'}
        onClick={() => setConfirming(true)}
      >
        {label}
      </button>
    );
  }
  return (
    <span className={styles.confirm} role="group" aria-label={label}>
      <span className={styles.confirmText}>{custom ? 'Delete this page?' : 'Undo all changes to this page?'}</span>
      <button type="button" className={styles.buttonDanger} onClick={() => { setConfirming(false); resetOrDelete(docKey); }}>
        {custom ? 'Delete it' : 'Reset it'}
      </button>
      <button type="button" className={styles.buttonQuiet} onClick={() => setConfirming(false)}>Keep</button>
    </span>
  );
}

// ── issues + hints ───────────────────────────────────────────────────────────

/** A block to select once the canvas for another doc has mounted (jumping across pages). */
let pendingJump: { docKey: DocKey; blockId?: string } | null = null;

const BLOCK_RULE_RE = /^(?:field|placement|layout|at-most-one|exactly-one):([A-Za-z0-9]+)/;

/** What part of the page an issue is about: a block's name, the page settings, or nothing more. */
function issuePart(issue: Issue): string | null {
  if (issue.rule.startsWith('limit:')) return 'Page settings';
  const type = BLOCK_RULE_RE.exec(issue.rule)?.[1];
  return type ? (blockDef(type)?.label ?? type) : null;
}

function useJump() {
  const dispatch = usePuck((s) => s.dispatch);
  const getPuck = useGetPuck();
  return (blockId: string | undefined) => {
    if (!blockId) {
      // No block: the page itself (title, description) — Puck shows page settings when nothing is selected.
      dispatch({ type: 'setUi', ui: { itemSelector: null }, recordHistory: false });
      return;
    }
    const selector = getPuck().getSelectorForId(blockId);
    if (!selector) return;
    dispatch({ type: 'setUi', ui: { itemSelector: selector }, recordHistory: false });
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-puck-component="${cssString(blockId)}"]`);
      const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el?.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
    });
  };
}

function IssuesMenu() {
  const issues = useIssues();
  const textIssues = useTextIssues();
  const hints = useHints();
  const layout = useEditorStore((s) => s.layout);
  const docs = useEditorStore((s) => s.docs);
  const docKey = useEditorStore((s) => s.docKey);
  const jump = useJump();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const id = domId(useId());

  // Arriving from an issue on another page: select its block once this canvas is up.
  useEffect(() => {
    if (!pendingJump || pendingJump.docKey !== docKey) return;
    const { blockId } = pendingJump;
    pendingJump = null;
    const t = setTimeout(() => jump(blockId), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  const go = (target: { docKey: DocKey; blockId?: string }) => {
    setOpen(false);
    if (target.docKey !== docKey) {
      pendingJump = target;
      useEditorStore.getState().selectDoc(target.docKey);
      // The store may refuse the page (gone, or not shown in this layout): don't leave a jump behind.
      if (useEditorStore.getState().docKey !== target.docKey) pendingJump = null;
      return;
    }
    jump(target.blockId);
  };

  const count = issues.length + textIssues.length;
  const summary = count === 0 ? 'No issues' : `${count} issue${count === 1 ? '' : 's'}, publishing is blocked`;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.issuesButton}
        data-count={count}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${id}-panel` : undefined}
        // The name reads what the button shows ("Issues 2 issues, publishing is blocked 1 tip").
        aria-labelledby={`${id}-label ${id}-count${hints.length > 0 ? ` ${id}-tips` : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span id={`${id}-label`} className={styles.srOnly}>Issues</span>
        {count === 0 ? <CheckIcon /> : <WarnIcon />}
        <span id={`${id}-count`}>{summary}</span>
        {hints.length > 0 && <span id={`${id}-tips`} className={styles.tipCount}>{hints.length} tip{hints.length === 1 ? '' : 's'}</span>}
      </button>
      <FloatingPanel
        anchor={trigger}
        open={open}
        onClose={(reason) => { setOpen(false); if (reason === 'escape') trigger.current?.focus(); }}
        align="end"
        className={styles.issuesPanel}
        id={`${id}-panel`}
        role="dialog"
        aria-labelledby={`${id}-issues`}
      >
        <section>
          <h2 id={`${id}-issues`} className={styles.panelTitle}>
            {count === 0 ? 'Nothing blocks publishing' : 'Fix these to publish'}
          </h2>
          {count === 0 && <p className={styles.panelEmpty}>Every page in this layout passes its checks.</p>}
          {issues.length > 0 && (
            <ul className={styles.panelList}>
              {issues.map((issue, i) => {
                const part = issuePart(issue);
                return (
                  <li key={`${issue.docKey}-${issue.rule}-${issue.blockId ?? ''}-${i}`}>
                    <button type="button" className={styles.panelItem} data-kind="issue" onClick={() => go(issue)}>
                      <WarnIcon />
                      <span className={styles.panelItemBody}>
                        <span className={styles.panelWhere}>
                          <span>{docLabel(issue.docKey, docs)}</span>
                          {part && <span className={styles.panelPart}>{part}</span>}
                        </span>
                        <span>{issue.message}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        {textIssues.length > 0 && (
          <section aria-labelledby={`${id}-text`} className={styles.panelTips}>
            <h2 id={`${id}-text`} className={styles.panelTitle}>Text</h2>
            <ul className={styles.panelList}>
              {textIssues.map((issue) => (
                <li key={`${issue.scope}-${issue.key}-${issue.rule}`}>
                  <button
                    type="button"
                    className={styles.panelItem}
                    data-kind="issue"
                    onClick={() => { setOpen(false); useTextUi.getState().show({ key: issue.key, filter: 'issues' }); }}
                  >
                    <WarnIcon />
                    <span className={styles.panelItemBody}>
                      <span className={styles.panelWhere}>
                        <span>{rowFor(issue.key)?.label ?? issue.key}</span>
                        <span className={styles.panelPart}>{issue.scope === 'shared' ? 'All layouts' : `Only ${LAYOUT_LABELS[layout]}`}</span>
                      </span>
                      <span>{issue.message}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {hints.length > 0 && (
          <section aria-labelledby={`${id}-tipsTitle`} className={styles.panelTips}>
            <h2 id={`${id}-tipsTitle`} className={styles.panelTitle}>Tips for this page</h2>
            <ul className={styles.panelList}>
              {hints.map((hint) => (
                <li key={hint.id}>
                  <button type="button" className={styles.panelItem} data-kind="tip" onClick={() => go({ docKey, blockId: hint.blockId })}>
                    <TipIcon />
                    <span className={styles.panelItemBody}>{hint.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </FloatingPanel>
    </>
  );
}

// ── header ───────────────────────────────────────────────────────────────────

/**
 * Lets a finished upload whose field has gone (late-upload.ts) set its block's prop through this
 * canvas's own Puck state. The header lives exactly as long as the Puck mount (keyed on doc and
 * epoch), so the doc and epoch it was mounted for are read once.
 */
function useLiveCanvas() {
  const getPuck = useGetPuck();
  const [mount] = useState(() => {
    const s = useEditorStore.getState();
    return { docKey: s.docKey, epoch: s.epoch };
  });
  useEffect(() => registerLiveCanvas({
    ...mount,
    setProp(blockId, prop, value) {
      const api = getPuck();
      if (blockId === null) {
        const root = api.appState.data.root;
        api.dispatch({ type: 'replaceRoot', root: { ...root, props: { ...root.props, [prop]: value } } });
        return true;
      }
      const selector = api.getSelectorForId(blockId);
      const item = selector ? api.getItemBySelector(selector) : undefined;
      if (!selector || !item) return false;
      api.dispatch({ type: 'replace', destinationIndex: selector.index, destinationZone: selector.zone, data: { ...item, props: { ...item.props, [prop]: value } } });
      return true;
    },
  }), [getPuck, mount]);
}

/** Replaces Puck's header (no Publish: the admin publishes). Rendered inside <Puck>. */
export function EditorHeader(_props: { actions: ReactNode; children: ReactNode }) {
  const docKey = useEditorStore((s) => s.docKey);
  useLiveCanvas();
  const { overlay } = useTextPanelPlacement();
  const textButton = useRef<HTMLButtonElement>(null);
  const closeOverlay = useCallback(() => { useTextUi.getState().hide(); textButton.current?.focus(); }, []);
  return (
    <>
    <header className={styles.bar} data-sf-builder-header="">
      <div className={styles.group}>
        <PagePicker />
        <NewPage />
      </div>
      <div className={styles.group}>
        <AddBlock />
        <TextButton buttonRef={textButton} />
        <History />
        <PanelToggles />
      </div>
      <div className={styles.group}>
        <ViewportToggle />
        <PreviewAsControls />
      </div>
      <div className={`${styles.group} ${styles.groupEnd}`}>
        <ResetPage key={docKey} />
        <IssuesMenu />
      </div>
    </header>
    {overlay && <TextOverlay onClose={closeOverlay} />}
    </>
  );
}
