import { describe, expect, it } from 'vitest';
import { guardDecision } from '@/app/guards.tsx';

describe('guardDecision', () => {
  it('404s when the feature is off', () => {
    expect(
      guardDecision({ feature: 'verify' }, { features: { verify: false } as never, loggedIn: false, path: '/verify' }),
    ).toEqual({ kind: 'notFound' });
  });

  it('redirects to login with returnTo when session is required', () => {
    expect(
      guardDecision({ session: true }, { features: { accounts: true } as never, loggedIn: false, path: '/account/orders' }),
    ).toEqual({ kind: 'redirect', to: '/login?returnTo=%2Faccount%2Forders' });
  });

  it('allows otherwise', () => {
    expect(
      guardDecision({ feature: 'ordering' }, { features: { ordering: true } as never, loggedIn: false, path: '/cart' }),
    ).toEqual({ kind: 'allow' });
  });

  it('404s a session route when accounts are off', () => {
    expect(
      guardDecision({ session: true }, { features: { accounts: false } as never, loggedIn: true, path: '/account' }),
    ).toEqual({ kind: 'notFound' });
  });

  it('allows a session route once logged in', () => {
    expect(
      guardDecision({ session: true }, { features: { accounts: true } as never, loggedIn: true, path: '/account' }),
    ).toEqual({ kind: 'allow' });
  });

  it('lets a guest through a sessionOrGuest route when guest checkout is on', () => {
    expect(
      guardDecision(
        { feature: 'ordering', sessionOrGuest: true },
        { features: { ordering: true, guestCheckout: true } as never, loggedIn: false, path: '/checkout' },
      ),
    ).toEqual({ kind: 'allow' });
  });

  it('sends a guest to login from a sessionOrGuest route when guest checkout is off', () => {
    expect(
      guardDecision(
        { feature: 'ordering', sessionOrGuest: true },
        { features: { ordering: true, guestCheckout: false } as never, loggedIn: false, path: '/checkout' },
      ),
    ).toEqual({ kind: 'redirect', to: '/login?returnTo=%2Fcheckout' });
  });

  it('checks the feature flag before the session', () => {
    expect(
      guardDecision(
        { feature: 'tracking', session: true },
        { features: { tracking: false, accounts: true } as never, loggedIn: false, path: '/tracking' },
      ),
    ).toEqual({ kind: 'notFound' });
  });
});
