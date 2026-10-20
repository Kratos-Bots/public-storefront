import type { PushAvailability } from '@/features/push/support.ts';

export const INVITE_STORAGE_KEY = 'sf-push-prompt-v1';
/** How long the invitation stays away once it has been put in front of a shopper. */
export const INVITE_WINDOW_MS = 7 * 24 * 3600 * 1000;

export interface InviteEnv {
  availability: PushAvailability;
  subscribed: boolean;
  isPhone: boolean;
  pathAllowed: boolean;
  /** When the banner was last put on screen, or null when it never has been (or storage is unavailable). */
  lastShownAt: number | null;
  now: number;
  /** A sheet, drawer or dialog is open: the banner waits rather than stack on it. */
  sheetOpen: boolean;
}

/** Pure: whether the "Get order updates on this phone" banner may go up now. */
export function shouldShowInvite(env: InviteEnv): boolean {
  return (env.availability === 'ready' || env.availability === 'needs-install')
    && !env.subscribed
    && env.isPhone
    && env.pathAllowed
    && !env.sheetOpen
    && (env.lastShownAt === null || env.now - env.lastShownAt >= INVITE_WINDOW_MS);
}

/** Storage can throw (private mode, blocked site data): an unreadable value means "never shown". */
export function readLastShown(): number | null {
  try {
    const raw = localStorage.getItem(INVITE_STORAGE_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Written when the banner is shown, not when it is dismissed, so a reload counts as seen. */
export function writeLastShown(at: number): void {
  try {
    localStorage.setItem(INVITE_STORAGE_KEY, String(at));
  } catch {
    /* the banner then comes back next visit rather than failing */
  }
}
