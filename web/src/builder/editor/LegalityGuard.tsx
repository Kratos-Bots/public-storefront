import { createContext, useContext, useEffect, useSyncExternalStore, type MutableRefObject } from 'react';
import { useGetPuck } from '@/builder/editor/use-puck.ts';
import styles from '@/builder/editor/LegalityNotice.module.css';

/**
 * The canvas undoes an arrangement the page can't use (legality.ts) with Puck's own dispatch, but
 * it sits outside <Puck>: a bridge rendered inside (in the editor header) hands it `getPuck`.
 */
export type GetPuckFn = ReturnType<typeof useGetPuck>;
export const PuckHandleContext = createContext<MutableRefObject<GetPuckFn | null> | null>(null);

export function PuckHandleBridge() {
  const handle = useContext(PuckHandleContext);
  const getPuck = useGetPuck();
  useEffect(() => {
    if (!handle) return;
    handle.current = getPuck;
    return () => { if (handle.current === getPuck) handle.current = null; };
  }, [handle, getPuck]);
  return null;
}

// ── the notice ───────────────────────────────────────────────────────────────

let message = '';
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

/** Tell the owner why their drop was undone; it stays until they dismiss it or the next change is accepted. */
export function announceRevert(text: string): void {
  message = text;
  emit();
}
export function clearRevert(): void {
  if (message === '') return;
  message = '';
  emit();
}

/** The live region is always mounted (a region added with its text is not reliably announced). */
export function LegalityNotice() {
  const text = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => message, () => '');
  // Gone with the canvas: a notice about another page's drop must not follow the owner.
  useEffect(() => clearRevert, []);
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {text && (
        <p className={styles.notice} data-sf-builder-legality="">
          <span className={styles.text}>{text}</span>
          <button type="button" className={styles.dismiss} onClick={clearRevert}>Dismiss</button>
        </p>
      )}
    </div>
  );
}
