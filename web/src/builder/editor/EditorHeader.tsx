import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useEditorStore } from '@/builder/editor/store.ts';
import { usePuck, useGetPuck } from '@/builder/editor/use-puck.ts';
import { useHints, useIssues, useLockedPresent } from '@/builder/editor/use-issues.ts';
import { blockMenu, ROOT_ZONE } from '@/builder/editor/config.ts';
import { docLabel } from '@/builder/editor/page-catalog.ts';
import { isCustomKey } from '@/builder/editor/page-set.ts';
import { PagePicker } from '@/builder/editor/PagePicker.tsx';
import { VIEWPORT_OPTIONS } from '@/builder/editor/viewports.ts';
import { CheckIcon, PanelLeftIcon, PanelRightIcon, PlusIcon, RedoIcon, TipIcon, UndoIcon, WarnIcon } from '@/builder/editor/icons.tsx';
import { blockDef } from '@/builder/rules.ts';
import type { PreviewAs } from '@/builder/mode.ts';
import type { DocKey, Issue } from '@/builder/types.ts';
import styles from '@/builder/editor/Editor.module.css';

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
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
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
            <input aria-label="Page title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="About us" maxLength={120} required />
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

// ── add block / history ──────────────────────────────────────────────────────

function AddBlock() {
  const docKey = useEditorStore((s) => s.docKey);
  const layout = useEditorStore((s) => s.layout);
  const present = useLockedPresent();
  const dispatch = usePuck((s) => s.dispatch);
  const getPuck = useGetPuck();
  const groups = useMemo(() => blockMenu(docKey, layout, present), [docKey, layout, present]);
  return (
    <label className={styles.addBlock}>
      <PlusIcon />
      <span className={styles.srOnly}>Add block</span>
      <select
        aria-label="Add block"
        value=""
        onChange={(e) => {
          const componentType = e.target.value;
          if (!componentType) return;
          const { appState } = getPuck();
          const sel = appState.ui.itemSelector;
          // After the selected block (in its own slot), or at the end of the page.
          const zone = sel?.zone ?? ROOT_ZONE;
          const index = sel ? sel.index + 1 : appState.data.content.length;
          dispatch({ type: 'insert', componentType, destinationIndex: index, destinationZone: zone });
          dispatch({ type: 'setUi', ui: { itemSelector: { index, zone } }, recordHistory: false });
        }}
      >
        <option value="">Add block…</option>
        {groups.map((g) => (
          <optgroup key={g.category} label={g.title}>
            {g.blocks.map((b) => <option key={b.name} value={b.name}>{b.label}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

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
      <button type="button" className={styles.buttonDanger} onClick={() => { useEditorStore.getState().resetDoc(docKey); setConfirming(false); }}>
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
      const el = document.querySelector(`[data-puck-component="${CSS.escape(blockId)}"]`);
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
  const popover = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const id = useId();
  const popoverId = `sfb-issues-${id.replace(/:/g, '')}`;

  // Arriving from an issue on another page: select its block once this canvas is up.
  useEffect(() => {
    if (!pendingJump || pendingJump.docKey !== docKey) return;
    const { blockId } = pendingJump;
    pendingJump = null;
    const t = setTimeout(() => jump(blockId), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  const place = () => {
    const el = popover.current;
    const btn = trigger.current;
    if (!el || !btn) return;
    const r = btn.getBoundingClientRect();
    el.style.top = `${Math.round(r.bottom + 6)}px`;
    el.style.right = `${Math.max(8, Math.round(window.innerWidth - r.right))}px`;
  };

  const go = (target: { docKey: DocKey; blockId?: string }) => {
    popover.current?.hidePopover?.();
    if (target.docKey !== docKey) {
      pendingJump = target;
      useEditorStore.getState().selectDoc(target.docKey);
      return;
    }
    jump(target.blockId);
  };

  const count = issues.length;
  const summary = count === 0 ? 'No issues' : `${count} issue${count === 1 ? '' : 's'}`;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.issuesButton}
        data-count={count}
        popoverTarget={popoverId}
        aria-label="Issues"
        aria-describedby={`${popoverId}-summary`}
        aria-expanded={open}
      >
        {count === 0 ? <CheckIcon /> : <WarnIcon />}
        <span id={`${popoverId}-summary`}>{count === 0 ? summary : `${summary}, publishing is blocked`}</span>
        {hints.length > 0 && <span className={styles.tipCount}>{hints.length} tip{hints.length === 1 ? '' : 's'}</span>}
      </button>
      <div
        ref={popover}
        id={popoverId}
        popover="auto"
        className={styles.issuesPanel}
        onToggle={(e) => {
          const nowOpen = (e.nativeEvent as ToggleEvent).newState === 'open';
          if (nowOpen) place();
          setOpen(nowOpen);
        }}
      >
        <section aria-labelledby={`${popoverId}-issues`}>
          <h2 id={`${popoverId}-issues`} className={styles.panelTitle}>
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
          <section aria-labelledby={`${popoverId}-tips`} className={styles.panelTips}>
            <h2 id={`${popoverId}-tips`} className={styles.panelTitle}>Tips for this page</h2>
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
      </div>
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
