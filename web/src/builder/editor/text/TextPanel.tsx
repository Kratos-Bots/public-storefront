// web/src/builder/editor/text/TextPanel.tsx
import { useEffect, useId, useMemo, useRef, useState, type FocusEvent } from 'react';
import type { EditorText } from '@/text/types.ts';
import { useTemplateContext } from '@/templates/runtime.tsx';
import { editorTextOf, textIssuesOf, useEditorStore } from '@/builder/editor/store.ts';
import { applyText, useEditorText, useLoadEpoch, useTextIssues, useTextReady } from '@/builder/editor/text/hooks.ts';
import { useTextUi, type TextFilter } from '@/builder/editor/text/ui-store.ts';
import { rowFor, rowMatches, textGroups, type TextRowDef } from '@/builder/editor/text/catalog.ts';
import { unusedEntries } from '@/builder/editor/text/issues.ts';
import { valueStrings } from '@/builder/editor/text/model.ts';
import { LAYOUT_LABELS } from '@/builder/editor/page-catalog.ts';
import { cssString } from '@/builder/editor/resting-marks.ts';
import { CloseIcon } from '@/builder/editor/icons.tsx';
import { LanguageSection } from '@/builder/editor/text/LanguageSection.tsx';
import { TextRow, summary } from '@/builder/editor/text/TextRow.tsx';
import styles from '@/builder/editor/text/Text.module.css';

const FILTERS: Array<{ id: TextFilter; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'edited', label: 'Edited' }, { id: 'layout', label: 'This layout' }, { id: 'issues', label: 'Issues' },
];
const FOCUS_TRIES = 5;
/** Rows mounted at once while a search or filter forces every group open; "Show more" adds a page. */
export const ROW_PAGE = 60;

const isEdited = (r: TextRowDef, text: EditorText) => text.shared[r.key] !== undefined || text.layout[r.key] !== undefined;

function passesFilter(r: TextRowDef, filter: TextFilter, text: EditorText, issueKeys: ReadonlySet<string>): boolean {
  if (filter === 'edited') return isEdited(r, text);
  if (filter === 'layout') return text.layout[r.key] !== undefined;
  if (filter === 'issues') return issueKeys.has(r.key);
  return true;
}
const passesQuery = (r: TextRowDef, query: string, text: EditorText) =>
  rowMatches(r, query, [...valueStrings(text.shared[r.key]), ...valueStrings(text.layout[r.key])]);

