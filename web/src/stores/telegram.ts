import { create } from 'zustand';

/**
 * Where the automatic Telegram sign-in stands. `none` = not inside Telegram (the
 * normal sign-in page applies); `pending` = the initData is being exchanged and
 * the app holds its skeleton; `ready` / `failed` = done. Deliberately not
 * persisted: it is re-established on every launch.
 */
export type TelegramAuthStatus = 'none' | 'pending' | 'ready' | 'failed';

interface TelegramAuthState {
  status: TelegramAuthStatus;
  error: string | null;
  setStatus: (status: TelegramAuthStatus, error?: string | null) => void;
}

export const useTelegramAuthStore = create<TelegramAuthState>()((set) => ({
  status: 'none',
  error: null,
  setStatus: (status, error = null) => set({ status, error }),
}));
