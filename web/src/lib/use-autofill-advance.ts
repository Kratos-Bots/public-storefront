import { useEffect, useRef, type RefObject } from 'react';
import { watchAutofill, type AutofillTrace } from '@/lib/autofill-advance.ts';

/**
 * Moves focus on after the system fills a field inside `ref`'s element. The element may mount late or be
 * swapped (the checkout's empty states render first), so it is re-checked after every render.
 * `onTrace` is the opt-in diagnostic's feed; switching it on or off re-attaches the watcher.
 */
export function useAutofillAdvance(ref: RefObject<HTMLElement | null>, onTrace?: (entry: AutofillTrace) => void): void {
  const watched = useRef<{ el: HTMLElement; traced: boolean; stop: () => void } | null>(null);
  useEffect(() => {
    const el = ref.current;
    const traced = !!onTrace;
    if (watched.current?.el === el && watched.current.traced === traced) return;
    watched.current?.stop();
    watched.current = el ? { el, traced, stop: watchAutofill(el, { onTrace }) } : null;
  });
  // Strict Mode runs this cleanup and then the effect again on the same element: forget it so it is re-watched.
  useEffect(() => () => {
    watched.current?.stop();
    watched.current = null;
  }, []);
}
