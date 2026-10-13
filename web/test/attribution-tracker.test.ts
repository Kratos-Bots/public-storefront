import { beforeEach, describe, expect, it, vi } from 'vitest';

const postVisit = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/api/visits.ts', () => ({ postVisit }));
vi.mock('@/app/builder-gate.ts', () => ({ isBuilderMode: () => false, BUILDER_PATH: '/__builder' }));
vi.mock('@/lib/telegram-webapp.ts', () => ({ isTelegramWebApp: () => false }));

import { markActivity, trackPageLoad, VISIT_KEY } from '@/features/attribution/tracker.ts';
import { VISIT_IDLE_MS } from '@/features/attribution/touch.ts';

beforeEach(() => {
  localStorage.clear();
  postVisit.mockClear();
  vi.useRealTimers();
});

describe('trackPageLoad', () => {
  it('reports the first visit and remembers it as the first touch', () => {
    trackPageLoad();
    expect(postVisit).toHaveBeenCalledTimes(1);
    const state = JSON.parse(localStorage.getItem(VISIT_KEY)!);
    expect(state.firstTouch).toEqual(state.currentTouch);
  });

  it('does not report again on the next page load', () => {
    trackPageLoad();
    trackPageLoad();
    expect(postVisit).toHaveBeenCalledTimes(1);
  });

  it('reports a new visit after a long gap but keeps the first touch', () => {
    trackPageLoad();
    const state = JSON.parse(localStorage.getItem(VISIT_KEY)!);
    state.firstTouch = { ...state.firstTouch, utmSource: 'original' };
    state.lastActivityAt = Date.now() - VISIT_IDLE_MS - 1000;
    localStorage.setItem(VISIT_KEY, JSON.stringify(state));

    trackPageLoad();
    expect(postVisit).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem(VISIT_KEY)!).firstTouch.utmSource).toBe('original');
  });

  it('never throws when the report fails', async () => {
    postVisit.mockRejectedValueOnce(new Error('offline'));
    expect(() => trackPageLoad()).not.toThrow();
    await Promise.resolve();
  });

  it('never throws when storage holds junk', () => {
    localStorage.setItem(VISIT_KEY, '{not json');
    expect(() => trackPageLoad()).not.toThrow();
    expect(postVisit).toHaveBeenCalledTimes(1);
  });
});

describe('markActivity', () => {
  it('moves the last-activity time forward', () => {
    trackPageLoad();
    const state = JSON.parse(localStorage.getItem(VISIT_KEY)!);
    state.lastActivityAt = 1;
    localStorage.setItem(VISIT_KEY, JSON.stringify(state));
    markActivity();
    expect(JSON.parse(localStorage.getItem(VISIT_KEY)!).lastActivityAt).toBeGreaterThan(1);
  });
});
