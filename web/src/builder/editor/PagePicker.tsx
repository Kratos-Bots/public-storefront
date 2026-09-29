import { useMemo } from 'react';
import { useEditorStore } from '@/builder/editor/store.ts';
import { LAYOUT_LABELS, pageOptions } from '@/builder/editor/page-catalog.ts';
import type { DocKey } from '@/builder/types.ts';
import styles from '@/builder/editor/Editor.module.css';

/**
 * "Where am I": the layout being edited, then the page. No Puck hooks here — the read-only view
 * uses it outside <Puck>.
 */
export function PagePicker() {
  const docKey = useEditorStore((s) => s.docKey);
  const docs = useEditorStore((s) => s.docs);
  const layout = useEditorStore((s) => s.layout);
  const groups = useMemo(() => pageOptions(docs, layout), [docs, layout]);
  return (
    <div className={styles.where}>
      <span className={styles.badge} title="The layout these pages belong to">
        {LAYOUT_LABELS[layout]} layout
      </span>
      <label className={styles.pagePick}>
        <span className={styles.srOnly}>Page</span>
        <select aria-label="Page" value={docKey} onChange={(e) => useEditorStore.getState().selectDoc(e.target.value as DocKey)}>
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
