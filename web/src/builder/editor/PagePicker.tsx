import { useEffect, useMemo, useRef } from 'react';
import { useEditorStore } from '@/builder/editor/store.ts';
import { LAYOUT_LABELS, pageOptions } from '@/builder/editor/page-catalog.ts';
import type { DocKey } from '@/builder/types.ts';
import styles from '@/builder/editor/Editor.module.css';

/**
 * Creating, resetting or deleting a page remounts the whole canvas, header included, so the
 * control that was used is gone. Call this first and the Page picker takes focus once it is back.
 */
let focusOnMount = false;
export function focusPagePickerSoon(): void {
  focusOnMount = true;
}

/**
 * "Where am I": the layout being edited, then the page. No Puck hooks here — the read-only view
 * uses it outside <Puck>.
 */
export function PagePicker() {
  const docKey = useEditorStore((s) => s.docKey);
  const epoch = useEditorStore((s) => s.epoch);
  const docs = useEditorStore((s) => s.docs);
  const layout = useEditorStore((s) => s.layout);
  const groups = useMemo(() => pageOptions(docs, layout), [docs, layout]);
  const select = useRef<HTMLSelectElement>(null);

  // After a tick, and only from a picker that is still mounted: Puck may mount its header more
  // than once while it settles, and the first copy must not use up the request.
  useEffect(() => {
    if (!focusOnMount) return;
    const t = setTimeout(() => {
      if (!focusOnMount || !select.current?.isConnected) return;
      focusOnMount = false;
      select.current.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [docKey, epoch]);

  return (
    <div className={styles.where}>
      <span className={styles.badge} title="The layout these pages belong to">
        {LAYOUT_LABELS[layout]} layout
      </span>
      <label className={styles.pagePick}>
        <span className={styles.srOnly}>Page</span>
        <select
          ref={select}
          aria-label="Page"
          value={docKey}
          onChange={(e) => {
            const next = e.target.value as DocKey;
            if (next !== useEditorStore.getState().docKey) useEditorStore.getState().selectDoc(next);
          }}
        >
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => <option key={o.docKey} value={o.docKey}>{o.label}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
    </div>
  );
}
