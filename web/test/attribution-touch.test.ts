import { describe, expect, it } from 'vitest';
import { readTouch, safeLandingPath, shouldStartVisit, VISIT_IDLE_MS, type Touch, type VisitState } from '@/features/attribution/touch.ts';

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

describe('safeLandingPath', () => {
  it('collapses the old order key link to its prefix', () => {
    expect(safeLandingPath('/order/ORD-1/abcdef')).toBe('/order');
  });
  it('collapses with a trailing slash and extra segments', () => {
    expect(safeLandingPath('/order/ORD-1/abcdef/')).toBe('/order');
    expect(safeLandingPath('/order/ORD-1/abcdef/extra/more')).toBe('/order');
    expect(safeLandingPath('/order/')).toBe('/order');
    expect(safeLandingPath('/order')).toBe('/order');
  });
  it('collapses credential-bearing sub-paths of the token pages', () => {
    expect(safeLandingPath('/verify/CODE123/AUTH456')).toBe('/verify');
    expect(safeLandingPath('/reset-password/tok')).toBe('/reset-password');
    expect(safeLandingPath('/verify-email/tok/')).toBe('/verify-email');
  });
  it('leaves ordinary pages unchanged', () => {
    for (const p of ['/', '/p/5', '/cart', '/faq', '/order-placed', '/verify', '/reset-password', '/tracking/ORD-1', '/account/orders/ORD-1', '/c/peptides']) {
      expect(safeLandingPath(p)).toBe(p);
    }
  });
  it('is what readTouch stores as the landing path', () => {
    expect(readTouch('https://shop.example/order/ORD-1/abcdef', '').landingPath).toBe('/order');
  });
});

describe('readTouch return routes', () => {
  const PROCESSOR = 'https://checkout.processor.example/pay/abc';
  it.each(['/payment/success', '/payment/cancel', '/order-placed', '/order/ORD-1/key', '/auth/telegram/callback'])(
    'ignores the referrer on %s but still reads UTM tags',
    (path) => {
      const touch = readTouch(`https://shop.example${path}?utm_source=mail`, PROCESSOR);
      expect(touch.referrerHost).toBeNull();
      expect(touch.utmSource).toBe('mail');
    },
  );
  it('keeps the referrer on a normal page', () => {
    expect(readTouch('https://shop.example/p/5', PROCESSOR).referrerHost).toBe('checkout.processor.example');
  });
});
