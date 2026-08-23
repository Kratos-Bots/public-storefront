import { create } from 'zustand';

export type UiPanel = 'cartOpen' | 'filterOpen' | 'loginOpen';

interface UiState {
  cartOpen: boolean;
  filterOpen: boolean;
  loginOpen: boolean;
  open: (name: UiPanel) => void;
  close: (name: UiPanel) => void;
  toggle: (name: UiPanel) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  cartOpen: false,
  filterOpen: false,
  loginOpen: false,
  open: (name) => set({ [name]: true } as Pick<UiState, UiPanel>),
  close: (name) => set({ [name]: false } as Pick<UiState, UiPanel>),
  toggle: (name) => set((s) => ({ [name]: !s[name] }) as Pick<UiState, UiPanel>),
}));
