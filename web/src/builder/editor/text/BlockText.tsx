import { useId, useMemo, useState, type ReactNode } from 'react';
import type { UiState } from '@puckeditor/core';
import { useTemplateContext } from '@/templates/runtime.tsx';
import { usePuck } from '@/builder/editor/use-puck.ts';
import { blockTextRows, rowMatches, type TextRowDef } from '@/builder/editor/text/catalog.ts';
import { useTextUi } from '@/builder/editor/text/ui-store.ts';
import { useTextReadiness } from '@/builder/editor/text/hooks.ts';
import { WarnIcon } from '@/builder/editor/icons.tsx';
import { ContainerPanel } from '@/builder/editor/ContainerPanel.tsx';
import { TEXT_LOADING, TEXT_UNREADABLE, TextRow } from '@/builder/editor/text/TextRow.tsx';
import styles from '@/builder/editor/text/Text.module.css';
import placement from '@/builder/editor/text/TextPlacement.module.css';

/** Above this many lines the block's section gets its own search and a way into the full panel. */
export const BLOCK_TEXT_SEARCH_OVER = 20;

/** Puck does not export ItemSelector; this is the same type. */
type ItemSelector = NonNullable<UiState['itemSelector']>;

/** Puck `overrides.fields`: the block's own fields, its parts / card links (product-parts §11), then the text it shows (spec §7.3). */
export function FieldsWithText({ children }: { children: ReactNode; isLoading: boolean; itemSelector?: ItemSelector | null }) {
  const type = usePuck((s) => s.selectedItem?.type ?? null);
  const templateId = useTemplateContext().resolved?.templateId ?? 'modern';
  const rows = useMemo(() => (type ? blockTextRows(type, templateId) : []), [type, templateId]);
  return (
    <>
      {children}
      <ContainerPanel />
      {rows.length > 0 && <BlockTextSection key={type} rows={rows} />}
    </>
  );
}

/** Exported for tests. Like the Text panel, rows wait until the store language is known. */
export function BlockTextSection({ rows }: { rows: readonly TextRowDef[] }) {
  const id = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const readiness = useTextReadiness();
  const [query, setQuery] = useState('');
  const many = rows.length > BLOCK_TEXT_SEARCH_OVER;
  const shown = many ? rows.filter((r) => rowMatches(r, query)) : rows;
  return (
    <section className={`${styles.root} ${placement.blockText}`} data-sfb-text="" data-sfb-block-text="" aria-labelledby={`${id}-t`}>
      <h3 id={`${id}-t`} className={placement.blockTitle}>Text in this block</h3>
      {readiness === 'loading' && <p className={styles.loading} role="status">{TEXT_LOADING}</p>}
      {readiness === 'failed' && <p className={styles.unavailable} role="status"><WarnIcon />{TEXT_UNREADABLE}</p>}
      {readiness === 'ready' && many && (
        <div className={`${styles.tools} ${placement.blockTools}`} data-sfb-block-tools="">
          <input
            type="search"
            className={styles.search}
            aria-label="Search this block’s text"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className={styles.reset} onClick={() => useTextUi.getState().show({ query })}>Open in Text panel</button>
        </div>
      )}
      {readiness === 'ready' && many && shown.length === 0 && <p className={styles.empty}>No lines match.</p>}
      {readiness === 'ready' && shown.map((r) => <TextRow key={r.key} row={r} compact />)}
    </section>
  );
}
