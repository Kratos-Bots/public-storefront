import { create } from 'zustand';
import type { PreviewAs } from '@/builder/mode.ts';
import { isDocKey, type ViewportWidth } from '@/builder/editor/protocol.ts';
import { docsFromPageSet, isCustomKey, isShownIn, newCustomPage, normalizeDoc, withDoc, withoutDoc, type DocMap } from '@/builder/editor/page-set.ts';
import type { DocKey, LayoutKind, PageSet } from '@/builder/types.ts';

export const DEFAULT_PREVIEW_AS: PreviewAs = { session: 'signed-in-orders', cart: 'items' };

/**
 * Editor state. Load identity (spec A6) is the bridge's job, not the store's: the bridge adopts
 * each load's loadId and drops any pending debounced change before calling its onLoad handler,
 * which calls `load()` here; session.ts (Task 10) then posts exactly one change built from the
 * freshly loaded `docs` (none when read-only).
 */
export interface EditorState {
  status: 'waiting' | 'ready';
  layout: LayoutKind;
  readOnly: boolean;
  /** The sparse set being edited: always `shell`, plus every touched page. */
  docs: DocMap;
  docKey: DocKey;
  /** Bumped whenever the canvas must remount from the store (load, reset, new page). */
  epoch: number;
  previewAs: PreviewAs;
  /** The frame width the admin should give us; null = fill. Survives reloads of the set. */
  viewport: ViewportWidth | null;
  load(input: { layout: LayoutKind; pageSet: PageSet | null; readOnly: boolean }): void;
  selectDoc(docKey: DocKey): void;
  /**
   * Puck's onChange for the selected doc. Ignored unless `docKey` is the selected page, and ignored
   * when `epoch` is given and is not the current one (a late onChange from a canvas mounted before a
   * load/reset/new page). It never creates a custom page — only `createPage` does.
   */
  updateDoc(docKey: DocKey, raw: unknown, epoch?: number): void;
  resetDoc(docKey: DocKey): void;
  createPage(slug: string, title: string): string | null;
  setPreviewAs(patch: Partial<PreviewAs>): void;
  setViewport(width: ViewportWidth | null): void;
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  status: 'waiting',
  layout: 'storefront',
  readOnly: false,
  docs: {},
  docKey: 'catalog',
  epoch: 0,
  previewAs: DEFAULT_PREVIEW_AS,
  viewport: null,

  load({ layout, pageSet, readOnly }) {
    const docs = docsFromPageSet(pageSet, layout);
    const current = get().docKey;
    const keep = !(isCustomKey(current) && !docs[current]) && isShownIn(current, layout);
    set((s) => ({ status: 'ready', layout, readOnly, docs, docKey: keep ? current : 'catalog', epoch: s.epoch + 1 }));
  },

  selectDoc(docKey) {
    if (typeof docKey !== 'string' || !isDocKey(docKey)) return;
    const s = get();
    if (isCustomKey(docKey) && !s.docs[docKey]) return;
    if (!isShownIn(docKey, s.layout)) return;
    if (docKey !== s.docKey) set({ docKey });
  },

  updateDoc(docKey, raw, epoch) {
    const s = get();
    if (s.readOnly || s.status !== 'ready') return;
    if (docKey !== s.docKey || (epoch !== undefined && epoch !== s.epoch)) return;
    if (!isShownIn(docKey, s.layout)) return;
    if (isCustomKey(docKey) && !s.docs[docKey]) return;
    const docs = withDoc(s.docs, docKey, normalizeDoc(raw, docKey), s.layout);
    if (docs !== s.docs) set({ docs });
  },

  resetDoc(docKey) {
    const s = get();
    if (s.readOnly || s.status !== 'ready') return;
    set({
      docs: withoutDoc(s.docs, docKey, s.layout),
      docKey: isCustomKey(docKey) && docKey === s.docKey ? 'catalog' : s.docKey,
      epoch: s.epoch + 1,
    });
  },

  createPage(slug, title) {
    const s = get();
    if (s.readOnly) return 'This version is read-only.';
    if (s.status !== 'ready') return 'The editor is still loading.';
    const result = newCustomPage(s.docs, slug, title);
    if ('error' in result) return result.error;
    set({ docs: result.docs, docKey: result.docKey, epoch: s.epoch + 1 });
    return null;
  },

  setPreviewAs(patch) {
    set((s) => ({ previewAs: { ...s.previewAs, ...patch } }));
  },

  setViewport(viewport) {
    if (viewport !== get().viewport) set({ viewport });
  },
}));
