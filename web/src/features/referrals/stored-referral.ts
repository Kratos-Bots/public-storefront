// A referral link remembered in this browser for 14 days, so a friend who follows it today
// and orders next week still counts. Web only: the Telegram Mini App has the bot's deep link.
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'sf-referral-v1';
const CHANGE_EVENT = 'sf-referral-change';
export const REFERRAL_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Same shape the bot's deep link accepts. The backend generates 8 characters, A–Z and 0–9. */
const CODE_RE = /^[A-Z0-9]{4,32}$/;

/** Trim, drop a leading `ref_` (any case), uppercase. `null` when what is left is not a code. */
export function normaliseReferralCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().replace(/^ref_/i, '').toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

function notify(): void {
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // no window (tests without a DOM)
  }
}

/**
 * Remember a code. Last touch wins: a NEW valid link overwrites the stored one and restarts the
 * 14 days, so the friend who sent the most recent link gets the credit. An invalid code is ignored
 * and leaves what was stored alone. Returns whether anything was stored.
 */
export function saveStoredReferral(raw: unknown): boolean {
  const code = normaliseReferralCode(raw);
  if (!code) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, savedAt: Date.now() }));
  } catch {
    return false; // private mode / storage full — the page must never break over this
  }
  notify();
  return true;
}

export function clearStoredReferral(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  notify();
}

/** The remembered code, or `null` if none, expired or malformed (the latter two are removed). */
export function readStoredReferral(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    let parsed = null as { code?: unknown; savedAt?: unknown } | null;
    try {
      parsed = JSON.parse(raw) as { code?: unknown; savedAt?: unknown } | null;
    } catch {
      // unreadable: treated like any other malformed record below
    }
    const code = parsed && typeof parsed === 'object' ? normaliseReferralCode(parsed.code) : null;
    const savedAt = parsed && typeof parsed.savedAt === 'number' ? parsed.savedAt : NaN;
    const age = Date.now() - savedAt;
    if (!code || !Number.isFinite(age) || age < 0 || age >= REFERRAL_TTL_MS) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      return null;
    }
    return code;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** The remembered code, kept current across tabs and after it is cleared. */
export function useStoredReferral(): string | null {
  return useSyncExternalStore(subscribe, readStoredReferral, () => null);
}
