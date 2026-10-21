import { create } from 'zustand';

/** Text panel UI state: never posted, never in undo history. */
export type TextFilter = 'all' | 'edited' | 'layout' | 'issues';

interface TextUiState {
  open: boolean;
  filter: TextFilter;
  query: string;
  /** A row to scroll to and focus; `seq` changes on every request, even for the same key. */
  focus: { key: string; seq: number } | null;
  /**
   * The language the panel edits and the canvas previews; null = the store language. Only honoured
   * while it is one of `[locale, ...offered]` (see `editingLocaleOf`); `useEditingLocale` clears it
   * when it leaves the list.
   */
  editLocale: string | null;
  setEditLocale(locale: string | null): void;
  show(opts?: { key?: string; filter?: TextFilter; query?: string }): void;
  hide(): void;
  setFilter(filter: TextFilter): void;
  setQuery(query: string): void;
}

let seq = 0;
export const useTextUi = create<TextUiState>()((set) => ({
  open: false,
  filter: 'all',
  query: '',
  focus: null,
  editLocale: null,
  setEditLocale(editLocale) { set({ editLocale }); },
  show(opts = {}) {
    set((s) => ({
      open: true,
      filter: opts.filter ?? s.filter,
      query: opts.query ?? (opts.key ? '' : s.query),
      focus: opts.key ? { key: opts.key, seq: ++seq } : s.focus,
    }));
  },
  hide() { set({ open: false }); },
  setFilter(filter) { set({ filter }); },
  setQuery(query) { set({ query }); },
}));
