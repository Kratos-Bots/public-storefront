import { useEffect, useRef } from 'react';

/**
 * Sign-in steps replace each other, so the control that was clicked unmounts and focus would fall to the page.
 * Attach the returned ref to a step's root: on mount, focus the first element inside it matching `selector`
 * (the first field, or a heading with `tabIndex={-1}` when the step has none).
 */
export function useStepFocus<T extends HTMLElement = HTMLDivElement>(selector: string) {
  const root = useRef<T>(null);
  useEffect(() => {
    root.current?.querySelector<HTMLElement>(selector)?.focus();
  }, [selector]);
  return root;
}
