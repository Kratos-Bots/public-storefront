import { useEffect, useState } from 'react';

/** How often the order's payment view is re-read while a partner payment is being created. */
export const PARTNER_POLL_MS = 5_000;
/** After this long the page stops asking and tells the shopper where the details will appear. */
export const PARTNER_WINDOW_MS = 120_000;

/**
 * When each order's wait began. One clock for the poll (which decides when to stop asking) and for the panel
 * (which decides what to say), so the two cannot disagree about whether the window is spent.
 */
const started = new Map<string, number>();

/** Milliseconds this order has been waiting on a partner payment, starting the clock on first sight; null when it is not waiting. */
/** Waits older than this are forgotten when another is written, so the map stays small. */
const FORGET_AFTER_MS = 10 * 60_000;

export function trackPartnerWait(reference: string, pending: boolean, now: number = Date.now()): number | null {
  if (!pending) {
    started.delete(reference);
    return null;
  }
  if (!started.has(reference)) {
    for (const [ref, at] of started) if (now - at > FORGET_AFTER_MS) started.delete(ref);
    started.set(reference, now);
  }
  return now - started.get(reference)!;
}

/** The running wait without starting it. */
export function partnerElapsed(reference: string, now: number = Date.now()): number | null {
  const at = started.get(reference);
  return at === undefined ? null : now - at;
}

export type PartnerPendingPhase = 'waiting' | 'timedOut';

/** The panel's phase: waiting until the window is spent, then timed out until the payment appears (or the panel goes). */
export function usePartnerPendingPhase(reference: string, pending: boolean): PartnerPendingPhase {
  const [timedOut, setTimedOut] = useState(false);
  // The payment appeared (or the order moved on): the next wait starts afresh. Leaving the page does not end it.
  useEffect(() => {
    if (!pending) trackPartnerWait(reference, false);
  }, [reference, pending]);
  useEffect(() => {
    if (!pending) {
      setTimedOut(false);
      return;
    }
    const elapsed = trackPartnerWait(reference, true) ?? 0;
    const left = PARTNER_WINDOW_MS - elapsed;
    let id: ReturnType<typeof setTimeout> | undefined;
    if (left <= 0) setTimedOut(true);
    else {
      setTimedOut(false);
      id = setTimeout(() => setTimedOut(true), left);
    }
    return () => {
      if (id !== undefined) clearTimeout(id);
    };
  }, [reference, pending]);
  return pending && timedOut ? 'timedOut' : 'waiting';
}
