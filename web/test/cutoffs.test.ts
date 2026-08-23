import { describe, expect, it } from 'vitest';
import { nextCutoff } from '@/lib/cutoffs.ts';
import type { Cutoffs } from '@/types/settings.ts';

const base: Cutoffs = {
  timezone: 'Europe/London',
  days: {
    mon: { enabled: true, cutoff: '15:00', shipsOn: 'same day' },
    tue: { enabled: true, cutoff: '15:00', shipsOn: 'same day' },
    wed: { enabled: false, cutoff: '12:00', shipsOn: '' },
    thu: { enabled: true, cutoff: '15:00', shipsOn: 'same day' },
    fri: { enabled: true, cutoff: '13:00', shipsOn: 'Monday' },
    sat: { enabled: false, cutoff: '12:00', shipsOn: '' },
    sun: { enabled: false, cutoff: '12:00', shipsOn: '' },
  },
};

describe('nextCutoff', () => {
  it('returns today’s cutoff when before it (BST)', () => {
    // Tue 2026-08-25 10:00 London = 09:00Z
    const r = nextCutoff(base, '2026-08-25T09:00:00.000Z', 1000, 1000)!;
    expect(r.day).toBe('tue');
    expect(r.shipsOn).toBe('same day');
    expect(r.at.toISOString()).toBe('2026-08-25T14:00:00.000Z'); // 15:00 BST
    expect(r.msRemaining).toBe(5 * 3600_000);
  });
  it('rolls to the next enabled day after the cutoff, skipping disabled days', () => {
    // Tue 16:00 London → next is Thu 15:00 (wed disabled)
    const r = nextCutoff(base, '2026-08-25T15:00:00.000Z', 0, 0)!;
    expect(r.day).toBe('thu');
    expect(r.at.toISOString()).toBe('2026-08-27T14:00:00.000Z');
  });
  it('applies client drift: serverTime + (clientNow - clientNowAtFetch)', () => {
    const r = nextCutoff(base, '2026-08-25T09:00:00.000Z', 0, 3600_000)!;
    expect(r.msRemaining).toBe(4 * 3600_000);
  });
  it('wraps the week (Fri after cutoff → Mon)', () => {
    const r = nextCutoff(base, '2026-08-28T13:00:00.000Z', 0, 0)!; // Fri 14:00 BST
    expect(r.day).toBe('mon');
    expect(r.at.toISOString()).toBe('2026-08-31T14:00:00.000Z');
  });
  it('returns null when no day is enabled', () => {
    const none = { ...base, days: Object.fromEntries(Object.entries(base.days).map(([k, v]) => [k, { ...v, enabled: false }])) as Cutoffs['days'] };
    expect(nextCutoff(none, '2026-08-25T09:00:00.000Z', 0, 0)).toBeNull();
  });
});
