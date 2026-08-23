import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { NotFoundPage } from '@/features/NotFoundPage.tsx';
import type { Features } from '@/types/settings.ts';

export interface GuardSpec {
  /** Route is only reachable while this feature flag is on. */
  feature?: keyof Features;
  /** Route needs a signed-in customer. */
  session?: boolean;
  /** Route needs a signed-in customer *or* guest checkout (the checkout route). */
  sessionOrGuest?: boolean;
}

export type GuardDecision =
  | { kind: 'allow' }
  | { kind: 'notFound' }
  | { kind: 'redirect'; to: string };

export interface GuardContext {
  features: Features;
  loggedIn: boolean;
  path: string;
}

/**
 * A flag that is off renders the 404 state rather than redirecting, so links in
 * old chat messages fail honestly instead of silently landing on the catalog.
 */
export function guardDecision(spec: GuardSpec, ctx: GuardContext): GuardDecision {
  if (spec.feature && !ctx.features[spec.feature]) return { kind: 'notFound' };
  const login = (): GuardDecision => ({
    kind: 'redirect',
    to: `/login?returnTo=${encodeURIComponent(ctx.path)}`,
  });
  if (spec.session) {
    if (!ctx.features.accounts) return { kind: 'notFound' };
    if (!ctx.loggedIn) return login();
  }
  // Sending a guest to /login is always reachable: the backend rejects
  // `ordering && !accounts` unless guestCheckout is on, so this branch implies accounts.
  if (spec.sessionOrGuest && !ctx.loggedIn && !ctx.features.guestCheckout) return login();
  return { kind: 'allow' };
}

export function Guard({ spec, children }: { spec: GuardSpec; children: ReactNode }) {
  const { features } = useSettings();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const { pathname, search } = useLocation();
  const d = guardDecision(spec, { features, loggedIn, path: pathname + search });
  if (d.kind === 'notFound') return <NotFoundPage />;
  if (d.kind === 'redirect') return <Navigate to={d.to} replace />;
  return <>{children}</>;
}
