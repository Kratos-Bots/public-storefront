import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useEditorStore } from '@/builder/editor/store.ts';
import { usePuck, useGetPuck } from '@/builder/editor/use-puck.ts';
import { useHints, useIssues, useLockedPresent } from '@/builder/editor/use-issues.ts';
import { blockMenu } from '@/builder/editor/config.ts';
import { insertTarget, type InsertApi } from '@/builder/editor/insert-target.ts';
import { docLabel } from '@/builder/editor/page-catalog.ts';
import { isCustomKey } from '@/builder/editor/page-set.ts';
import { focusPagePickerSoon, PagePicker } from '@/builder/editor/PagePicker.tsx';
import { FloatingPanel } from '@/builder/editor/floating.tsx';
import { VIEWPORT_OPTIONS } from '@/builder/editor/viewports.ts';
import { cssString } from '@/builder/editor/resting-marks.ts';
import { rememberPanels } from '@/builder/editor/panels.ts';
import { CheckIcon, PanelLeftIcon, PanelRightIcon, PlusIcon, RedoIcon, TipIcon, UndoIcon, WarnIcon } from '@/builder/editor/icons.tsx';
import { blockDef } from '@/builder/rules.ts';
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

function History() {
  const back = usePuck((s) => s.history.back);
  const forward = usePuck((s) => s.history.forward);
  const hasPast = usePuck((s) => s.history.hasPast);
  const hasFuture = usePuck((s) => s.history.hasFuture);
  return (
    <span className={styles.pair}>
      <button type="button" className={styles.iconButton} aria-label="Undo" title="Undo" disabled={!hasPast} onClick={() => back()}>
        <UndoIcon />
      </button>
      <button type="button" className={styles.iconButton} aria-label="Redo" title="Redo" disabled={!hasFuture} onClick={() => forward()}>
        <RedoIcon />
      </button>
    </span>
  );
}

/**
 * Puck's own header held the sidebar toggles; ours replaces it, so they live here. Under 638 px
 * (the Phone width) Puck shows one panel at a time, so opening one closes the other — as Puck does.
 */
function PanelToggles() {
  const dispatch = usePuck((s) => s.dispatch);
  const left = usePuck((s) => s.appState.ui.leftSideBarVisible);
  const right = usePuck((s) => s.appState.ui.rightSideBarVisible);
  const toggle = (side: 'left' | 'right') => {
    const narrow = !window.matchMedia?.('(min-width: 638px)').matches;
    const visible = side === 'left' ? left : right;
    rememberPanels(side === 'left'
      ? { left: !visible, ...(narrow ? { right: false } : {}) }
      : { right: !visible, ...(narrow ? { left: false } : {}) });
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
  const hints = useHints();
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

  const count = issues.length;
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
          {count === 0 ? (
            <p className={styles.panelEmpty}>Every page in this layout passes its checks.</p>
          ) : (
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

/** Replaces Puck's header (no Publish: the admin publishes). Rendered inside <Puck>. */
export function EditorHeader(_props: { actions: ReactNode; children: ReactNode }) {
  const docKey = useEditorStore((s) => s.docKey);
  return (
    <header className={styles.bar} data-sf-builder-header="">
      <div className={styles.group}>
        <PagePicker />
        <NewPage />
      </div>
      <div className={styles.group}>
        <AddBlock />
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
  );
}
