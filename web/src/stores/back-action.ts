import { useEffect, useRef } from 'react';
import { create } from 'zustand';

interface BackActionState {
  /** What a page wants Telegram's Back to do while it is mounted; beats "go back in history". */
  override: (() => void) | null;
  setOverride: (handler: (() => void) | null) => void;
}

export const useBackActionStore = create<BackActionState>()((set) => ({
  override: null,
  setOverride: (override) => set({ override }),
}));

/**
 * Lets a page claim what Back does while it is mounted (the checkout steps back through its own steps). The
 * published function is stable and forwards to the latest handler through a ref, so a page that re-renders on
 * every keystroke does not make Telegram's back controls re-register their handlers. Passing null releases the
 * claim. A page only ever releases its own claim, so one unmounting after another has claimed leaves it alone.
 */
export function useBackAction(handler: (() => void) | null): void {
  const latest = useRef<(() => void) | null>(null);
  latest.current = handler;

  const present = handler !== null;

  useEffect(() => {
    if (!present) return;
    const published = () => latest.current?.();
    useBackActionStore.getState().setOverride(published);
    return () => {
      const store = useBackActionStore.getState();
      if (store.override === published) store.setOverride(null);
    };
  }, [present]);
}
