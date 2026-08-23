import { create } from 'zustand';

export const closedGate = create<{ closed: boolean; setClosed: (v: boolean) => void }>((set) => ({
  closed: false,
  setClosed: (closed) => set({ closed }),
}));
