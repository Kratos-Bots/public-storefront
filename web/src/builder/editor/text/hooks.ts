import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPublished } from '@/api/pages.ts';
import type { EditorText, TextLanguage, TextValue } from '@/text/types.ts';
import { editorTextOf, isTextReady, textIssuesOf, textLanguage, useEditorStore } from '@/builder/editor/store.ts';
import { DEFAULT_LANGUAGE, type DraftValue, type TextIssue, type TextScope } from '@/builder/editor/text/model.ts';
import { resolveCell, type ResolvedCell } from '@/builder/editor/text/issues.ts';
import { currentAnchor } from '@/builder/editor/text/history.ts';

export function useTextLanguage(): TextLanguage {
  const sharedEditable = useEditorStore((s) => s.sharedEditable);
  const siteText = useEditorStore((s) => s.siteText);
  const published = useEditorStore((s) => s.published);
  return useMemo(() => textLanguage({ sharedEditable, siteText, published }), [sharedEditable, siteText, published]);
}

/**
 * What the canvas resolves text from (PageSetOverrideProvider `text`, spec §7.2). The store's
 * memoised `editorTextOf`: the same object until the language or an active-locale layer changes,
 * so text consumers do not re-render on unrelated store updates.
 */
export function useEditorText(): EditorText {
  return useEditorStore(editorTextOf);
}

/** The current load, to capture when an edit (a focused input, a picker) starts. */
export const useLoadEpoch = (): number => useEditorStore((s) => s.loadEpoch);

/**
 * An admin that sends no siteText (spec §7.1 "absent") still shows shared wording, read-only: the
 * public read the shop itself uses (fixture mode lets it through). Keyed on the load, so every load
 * reads afresh, and a read that started under an earlier load is dropped by the store.
 */
export function usePublishedTextSync(): void {
  const layout = useEditorStore((s) => s.layout);
  const loadEpoch = useEditorStore((s) => s.loadEpoch);
  const enabled = useEditorStore((s) => s.status === 'ready' && !s.sharedEditable);
  const missing = useEditorStore((s) => s.published === null);
  const query = useQuery({
    queryKey: ['sf-builder', 'published-text', layout, loadEpoch],
    queryFn: () => fetchPublished(layout),
    enabled: enabled && missing,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  useEffect(() => {
    if (enabled && missing && query.isError) markPublishedReadFailed(loadEpoch);
  }, [enabled, missing, query.isError, loadEpoch]);
  useEffect(() => {
    if (!enabled || !missing || !query.isSuccess) return;
    const t = query.data.text;
    useEditorStore.getState().setPublishedText(
      t ? { language: { locale: t.locale, formatLocale: t.formatLocale }, shared: t.shared } : { language: DEFAULT_LANGUAGE, shared: {} },
      loadEpoch,
    );
  }, [enabled, missing, query.isSuccess, query.data, loadEpoch]);
}

export function useTextIssues(): TextIssue[] {
  // textIssuesOf is memoised in the store on its inputs: a stable array between text changes.
  return useEditorStore(textIssuesOf);
}

export const useTextReady = (): boolean => useEditorStore(isTextReady);

/** The published read failed under this load: text stays uneditable for it (never guessed as 'en'). */
export function markPublishedReadFailed(loadEpoch: number): void {
  useEditorStore.getState().setPublishedFailed(loadEpoch);
}

export type TextReadiness = 'ready' | 'loading' | 'failed';
/**
 * Text can be edited once the language is known (`useTextReady`). Until then it is loading — or,
 * when the published read failed under this load, failed: the UI says so instead of editing the
 * default language, which may not be the shop's.
 */
export function useTextReadiness(): TextReadiness {
  const ready = useTextReady();
  const failed = useEditorStore((s) => s.publishedFailed);
  return ready ? 'ready' : failed ? 'failed' : 'loading';
}

export interface TextCell {
  /**
   * The editable draft value, or the published value when shared text is read-only. A draft layer
   * may hold a half-typed plural (no `other` yet), so these are DraftValues, not TextValues.
   */
  shared: DraftValue | undefined;
  layout: DraftValue | undefined;
  sharedEditable: boolean;
  effective: ResolvedCell;
  /** What shows when this layout's override is cleared. */
  below: ResolvedCell;
  issues: TextIssue[];
}

export function useTextCell(key: string): TextCell {
  const text = useEditorText();
  const sharedEditable = useEditorStore((s) => s.sharedEditable);
  const issues = useTextIssues();
  // EditorText types its layers as TextValue, but the store's drafts may hold a DraftValue.
  const shared: DraftValue | undefined = Object.hasOwn(text.shared, key) ? text.shared[key] : undefined;
  const layout: DraftValue | undefined = Object.hasOwn(text.layout, key) ? text.layout[key] : undefined;
  return useMemo(() => ({
    shared, layout, sharedEditable,
    // resolveCell only returns a layer that passes ruleFor (a usable `other`), i.e. a real TextValue.
    effective: resolveCell(key, { layout: layout as TextValue | undefined, shared: shared as TextValue | undefined }),
    below: resolveCell(key, { shared: shared as TextValue | undefined }),
    issues: issues.filter((i) => i.key === key),
  }), [key, shared, layout, sharedEditable, issues]);
}

/**
 * Every text write from the UI goes through here, stamped with Puck's current history entry.
 * `loadEpoch` = the store's `loadEpoch` captured when the edit started (focus, open): a commit
 * landing after another load (a blur during a layout switch) is refused.
 */
export function applyText(scope: TextScope, key: string, value: DraftValue | null, loadEpoch?: number): boolean {
  return useEditorStore.getState().setText(scope, key, value, currentAnchor(), loadEpoch);
}

export function applyLanguage(patch: Partial<TextLanguage>, loadEpoch?: number): boolean {
  return useEditorStore.getState().setLanguage(patch, currentAnchor(), loadEpoch);
}
