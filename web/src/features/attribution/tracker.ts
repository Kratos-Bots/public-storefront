import { postVisit } from '@/api/visits.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
import { readTouch, shouldStartVisit, type VisitState } from '@/features/attribution/touch.ts';

// Decides when a visit starts and tells the backend. Everything here is best effort: no failure
// of storage or network may reach the shopper.

export const VISIT_KEY = 'sf-visit-v1';

function load(): VisitState | null {
  try {
    const raw = localStorage.getItem(VISIT_KEY);
    const state = raw ? (JSON.parse(raw) as VisitState) : null;
    return state && typeof state.lastActivityAt === 'number' && state.currentTouch && state.firstTouch ? state : null;
  } catch {
    return null;
  }
}

function save(state: VisitState): void {
  try { localStorage.setItem(VISIT_KEY, JSON.stringify(state)); } catch { /* memory-less: every load is a visit */ }
}

/** Call once per page load. */
export function trackPageLoad(): void {
  // The page builder renders the shop on fixtures; the admin editing a page is not a visitor.
  if (isBuilderMode()) return;
  try {
    const now = Date.now();
    const touch = readTouch(window.location.href, document.referrer);
    const state = load();
    if (!shouldStartVisit(state, touch, now)) {
      save({ ...state!, lastActivityAt: now });
      return;
    }
    save({ firstTouch: state?.firstTouch ?? touch, currentTouch: touch, lastActivityAt: now });
    void postVisit(touch, isTelegramWebApp() ? 'telegram_webapp' : 'web').catch(() => undefined);
  } catch { /* never let tracking break the shop */ }
}

/** Call on every in-app navigation, so a shopper who keeps browsing stays in one visit. */
export function markActivity(): void {
  if (isBuilderMode()) return;
  const state = load();
  if (state) save({ ...state, lastActivityAt: Date.now() });
}
