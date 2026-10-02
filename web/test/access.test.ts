import { describe, expect, it } from 'vitest';
import { OPEN_ACCESS, accessDecision, accessOf, isAuthPath, showsLockoutCopy, type AccessInfo } from '@/app/access.ts';

const base = {
  access: OPEN_ACCESS, loggedIn: false, denied: false, registrationRefused: false,
  accounts: true, pathname: '/', search: '', builder: false,
};
const mode = (storefront: AccessInfo['storefront'], extra: Partial<AccessInfo> = {}): AccessInfo =>
  ({ ...OPEN_ACCESS, storefront, ...extra });

describe('accessOf', () => {
  it('treats a backend with no access object as an open shop', () => {
    expect(accessOf({})).toEqual(OPEN_ACCESS);
    expect(OPEN_ACCESS).toEqual({ storefront: 'public', registration: true, deniedMessage: '', deniedButtons: [] });
  });

  it('keeps only https buttons with a label', () => {
    const access = accessOf({ access: {
      storefront: 'restricted', registration: false, deniedMessage: 'Members only.',
      deniedButtons: [
        { label: 'Chat', url: 'https://t.me/example' }, { label: 'Bad', url: 'http://example.com' },
        { label: 'Script', url: 'javascript:alert(1)' }, { label: '  ', url: 'https://example.com' },
      ],
    } });
    expect(access.deniedButtons).toEqual([{ label: 'Chat', url: 'https://t.me/example' }]);
    expect(access.storefront).toBe('restricted');
  });

  it('falls back to public for a mode it does not know', () => {
    expect(accessOf({ access: { storefront: 'members' as never, registration: true, deniedMessage: '', deniedButtons: [] } }).storefront).toBe('public');
  });
});

describe('showsLockoutCopy', () => {
  it.each([
    [mode('public'), false], [mode('login'), false], [mode('restricted'), true],
    [mode('public', { registration: false }), true], [mode('login', { registration: false }), true],
  ])('%o → %s', (access, expected) => {
    expect(showsLockoutCopy(access)).toBe(expected);
  });
});

describe('isAuthPath', () => {
  it.each(['/login', '/login/', '/reset-password'])('%s is an auth path', (p) => expect(isAuthPath(p)).toBe(true));
  it.each(['/', '/account', '/loginx', '/verify-email'])('%s is not', (p) => expect(isAuthPath(p)).toBe(false));
});

describe('accessDecision', () => {
  it('allows everything in a public shop', () => {
    expect(accessDecision(base)).toEqual({ kind: 'allow' });
    expect(accessDecision({ ...base, pathname: '/cart' })).toEqual({ kind: 'allow' });
  });

  it.each(['login', 'restricted'] as const)('sends a signed-out visitor to sign in (%s)', (m) => {
    expect(accessDecision({ ...base, access: mode(m), pathname: '/c/tea', search: '?page=2' }))
      .toEqual({ kind: 'redirect', to: '/login?returnTo=%2Fc%2Ftea%3Fpage%3D2' });
  });

  it('shows the auth pages bare to a signed-out visitor in a non-public shop', () => {
    expect(accessDecision({ ...base, access: mode('login'), pathname: '/login' })).toEqual({ kind: 'authOnly' });
    expect(accessDecision({ ...base, access: mode('restricted'), pathname: '/reset-password' })).toEqual({ kind: 'authOnly' });
  });

  it('leaves the auth pages alone in a public shop', () => {
    expect(accessDecision({ ...base, pathname: '/login' })).toEqual({ kind: 'allow' });
  });

  it.each(['/payment/success', '/payment/cancel', '/order-placed', '/order/ORD-1/abc'])(
    'never gates the exempt path %s', (pathname) => {
      expect(accessDecision({ ...base, access: mode('restricted'), pathname })).toEqual({ kind: 'allow' });
      expect(accessDecision({ ...base, access: mode('restricted'), loggedIn: true, denied: true, pathname })).toEqual({ kind: 'allow' });
    });

  it('never gates builder mode', () => {
    expect(accessDecision({ ...base, access: mode('restricted'), builder: true })).toEqual({ kind: 'allow' });
  });

  it('lets any signed-in customer into a login-required shop', () => {
    expect(accessDecision({ ...base, access: mode('login'), loggedIn: true })).toEqual({ kind: 'allow' });
  });

  it('lets a signed-in customer browse a restricted shop until the backend says otherwise', () => {
    expect(accessDecision({ ...base, access: mode('restricted'), loggedIn: true })).toEqual({ kind: 'allow' });
  });

  it('locks out a signed-in customer the backend refused', () => {
    expect(accessDecision({ ...base, access: mode('restricted'), loggedIn: true, denied: true }))
      .toEqual({ kind: 'locked', variant: 'denied' });
  });

  it.each(['/account', '/account/orders', '/account/orders/ORD-1', '/account/profile'])(
    'keeps %s reachable for a refused customer', (pathname) => {
      expect(accessDecision({ ...base, access: mode('restricted'), loggedIn: true, denied: true, pathname })).toEqual({ kind: 'allow' });
    });

  it('ignores a stale refusal once the shop is no longer restricted', () => {
    expect(accessDecision({ ...base, access: mode('login'), loggedIn: true, denied: true })).toEqual({ kind: 'allow' });
  });

  it('shows the lockout screen when a Mini App sign-in was refused because registration is closed', () => {
    expect(accessDecision({ ...base, access: mode('login', { registration: false }), registrationRefused: true }))
      .toEqual({ kind: 'locked', variant: 'closed' });
  });

  it('keeps a public shop browsable after a refused Mini App registration', () => {
    expect(accessDecision({ ...base, access: mode('public', { registration: false }), registrationRefused: true }))
      .toEqual({ kind: 'allow' });
  });

  it('shows the lockout screen, not a dead redirect, when accounts are switched off in a non-public shop', () => {
    expect(accessDecision({ ...base, access: mode('login'), accounts: false })).toEqual({ kind: 'locked', variant: 'closed' });
    expect(accessDecision({ ...base, access: mode('login'), accounts: false, pathname: '/login' })).toEqual({ kind: 'locked', variant: 'closed' });
  });
});
