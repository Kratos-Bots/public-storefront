import type { AutofillTrace } from '@/lib/autofill-advance.ts';

/**
 * The opt-in autofill diagnostic's switch and log. Kept apart from the panel so the checkout carries only this
 * small file; the panel itself is a lazy chunk that loads once the diagnostic is on.
 */
export const DIAG_KEY = 'sf-diag';
export const DIAG_VALUE = 'autofill';
export const DIAG_PARAM = 'sfdiag';
export const TAPS_NEEDED = 7;
export const TAP_WINDOW_MS = 3000;
/** The log is trimmed from the front past this; a long session must not grow without bound. */
const LOG_LIMIT = 400;

/** On when the URL asks for it (and then remembered for this tab) or when an earlier visit in this tab set it. */
export function readDiagFlag(): boolean {
  let requested = false;
  try {
    requested = new URLSearchParams(window.location.search).get(DIAG_PARAM) === DIAG_VALUE;
  } catch {
    // No location to read: only the stored flag can switch it on.
  }
  try {
    if (requested) window.sessionStorage.setItem(DIAG_KEY, DIAG_VALUE);
    return requested || window.sessionStorage.getItem(DIAG_KEY) === DIAG_VALUE;
  } catch {
    // Storage can throw (blocked, private mode); the URL request still counts for this page view.
    return requested;
  }
}

export function setDiagFlag(): void {
  try {
    window.sessionStorage.setItem(DIAG_KEY, DIAG_VALUE);
  } catch {
    // Without storage the diagnostic still runs, it just does not survive a reload.
  }
}

export function clearDiagFlag(): void {
  try {
    window.sessionStorage.removeItem(DIAG_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}

/** Calls `onTrigger` on the seventh tap inside three seconds; slower or fewer taps do nothing. */
export function createTapCounter(onTrigger: () => void, now: () => number = Date.now): () => void {
  let taps: number[] = [];
  return () => {
    const at = now();
    taps = taps.filter((t) => at - t <= TAP_WINDOW_MS);
    taps.push(at);
    if (taps.length >= TAPS_NEEDED) {
      taps = [];
      onTrigger();
    }
  };
}

export interface TraceLog {
  push: (entry: AutofillTrace) => void;
  /** A new array after every push, so it works as a store snapshot. */
  entries: () => readonly AutofillTrace[];
  subscribe: (listener: () => void) => () => void;
}

export function createTraceLog(): TraceLog {
  let list: readonly AutofillTrace[] = [];
  const listeners = new Set<() => void>();
  return {
    push(entry) {
      list = list.length >= LOG_LIMIT ? [...list.slice(list.length - LOG_LIMIT + 1), entry] : [...list, entry];
      listeners.forEach((fn) => fn());
    },
    entries: () => list,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
