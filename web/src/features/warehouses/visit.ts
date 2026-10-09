import { useSyncExternalStore } from 'react';

/**
 * "The shopper chose a warehouse during this visit" (STOREFRONT.md §3.8b, the pick-first prompt).
 * Session-scoped on purpose: a new tab or a returning visit asks again. Deliberately separate from
 * `sf-warehouse-v1` (the remembered warehouse), whose shape and "no choice writes nothing" rule stay
 * as they are. When sessionStorage is unavailable the answer lives in memory for the page's life, so
 * the shopper is asked once per load instead of on every navigation.
 */
const KEY = 'sf-warehouse-visit-v1';
let memory = false;
const listeners = new Set<() => void>();

export function hasChosenThisVisit(): boolean {
  if (memory) return true;
  try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function markChosenThisVisit(): void {
  memory = true;
  try { sessionStorage.setItem(KEY, '1'); } catch { /* memory holds it for this page */ }
  for (const notify of listeners) notify();
}

/** Test seam: forget the in-memory answer (sessionStorage is cleared by the test itself). */
export function resetVisitMarker(): void {
  memory = false;
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
}

export function useChosenThisVisit(): boolean {
  return useSyncExternalStore(subscribe, hasChosenThisVisit, () => false);
}
