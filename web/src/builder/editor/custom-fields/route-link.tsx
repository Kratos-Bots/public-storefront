import { useEffect, useId, useMemo, useState } from 'react';
import type { CustomField } from '@puckeditor/core';
import { useEditorStore } from '@/builder/editor/store.ts';
import { customPageKeys } from '@/builder/editor/page-set.ts';
import {
  isEmittableLink, LINKABLE_ROUTES, linkModeOf, normalizeExternal, pagePath, type LinkMode,
} from '@/builder/editor/custom-fields/route-link-model.ts';
import { onRadioGroupKeyDown, radioTabIndex } from '@/builder/editor/custom-fields/roving.ts';
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

  // Undo/redo or another client can change the value under us: follow it. A cleared value keeps
  // the chosen mode but empties the Address box, so a later blur can't re-commit the old address.
  useEffect(() => {
    setError(null);
    if (current === '') { setDraft(''); return; }
    const next = linkModeOf(current);
    setMode(next);
    setDraft(next === 'url' ? current : '');
  }, [current]);

  // Every value leaves through here, so nothing the backend would refuse is ever stored.
  const emit = (v: string) => {
    if (!isEmittableLink(v)) { setError('That link can’t be used.'); return; }
    setError(null);
    if (v !== current) onChange(v);
  };

  const commitDraft = () => {
    if (draft.trim() === '') { setDraft(''); emit(''); return; }
    const v = normalizeExternal(draft);
    if (v === null) { setError(ADDRESS_ERROR); return; }
    setDraft(v);
    emit(v);
  };

  const routeKnown = LINKABLE_ROUTES.some((r) => r.path === current);
  const legacyRoute = mode === 'route' && current !== '' && !routeKnown && linkModeOf(current) === 'route';
  const pageKnown = pages.some((p) => p.path === current);
  const missingPage = mode === 'page' && !pageKnown && linkModeOf(current) === 'page';
  const errorId = `${uid}-error`;
  const controlId = `${uid}-control`;
  const modeIndex = MODES.findIndex((m) => m.mode === mode);
  const chooseMode = (m: LinkMode) => { setMode(m); setError(null); };

  return (
    <fieldset className={styles.field} id={id} disabled={readOnly}>
      <legend className={styles.label}>{label}</legend>
      <div
        className={styles.segmented}
        role="radiogroup"
        aria-label={`${label} type`}
        onKeyDown={(e) => onRadioGroupKeyDown(e, MODES.length, modeIndex, (i) => chooseMode(MODES[i]!.mode))}
      >
        {MODES.map((m, i) => (
          <button
            key={m.mode}
            type="button"
            role="radio"
            aria-checked={i === modeIndex}
            tabIndex={radioTabIndex(i, modeIndex)}
            onClick={() => chooseMode(m.mode)}
          >
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
        pages.length === 0 && !missingPage
          ? <p className={styles.hint}>No custom pages yet. Add one with New page, then link to it here.</p>
          : (
            <div className={styles.row}>
              <label className={styles.sub} htmlFor={controlId}>Custom page</label>
              <select id={controlId} value={pageKnown || missingPage ? current : ''} onChange={(e) => emit(e.target.value)}>
                <option value="" disabled>Choose a page…</option>
                {missingPage && <option value={current} disabled>{current} (missing page)</option>}
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

      {missingPage && <p className={styles.error}>This page no longer exists. Choose another page.</p>}
      {error && <p className={styles.error} id={errorId} role="alert">{error}</p>}
    </fieldset>
  );
}

export function routeLinkField(label: string): CustomField<string> {
  return { type: 'custom', label, render: (p) => <RouteLinkInput label={label} id={p.id} value={p.value} onChange={p.onChange} readOnly={p.readOnly} /> };
}
