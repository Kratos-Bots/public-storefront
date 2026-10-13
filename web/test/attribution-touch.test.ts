import { describe, expect, it } from 'vitest';
import { readTouch, shouldStartVisit, VISIT_IDLE_MS, type Touch, type VisitState } from '@/features/attribution/touch.ts';

const SHOP = 'https://shop.example/p/5?utm_source=Newsletter&utm_medium=email&utm_campaign=oct';
const direct: Touch = { referrerHost: null, utmSource: null, utmMedium: null, utmCampaign: null, landingPath: '/' };

describe('readTouch', () => {
  it('reads the campaign tags and the landing path', () => {
    expect(readTouch(SHOP, '')).toEqual({
      referrerHost: null, utmSource: 'Newsletter', utmMedium: 'email', utmCampaign: 'oct', landingPath: '/p/5',
    });
  });
  it('reads an external referrer as its host only', () => {
    expect(readTouch('https://shop.example/', 'https://www.google.com/search?q=secret').referrerHost).toBe('www.google.com');
  });
  it('ignores a referrer from the shop itself', () => {
    expect(readTouch('https://shop.example/cart', 'https://shop.example/p/5').referrerHost).toBeNull();
  });
  it('survives a referrer that is not a URL', () => {
    expect(readTouch('https://shop.example/', 'not a url').referrerHost).toBeNull();
  });
  it('truncates very long values', () => {
    const touch = readTouch(`https://shop.example/${'a'.repeat(900)}?utm_source=${'b'.repeat(300)}`, '');
    expect(touch.landingPath).toHaveLength(500);
    expect(touch.utmSource).toHaveLength(100);
  });
});

describe('shouldStartVisit', () => {
  const now = 1_000_000_000;
  const state = (over: Partial<VisitState> = {}): VisitState => ({ firstTouch: direct, currentTouch: direct, lastActivityAt: now - 60_000, ...over });

  it('starts one when there is none', () => {
    expect(shouldStartVisit(null, direct, now)).toBe(true);
  });
  it('does not start one on a reload or an in-shop page view', () => {
    expect(shouldStartVisit(state(), direct, now)).toBe(false);
  });
  it('starts one after 30 minutes without activity', () => {
    expect(shouldStartVisit(state({ lastActivityAt: now - VISIT_IDLE_MS - 1 }), direct, now)).toBe(true);
  });
  it('starts one on arrival from a different campaign', () => {
    expect(shouldStartVisit(state(), { ...direct, utmSource: 'instagram' }, now)).toBe(true);
  });
  it('starts one on arrival from a different site', () => {
    expect(shouldStartVisit(state(), { ...direct, referrerHost: 'google.com' }, now)).toBe(true);
  });
  it('does not restart when the same campaign link is reloaded', () => {
    const tagged = { ...direct, utmSource: 'instagram' };
    expect(shouldStartVisit(state({ currentTouch: tagged }), { ...tagged, landingPath: '/other' }, now)).toBe(false);
  });
});
