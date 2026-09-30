import { create } from 'zustand';

/** Text panel UI state: never posted, never in undo history. */
export type TextFilter = 'all' | 'edited' | 'layout' | 'issues';

interface TextUiState {
  open: boolean;
  filter: TextFilter;
  query: string;
  /** A row to scroll to and focus; `seq` changes on every request, even for the same key. */
  focus: { key: string; seq: number } | null;
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
