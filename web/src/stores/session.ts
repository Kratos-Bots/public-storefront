import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SessionCustomer {
  id: number;
  nickname: string | null;
}

interface SessionState {
  token: string | null;
  customer: SessionCustomer | null;
  /** Path to return to after login (e.g. a checkout redirect). Not persisted — boot-scoped only. */
  returnTo: string | null;
  setSession: (token: string, customer: SessionCustomer) => void;
  setReturnTo: (path: string | null) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      token: null,
      customer: null,
      returnTo: null,
      setSession: (token, customer) => set({ token, customer }),
      setReturnTo: (returnTo) => set({ returnTo }),
      clear: () => set({ token: null, customer: null }),
    }),
    { name: 'sf-session-v1', partialize: (s) => ({ token: s.token, customer: s.customer }) },
  ),
);

export const selectIsLoggedIn = (s: SessionState): boolean => s.token !== null;
