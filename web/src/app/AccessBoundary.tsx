import { useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { accessDecision, accessOf, checksProfile, type AccessContext } from '@/app/access.ts';
import { accessGate } from '@/app/access-gate.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { Brand } from '@/components/Brand.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { useProfile } from '@/features/account/queries.ts';
import { LockedPage } from '@/features/access/LockedPage.tsx';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import classes from '@/app/AccessBoundary.module.css';

/** A bare page: in a non-public shop nothing around the sign-in form may ask for the catalogue. */
function AuthOnlyFrame({ children }: { children: ReactNode }) {
  return (
    <main className={classes.authOnly}>
      <div className={classes.column}>
        <span className={classes.brand}>
          <Brand size="lg" />
        </span>
        {children}
      </div>
    </main>
  );
}

/**
 * Applies the shop-access decision to every navigation. It is a route element
 * (not above the router like ClosedGate) because it must react to client-side
 * navigation: a customer who is not allowed may open their orders and then
 * navigate back to the shop.
 */
export function AccessBoundary({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const denied = accessGate((s) => s.denied);
  const registrationRefused = accessGate((s) => s.registrationRefused);
  const { pathname, search } = useLocation();

  const ctx: AccessContext = {
    access: accessOf(settings), loggedIn, denied, registrationRefused,
    accounts: settings.features?.accounts !== false, pathname, search, builder: isBuilderMode(),
  };

  // A restricted shop: ask the profile up front, so a customer who is not allowed never
  // sees the shop frame while the catalogue call finds out. Shares its cache with AccountLayout.
  const check = checksProfile(ctx);
  const profile = useProfile(check);
  const profileDenied = check && profile.data?.shopAccess === false;
  useEffect(() => {
    if (!check) return;
    if (profile.data?.shopAccess === false) accessGate.getState().setDenied(true);
    else if (profile.data?.shopAccess === true) accessGate.getState().setDenied(false);
  }, [check, profile.data?.shopAccess]);

  const decision = accessDecision({ ...ctx, denied: denied || profileDenied });

  if (decision.kind === 'allow' && check && profile.isPending) return <PageSkeleton />;
  if (decision.kind === 'locked') return <LockedPage variant={decision.variant} />;
  if (decision.kind === 'redirect') return <Navigate to={decision.to} replace />;
  if (decision.kind === 'authOnly') return <AuthOnlyFrame><Outlet /></AuthOnlyFrame>;
  return <>{children}</>;
}
