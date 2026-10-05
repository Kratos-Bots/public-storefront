import { useEffect, useRef, type RefObject } from 'react';
import { watchAutofill } from '@/lib/autofill-advance.ts';

/**
 * Moves focus on after the system fills a field inside `ref`'s element. The element may mount late or be
 * swapped (the checkout's empty states render first), so it is re-checked after every render.
 */
export function useAutofillAdvance(ref: RefObject<HTMLElement | null>): void {
  const watched = useRef<{ el: HTMLElement; stop: () => void } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (watched.current?.el === el) return;
    watched.current?.stop();
    watched.current = el ? { el, stop: watchAutofill(el) } : null;
  });
  // Strict Mode runs this cleanup and then the effect again on the same element: forget it so it is re-watched.
  useEffect(() => () => {
    watched.current?.stop();
    watched.current = null;
  }, []);
}
