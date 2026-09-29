import { useEffect, useId, useMemo, useState } from 'react';
import type { CustomField } from '@puckeditor/core';
import { useEditorStore } from '@/builder/editor/store.ts';
import { customPageKeys } from '@/builder/editor/page-set.ts';
import {
  isEmittableLink, LINKABLE_ROUTES, linkModeOf, normalizeExternal, pagePath, type LinkMode,
} from '@/builder/editor/custom-fields/route-link-model.ts';
import styles from '@/builder/editor/custom-fields/fields.module.css';

const MODES: Array<{ mode: LinkMode; label: string }> = [
  { mode: 'route', label: 'Shop page' },
  { mode: 'page', label: 'Custom page' },
  { mode: 'url', label: 'Web address' },
];

const ADDRESS_ERROR = 'Use a full https: address, or a mailto: or tel: link.';

interface InputProps { label: string; id: string; value: string; onChange: (v: string) => void; readOnly?: boolean }

function RouteLinkInput({ label, id, value, onChange, readOnly }: InputProps) {
  const current = typeof value === 'string' ? value : '';
  const [mode, setMode] = useState<LinkMode>(() => linkModeOf(current));
  const [draft, setDraft] = useState(() => (linkModeOf(current) === 'url' ? current : ''));
  const [error, setError] = useState<string | null>(null);
  const uid = useId();
  const docs = useEditorStore((s) => s.docs);
  const pages = useMemo(
    () => customPageKeys(docs).sort().map((k) => ({ path: pagePath(k.slice(5)), title: docs[k]?.root.props.title || k.slice(5) })),
    [docs],
  );

  // Undo/redo or another client can change the value under us: follow it to its mode.
  useEffect(() => {
    if (current === '') return;
    const next = linkModeOf(current);
    setMode(next);
    if (next === 'url') setDraft(current);
    setError(null);
  }, [current]);

  // Every value leaves through here, so nothing the backend would refuse is ever stored.
  const emit = (v: string) => {
    if (!isEmittableLink(v)) { setError('That link can’t be used.'); return; }
    setError(null);
    if (v !== current) onChange(v);
  };

  const commitDraft = () => {
    if (draft.trim() === '') { setError(null); return; }
    const v = normalizeExternal(draft);
    if (v === null) { setError(ADDRESS_ERROR); return; }
    setDraft(v);
    emit(v);
  };

  const routeKnown = LINKABLE_ROUTES.some((r) => r.path === current);
  const legacyRoute = mode === 'route' && current !== '' && !routeKnown && linkModeOf(current) === 'route';
  const errorId = `${uid}-error`;
  const controlId = `${uid}-control`;

  return (
    <fieldset className={styles.field} id={id} disabled={readOnly}>
      <legend className={styles.label}>{label}</legend>
      <div className={styles.segmented} role="group" aria-label={`${label} type`}>
        {MODES.map((m) => (
          <button key={m.mode} type="button" aria-pressed={mode === m.mode} onClick={() => { setMode(m.mode); setError(null); }}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'route' && (
        <div className={styles.row}>
          <label className={styles.sub} htmlFor={controlId}>Page</label>
          <select id={controlId} value={routeKnown || legacyRoute ? current : ''} onChange={(e) => emit(e.target.value)}>
            <option value="">No link</option>
            {legacyRoute && <option value={current} disabled={!isEmittableLink(current)}>{current}</option>}
            {LINKABLE_ROUTES.map((r) => <option key={r.path} value={r.path}>{r.label}</option>)}
          </select>
        </div>
      )}

      {mode === 'page' && (
        pages.length === 0
          ? <p className={styles.hint}>No custom pages yet. Add one with New page, then link to it here.</p>
          : (
            <div className={styles.row}>
              <label className={styles.sub} htmlFor={controlId}>Custom page</label>
              <select id={controlId} value={pages.some((p) => p.path === current) ? current : ''} onChange={(e) => emit(e.target.value)}>
                <option value="" disabled>Choose a page…</option>
                {pages.map((p) => <option key={p.path} value={p.path}>{p.title} ({p.path})</option>)}
              </select>
            </div>
          )
      )}

      {mode === 'url' && (
        <div className={styles.row}>
          <label className={styles.sub} htmlFor={controlId}>Address</label>
          <input
            id={controlId}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://"
            value={draft}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitDraft(); }
            }}
          />
        </div>
      )}

      {error && <p className={styles.error} id={errorId} role="alert">{error}</p>}
    </fieldset>
  );
}

export function routeLinkField(label: string): CustomField<string> {
  return { type: 'custom', label, render: (p) => <RouteLinkInput label={label} id={p.id} value={p.value} onChange={p.onChange} readOnly={p.readOnly} /> };
}
