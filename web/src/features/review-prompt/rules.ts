// The review reminder: every decision that needs no React.
import { promptAllowedOn } from '@/features/unpaid-prompt/rules.ts';
import type { UnpaidState } from '@/features/unpaid-prompt/useUnpaidOrder.ts';
import type { ReviewableOrder } from '@/types/reviews.ts';

/** localStorage key; value `{ [customerId]: { [reference]: <ISO time last shown> } }`. */
export const STORAGE_KEY = 'sf-review-reminder-v1';
/** The same order is not raised again for this long after the reminder was shown. */
export const REMIND_EVERY_MS = 24 * 60 * 60 * 1000;

export type ReminderMap = Record<string, Record<string, string>>;

export interface FetchInputs {
  reviewsEnabled: boolean;
  /** Null for a guest. */
  customerId: number | null;
  path: string;
  builder: boolean;
  preview: boolean;
  /** The shop has refused this customer. */
  refused: boolean;
}

/**
 * Whether to ask the backend which orders could be reviewed. A guest has no account page to be sent to; a
 * switched-off shop, a blocked page, the builder and a refused customer never cost a request.
 */
export function shouldFetchReviewable(i: FetchInputs): boolean {
  return i.reviewsEnabled && i.customerId !== null && promptAllowedOn(i.path) && !i.builder && !i.preview && !i.refused;
}

export interface DecideInputs extends FetchInputs {
  cartOpen: boolean;
  loginOpen: boolean;
  /** The unpaid-order pop-up in this page load. Anything but `clear` keeps the reminder away. */
  unpaid: UnpaidState;
  /** `null`: not loaded yet, or the lookup failed. */
  reviewable: readonly ReviewableOrder[] | null;
  stored: ReminderMap;
  now: number;
  /** The reminder has already been put in front of the customer in this page load. */
  shownThisLoad: boolean;
}

function lastShown(stored: ReminderMap, customerId: number, reference: string): number | null {
  const raw = stored[String(customerId)]?.[reference];
  if (typeof raw !== 'string') return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
}

/** Due: never shown, or last shown at least 24 hours ago (a time in the future, from a wrong clock, counts as shown). */
export function isDue(stored: ReminderMap, customerId: number, reference: string, now: number): boolean {
  const t = lastShown(stored, customerId, reference);
  return t === null || now - t >= REMIND_EVERY_MS;
}

/** The order to remind about now, or null. The first one in the server's order that is due. */
export function decideReminder(i: DecideInputs): ReviewableOrder | null {
  if (!shouldFetchReviewable(i) || i.customerId === null) return null;
  if (i.cartOpen || i.loginOpen || i.shownThisLoad) return null;
  // The unpaid-order pop-up wins, and keeps the whole load once it has been in play.
  if (i.unpaid !== 'clear') return null;
  if (!i.reviewable) return null;
  const customerId = i.customerId;
  return (
    i.reviewable.find((o) => {
      // The server caps the window at remindUntil; a clock that has moved past it agrees.
      const until = Date.parse(o.remindUntil);
      if (!Number.isNaN(until) && i.now >= until) return false;
      // The order's own page already has the form.
      if (i.path === `/account/orders/${encodeURIComponent(o.reference)}`) return false;
      return isDue(i.stored, customerId, o.reference, i.now);
    }) ?? null
  );
}

/** The map after showing `reference` to `customerId` at `now`, with entries for orders no longer in the list dropped. */
export function recordShown(stored: ReminderMap, customerId: number, reference: string, listed: readonly string[], now: number): ReminderMap {
  const mine = stored[String(customerId)] ?? {};
  const kept: Record<string, string> = {};
  for (const [ref, at] of Object.entries(mine)) if (listed.includes(ref)) kept[ref] = at;
  kept[reference] = new Date(now).toISOString();
  return { ...stored, [String(customerId)]: kept };
}

/** Parses what storage held; anything unexpected is an empty map. */
export function parseStored(raw: string | null): ReminderMap {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    const out: ReminderMap = {};
    for (const [id, refs] of Object.entries(value)) {
      if (typeof refs !== 'object' || refs === null || Array.isArray(refs)) continue;
      const clean: Record<string, string> = {};
      for (const [ref, at] of Object.entries(refs)) if (typeof at === 'string') clean[ref] = at;
      out[id] = clean;
    }
    return out;
  } catch {
    return {};
  }
}
