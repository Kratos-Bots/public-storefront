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

  it('never throws, and handles the rejection, when the report fails', async () => {
    // process.on('unhandledRejection') is not observable here (checked: with the .catch removed
    // from trackPageLoad it still saw nothing, vitest owns that event), so assert directly that a
    // rejection handler was attached to the promise postVisit returned (vitest itself
    // attaches then() to mock results, so spy on catch, which the tracker is expected to call).
    const failed = Promise.reject(new Error('offline'));
    const then = vi.spyOn(failed, 'catch');
    postVisit.mockReturnValueOnce(failed as unknown as Promise<undefined>);
    expect(() => trackPageLoad()).not.toThrow();
    expect(then).toHaveBeenCalled();
    await expect(failed).rejects.toThrow('offline');
  });

  it('a second trackPageLoad in the same page load does not report a second visit', () => {
    window.history.replaceState(null, '', '/p/5?utm_source=newsletter');
    try {
      trackPageLoad();
      trackPageLoad();
      expect(postVisit).toHaveBeenCalledTimes(1);
    } finally {
      window.history.replaceState(null, '', '/');
    }
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
