import { useEffect, useRef } from 'react';
import { create } from 'zustand';

/** The one thing the shopper most likely wants to do next, shown as Telegram's
 *  MainButton inside the Mini App and as a fixed bar in a browser. */
export interface PrimaryAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}

interface PrimaryActionState {
  /** A page's own action (checkout's Continue / Place order); beats the cart default. */
  override: PrimaryAction | null;
  setOverride: (action: PrimaryAction | null) => void;
}

export const usePrimaryActionStore = create<PrimaryActionState>()((set) => ({
  override: null,
  setOverride: (override) => set({ override }),
}));

/**
 * Lets a page claim the primary action while it is mounted. The published
 * object only changes when what the button *shows* changes — label, disabled,
 * busy — and its onClick forwards to the latest handler through a ref, so a
 * page that re-renders on every keystroke doesn't make Telegram's MainButton
 * flicker through offClick/onClick on each one.
 */
export function usePrimaryAction(action: PrimaryAction | null): void {
  const handler = useRef<(() => void) | null>(null);
  handler.current = action?.onClick ?? null;

  const present = action !== null;
  const label = action?.label ?? '';
  const disabled = action?.disabled ?? false;
  const busy = action?.busy ?? false;

  useEffect(() => {
    const { setOverride } = usePrimaryActionStore.getState();
    if (!present) {
      setOverride(null);
      return;
    }
    setOverride({ label, disabled, busy, onClick: () => handler.current?.() });
    return () => setOverride(null);
  }, [present, label, disabled, busy]);
}
