import { afterEach, describe, expect, it, vi } from 'vitest';
import { INVITE_STORAGE_KEY, INVITE_WINDOW_MS, readLastShown, shouldShowInvite, writeLastShown, type InviteEnv } from '@/features/push/invite-rules.ts';

const DAY = 24 * 3600 * 1000;
const NOW = 1_800_000_000_000;
const env = (over: Partial<InviteEnv> = {}): InviteEnv => ({
  availability: 'ready', subscribed: false, isPhone: true, pathAllowed: true, lastShownAt: null, now: NOW, sheetOpen: false, ...over,
});

describe('shouldShowInvite', () => {
  it('shows to a phone that has never been asked', () => expect(shouldShowInvite(env())).toBe(true));
  it('hidden 6 days after shown, visible at 7', () => {
    expect(shouldShowInvite(env({ lastShownAt: NOW - 6 * DAY }))).toBe(false);
    expect(shouldShowInvite(env({ lastShownAt: NOW - 7 * DAY + 1 }))).toBe(false);
    expect(shouldShowInvite(env({ lastShownAt: NOW - 7 * DAY }))).toBe(true);
    expect(INVITE_WINDOW_MS).toBe(7 * DAY);
  });
  it('hidden on desktop', () => expect(shouldShowInvite(env({ isPhone: false }))).toBe(false));
  it('hidden when subscribed', () => expect(shouldShowInvite(env({ subscribed: true }))).toBe(false));
  it('hidden when denied', () => expect(shouldShowInvite(env({ availability: 'denied' }))).toBe(false));
  it('hidden when unavailable', () => expect(shouldShowInvite(env({ availability: 'unavailable' }))).toBe(false));
  it('hidden on checkout path', () => expect(shouldShowInvite(env({ pathAllowed: false }))).toBe(false));
  it('hidden while a sheet or dialog is open', () => expect(shouldShowInvite(env({ sheetOpen: true }))).toBe(false));
  it('needs-install shows', () => expect(shouldShowInvite(env({ availability: 'needs-install' }))).toBe(true));
});

describe('invite storage', () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it('round-trips the shown time under the versioned key', () => {
    expect(INVITE_STORAGE_KEY).toBe('sf-push-prompt-v1');
    expect(readLastShown()).toBeNull();
    writeLastShown(NOW);
    expect(localStorage.getItem(INVITE_STORAGE_KEY)).toBe(String(NOW));
    expect(readLastShown()).toBe(NOW);
  });
  it('treats a garbage value as never shown', () => {
    localStorage.setItem(INVITE_STORAGE_KEY, 'soon');
    expect(readLastShown()).toBeNull();
  });
  it('storage throwing → treated as never shown, no crash', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readLastShown()).toBeNull();
    expect(() => writeLastShown(NOW)).not.toThrow();
    expect(shouldShowInvite(env({ lastShownAt: readLastShown() }))).toBe(true);
  });
});
