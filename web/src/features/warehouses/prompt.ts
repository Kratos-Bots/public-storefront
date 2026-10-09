import type { Warehouse } from '@/types/warehouses.ts';

/** Catalogue routes: the only places the pick-first prompt may appear. Everything else (checkout,
 *  payment returns, account, sign-in, tracking, verify, referral links, the builder) is never gated,
 *  so a link to an existing order is never interrupted. */
export function isPromptRoute(pathname: string): boolean {
  return pathname === '/' || /^\/(c|p|pages)\/[^/]+\/?$/.test(pathname) || /^\/cart\/?$/.test(pathname);
}

export interface PromptInput {
  /** `features.warehousePrompt`. */
  promptOn: boolean;
  /** The warehouse feature applies to this visitor (`warehouseEnabled(ctx)`). */
  enabled: boolean;
  /** The fetched list; `null` while loading. */
  list: Warehouse[] | null;
  failed: boolean;
  /** The shopper already chose during this visit. */
  chosen: boolean;
  builder: boolean;
  pathname: string;
}

/**
 * `show` the chooser, `wait` (the list is still loading, so render the normal loading state rather
 * than flash the catalogue), or `pass` the page through. Fails open: a failed list or fewer than two
 * warehouses never stands between a shopper and the shop.
 */
export function promptDecision(i: PromptInput): 'show' | 'wait' | 'pass' {
  if (!i.promptOn || !i.enabled || i.builder || i.chosen || i.failed) return 'pass';
  if (!isPromptRoute(i.pathname)) return 'pass';
  if (i.list === null) return 'wait';
  return i.list.length >= 2 ? 'show' : 'pass';
}

/**
 * The warehouse requests are served from: the selected one, else the shop's default. Read off the
 * fetched list itself, not the picker's list (which is empty below two entries), so it also answers
 * for a shop that has the feature on with a single warehouse.
 */
export function warehouseInForce(list: Warehouse[] | null, selectedId: number | null): Warehouse | null {
  if (!list) return null;
  return (selectedId !== null ? list.find((w) => w.id === selectedId) : undefined) ?? list.find((w) => w.isDefault) ?? null;
}

/** Whether the shop takes orders at the warehouse the shopper is shipping from. */
export function warehouseOrdering(current: Warehouse | null): { paused: boolean; message: string | null } {
  if (!current || current.orderingEnabled !== false) return { paused: false, message: null };
  return { paused: true, message: current.orderingMessage?.trim() || null };
}