export function TextPanel({ onClose }: { onClose?: () => void }) {
  const id = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const templateId = useTemplateContext().resolved?.templateId ?? 'modern';
  const groups = useMemo(() => textGroups(templateId), [templateId]);
  const filter = useTextUi((s) => s.filter);
  const query = useTextUi((s) => s.query);
  const focus = useTextUi((s) => s.focus);
  const text = useEditorText();
  const issues = useTextIssues();
  const ready = useTextReady();
  const loadEpoch = useLoadEpoch();
  const sharedEditable = useEditorStore((s) => s.sharedEditable);
  const readOnly = useEditorStore((s) => s.readOnly);
  const layout = useEditorStore((s) => s.layout);
  const root = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  /**
   * The row being edited stays listed while its own edit would filter it out (fixing it under
   * Issues, clearing it under Edited): pinned on focus, released when the filter or search changes.
   */
  const [pinned, setPinned] = useState<string | null>(null);
  const [limit, setLimit] = useState(ROW_PAGE);
  useEffect(() => { setPinned(null); setLimit(ROW_PAGE); }, [filter, query]);

  const issueKeys = useMemo(() => new Set(issues.map((i) => i.key)), [issues]);
  const rowKeys = useMemo(() => new Set<string>(groups.flatMap((g) => g.rows.map((r) => r.key))), [groups]);
  const keep = (r: TextRowDef) => r.key === pinned || (passesFilter(r, filter, text, issueKeys) && passesQuery(r, query, text));
  const unused = useMemo(() => unusedEntries({ shared: sharedEditable ? text.shared : null, layout: text.layout }), [sharedEditable, text]);
  // Lines that can't be changed are blocking issues with no row: they are listed under Unused.
  const blockedUnused = unused.filter((u) => u.rule === 'fixed');
  const issueCount = [...issueKeys].filter((k) => rowKeys.has(k)).length + blockedUnused.length;
  const listedUnused = filter === 'issues' ? blockedUnused : unused;
  const narrowed = query.trim() !== '' || filter !== 'all';
  const focusGroup = focus ? groups.find((g) => g.rows.some((r) => r.key === focus.key))?.id : undefined;

  useEffect(() => {
    if (!focus) return;
    // A filter or search that hides the requested row gives way, so the row can be found.
    const row = rowFor(focus.key);
    const ui = useTextUi.getState();
    if (row) {
      const s = useEditorStore.getState();
      const current = editorTextOf(s);
      const keys = new Set(textIssuesOf(s).map((i) => i.key));
      if (!passesFilter(row, ui.filter, current, keys)) ui.setFilter('all');
      if (!passesQuery(row, ui.query, current)) ui.setQuery('');
    }
    if (focusGroup) setExpanded((s) => (s.has(focusGroup) ? s : new Set(s).add(focusGroup)));
    let raf = 0;
    let tries = 0;
    // The group opens on the next render: look for the row for a few frames before giving up.
    const seek = () => {
      const el = root.current?.querySelector(`[data-text-key="${cssString(focus.key)}"]`);
      if (!el) { if (++tries < FOCUS_TRIES) raf = requestAnimationFrame(seek); return; }
      const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView?.({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
      el.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true });
    };
    raf = requestAnimationFrame(seek);
    return () => cancelAnimationFrame(raf);
  }, [focus, focusGroup]);

  const onFocus = (e: FocusEvent<HTMLElement>) => {
    const key = (e.target as HTMLElement).closest('[data-text-key]')?.getAttribute('data-text-key');
    if (key && key !== pinned) setPinned(key);
  };

  const shown = groups.map((g) => ({ g, rows: g.rows.filter(keep) })).filter((x) => x.rows.length > 0);
  // While narrowed every group is open: mount at most `limit` rows (plus the pinned/requested one).
  let budget = narrowed ? limit : Infinity;
  let hidden = 0;
  const visible = shown.map(({ g, rows }) => {
    const open = narrowed || expanded.has(g.id);
    if (!open) return { g, rows, open, mounted: [] as TextRowDef[] };
    const mounted = rows.filter((r) => {
      if (r.key === pinned || r.key === focus?.key) return true;
      if (budget > 0) { budget -= 1; return true; }
      hidden += 1;
      return false;
    });
    return { g, rows, open, mounted };
  }).filter((x) => !x.open || x.mounted.length > 0);

  return (
    <section ref={root} className={styles.root} data-sfb-text="" aria-labelledby={`${id}-title`} onFocus={onFocus}>
      <header className={styles.head}>
        <h2 id={`${id}-title`} className={styles.title}>Site text</h2>
        {onClose && (
          <button type="button" className={styles.iconButton} aria-label="Close text panel" onClick={onClose}>
            <CloseIcon />
          </button>
        )}
      </header>
      {!ready ? (
        <p className={styles.loading} role="status">Loading the shop’s wording…</p>
      ) : (
        <>
          <LanguageSection />
          <div className={styles.tools}>
            <input
              type="search"
              className={styles.search}
              aria-label="Search text"
              placeholder="Search text"
              value={query}
              onChange={(e) => useTextUi.getState().setQuery(e.target.value)}
            />
            <div className={styles.filters} role="group" aria-label="Show">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  title={f.id === 'layout' ? `Lines changed only on ${LAYOUT_LABELS[layout]}` : undefined}
                  onClick={() => useTextUi.getState().setFilter(f.id)}
                >
                  {f.label}
                  {f.id === 'issues' && issueCount > 0 && <span className={styles.filterCount}> {issueCount}</span>}
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 && <p className={styles.empty}>No lines match.</p>}
          {visible.map(({ g, open, mounted }) => {
            const count = g.rows.filter((r) => isEdited(r, text)).length;
            return (
              <div key={g.id} className={styles.group}>
                <button
                  type="button"
                  className={styles.groupToggle}
                  aria-expanded={open}
                  aria-controls={`${id}-${g.id}`}
                  disabled={narrowed}
                  onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })}
                >
                  <span className={styles.groupTitle}>{g.title}</span>
                  <span className={styles.groupCount}>{count > 0 ? `${count} edited` : `${g.rows.length}`}</span>
                </button>
                {open && <div id={`${id}-${g.id}`} className={styles.groupBody}>{mounted.map((r) => <TextRow key={r.key} row={r} />)}</div>}
              </div>
            );
          })}
          {hidden > 0 && (
            <button type="button" className={styles.more} onClick={() => setLimit((n) => n + ROW_PAGE)}>
              Show {Math.min(hidden, ROW_PAGE)} more of {hidden}
            </button>
          )}
          {listedUnused.length > 0 && (
            <div className={styles.group} data-unused="">
              <h3 className={styles.sectionTitle}>Unused</h3>
              <p className={styles.note}>Saved wording this version of the shop no longer shows. It doesn’t block publishing, except lines that can’t be changed.</p>
              <ul className={styles.unused}>
                {listedUnused.map((u) => (
                  <li key={`${u.scope}:${u.key}`}>
                    <code>{u.key}</code>
                    <span className={styles.unusedValue}>{summary(u.value)}</span>
                    <button
                      type="button"
                      className={styles.reset}
                      aria-label={`Delete ${u.key}`}
                      disabled={readOnly}
                      onClick={() => applyText(u.scope, u.key, null, loadEpoch)}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
