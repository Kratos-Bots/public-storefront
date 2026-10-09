import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REFERRAL_TTL_MS,
  clearStoredReferral,
  normaliseReferralCode,
  readStoredReferral,
  saveStoredReferral,
} from '@/features/referrals/stored-referral.ts';

const KEY = 'sf-referral-v1';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('normaliseReferralCode', () => {
  it('trims, strips ref_ in any case and uppercases', () => {
    expect(normaliseReferralCode('  ab12cd34 ')).toBe('AB12CD34');
    expect(normaliseReferralCode('ref_ab12cd34')).toBe('AB12CD34');
    expect(normaliseReferralCode('REF_AB12CD34')).toBe('AB12CD34');
  });
  it('rejects anything that is not 4-32 of A-Z0-9', () => {
    for (const bad of ['', 'abc', 'has space1', 'dash-code1', 'x'.repeat(33), '../etc', '<b>hi</b>', 42, null, undefined]) {
      expect(normaliseReferralCode(bad)).toBeNull();
    }
  });
});

describe('stored referral', () => {
  it('saves and reads back', () => {
    expect(saveStoredReferral('test0001')).toBe(true);
    expect(readStoredReferral()).toBe('TEST0001');
  });

  it('ignores an invalid code and keeps what was stored', () => {
    saveStoredReferral('TEST0001');
    expect(saveStoredReferral('nope!')).toBe(false);
    expect(readStoredReferral()).toBe('TEST0001');
  });

  it('expires after 14 days and removes the record', () => {
    saveStoredReferral('TEST0001');
    vi.advanceTimersByTime(REFERRAL_TTL_MS - 1000);
    expect(readStoredReferral()).toBe('TEST0001');
    vi.advanceTimersByTime(2000);
    expect(readStoredReferral()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('last link wins and restarts the 14 days', () => {
    saveStoredReferral('FIRST001');
    vi.advanceTimersByTime(REFERRAL_TTL_MS - 1000);
    saveStoredReferral('SECOND01');
    vi.advanceTimersByTime(REFERRAL_TTL_MS - 1000);
    expect(readStoredReferral()).toBe('SECOND01');
  });

  it('drops malformed records', () => {
    for (const raw of ['not json', '{}', '{"code":"TEST0001"}', '{"code":"bad!","savedAt":1}', 'null', '[]']) {
      localStorage.setItem(KEY, raw);
      expect(readStoredReferral()).toBeNull();
      expect(localStorage.getItem(KEY)).toBeNull();
    }
  });

  it('clears', () => {
    saveStoredReferral('TEST0001');
    clearStoredReferral();
    expect(readStoredReferral()).toBeNull();
  });

  it('never throws when storage does', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    expect(saveStoredReferral('TEST0001')).toBe(false);
    expect(readStoredReferral()).toBeNull();
    expect(() => clearStoredReferral()).not.toThrow();
  });
});
