// web/src/builder/editor/text/TextPanel.tsx
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTemplateContext } from '@/templates/runtime.tsx';
import { useEditorStore } from '@/builder/editor/store.ts';
import { applyText, useEditorText, useLoadEpoch, useTextIssues, useTextReady } from '@/builder/editor/text/hooks.ts';
import { useTextUi, type TextFilter } from '@/builder/editor/text/ui-store.ts';
import { rowMatches, textGroups, type TextRowDef } from '@/builder/editor/text/catalog.ts';
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

  const issueKeys = useMemo(() => new Set(issues.map((i) => i.key)), [issues]);
  const edited = (r: TextRowDef) => text.shared[r.key] !== undefined || text.layout[r.key] !== undefined;
  const keep = (r: TextRowDef) => {
    if (filter === 'edited' && !edited(r)) return false;
    if (filter === 'layout' && text.layout[r.key] === undefined) return false;
    if (filter === 'issues' && !issueKeys.has(r.key)) return false;
    return rowMatches(r, query, [...valueStrings(text.shared[r.key]), ...valueStrings(text.layout[r.key])]);
  };
  const unused = useMemo(() => unusedEntries({ shared: sharedEditable ? text.shared : null, layout: text.layout }), [sharedEditable, text]);
  const narrowed = query.trim() !== '' || filter !== 'all';
  const focusGroup = focus ? groups.find((g) => g.rows.some((r) => r.key === focus.key))?.id : undefined;

  useEffect(() => {
    if (!focus) return;
    if (focusGroup) setExpanded((s) => (s.has(focusGroup) ? s : new Set(s).add(focusGroup)));
    let raf = 0;
    let tries = 0;
    // The group opens on the next render: look for the row for a few frames before giving up.
    const seek = () => {
      const row = root.current?.querySelector(`[data-text-key="${cssString(focus.key)}"]`);
      if (!row) { if (++tries < FOCUS_TRIES) raf = requestAnimationFrame(seek); return; }
      const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      row.scrollIntoView?.({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
      row.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true });
    };
    raf = requestAnimationFrame(seek);
    return () => cancelAnimationFrame(raf);
  }, [focus, focusGroup]);

  const shown = groups.map((g) => ({ g, rows: g.rows.filter(keep) })).filter((x) => x.rows.length > 0);
  const deletable = !readOnly;

  return (
    <section ref={root} className={styles.root} data-sfb-text="" aria-labelledby={`${id}-title`}>
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
                  {f.id === 'issues' && issues.length > 0 && <span className={styles.filterCount}> {issues.length}</span>}
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 && <p className={styles.empty}>No lines match.</p>}
          {shown.map(({ g, rows }) => {
            const open = narrowed || expanded.has(g.id);
            const count = g.rows.filter(edited).length;
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
                {open && <div id={`${id}-${g.id}`} className={styles.groupBody}>{rows.map((r) => <TextRow key={r.key} row={r} />)}</div>}
              </div>
            );
          })}
          {unused.length > 0 && (
            <div className={styles.group} data-unused="">
              <h3 className={styles.sectionTitle}>Unused</h3>
              <p className={styles.note}>Saved wording this version of the shop no longer shows. It doesn’t block publishing, except lines that can’t be changed.</p>
              <ul className={styles.unused}>
                {unused.map((u) => (
                  <li key={`${u.scope}:${u.key}`}>
                    <code>{u.key}</code>
                    <span className={styles.unusedValue}>{summary(u.value)}</span>
                    <button
                      type="button"
                      className={styles.reset}
                      aria-label={`Delete ${u.key}`}
                      disabled={!deletable}
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
