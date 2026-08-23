import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SessionCustomer {
  id: number;
  nickname: string | null;
}

interface SessionState {
  token: string | null;
  customer: SessionCustomer | null;
  setSession: (token: string, customer: SessionCustomer) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      token: null,
      customer: null,
      setSession: (token, customer) => set({ token, customer }),
      clear: () => set({ token: null, customer: null }),
    }),
    { name: 'sf-session-v1' },
  ),
);
