import { useEffect, useMemo, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { accessGate } from '@/app/access-gate.ts';
import { useSessionStore } from '@/stores/session.ts';
import { formatDate } from '@/lib/format.ts';
import { useProfile } from '@/features/account/queries.ts';
import { textKey, useText } from '@/text/runtime.tsx';
import { FADE } from '@/lib/motion.ts';
import { AccountFamily, type AccountData } from '@/builder/family-account.ts';
import type { FamilyValue, PartViewProps } from '@/builder/parts.ts';
import { defaultSlotRenders } from '@/builder/render.tsx';
import type { SlotRender } from '@/builder/define.ts';
import type { DocKey } from '@/builder/types.ts';
import classes from '@/features/account/Account.module.css';

const TABS = [
  { to: '/account/orders', label: textKey('account.nav.orders') },
  { to: '/account/loyalty', label: textKey('account.nav.loyalty') },
  { to: '/account/referrals', label: textKey('account.nav.referrals') },
  { to: '/account/profile', label: textKey('account.nav.profile') },
];

/** One order's own page: it is read on its own, so the account's greeting and section rail stay out of the way. */
export function isOrderDetailPath(pathname: string): boolean {
  return /^\/account\/orders\/[^/]+\/?$/.test(pathname);
}

function GreetingView({ styleAttrs }: PartViewProps) {
  const { t, tp } = useText();
  const { name, standing, pathname } = AccountFamily.useData();
  if (isOrderDetailPath(pathname)) return null;
  return (
    <header className={classes.letterhead} {...styleAttrs}>
      <span className={classes.eyebrow}>{t('account.layout.eyebrow')}</span>
      <h1 className={classes.name}>{name ?? t('common.nav.yourAccount')}</h1>
      {standing ? (
        <p className={classes.meta}>
          {t('account.layout.standing', {
            date: formatDate(standing.memberSince),
            orders: tp('account.orders.count', standing.totalOrders),
          })}
        </p>
      ) : null}
    </header>
  );
}

function TabsView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { pathname } = AccountFamily.useData();
  if (isOrderDetailPath(pathname)) return null;
  return (
    <nav className={classes.tabs} aria-label={t('account.nav.ariaLabel')} {...styleAttrs}>
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            isActive ? `${classes.tab} ${classes.tabActive}` : classes.tab
          }
        >
          {t(tab.label)}
        </NavLink>
      ))}
    </nav>
  );
}

/** The account header's views (spec §5.3): the letterhead and the rail. */
export const ACCOUNT_VIEWS: FamilyValue<AccountData>['views'] = { AccountGreeting: GreetingView, AccountTabs: TabsView };

/**
 * The statement's letterhead and its rail of sections. The name comes from the
 * session the moment the page paints — the profile behind it only fills in the
 * standing line — so a returning customer is greeted before the network answers.
 *
 * The rail is built from links rather than an ARIA tablist: every section is a
 * real route, so it has to survive a middle-click, a bookmark and the back
 * button. An order's own page (`/account/orders/:ref`) hides both: it is read on
 * its own, with an "All orders" link back, so the rail would only compete with it.
 *
 * The page builder's AccountNav block passes the section as `children` and its
 * `head` slot (the letterhead and the rail are parts, spec §5.3); a route that
 * nests under it still uses the outlet. Without `slots` the default head is drawn.
 */
export function AccountLayout({ children, slots, docKey = 'account.orders' }: { children?: ReactNode; slots?: { head: SlotRender }; docKey?: DocKey }) {
  const profile = useProfile();
  // The profile is the one answer that says outright whether this customer may
  // shop; keep the gate in step with it in both directions.
  useEffect(() => {
    if (profile.data?.shopAccess === false) accessGate.getState().setDenied(true);
    else if (profile.data?.shopAccess === true) accessGate.getState().setDenied(false);
  }, [profile.data?.shopAccess]);
  const sessionNickname = useSessionStore((s) => s.customer?.nickname);
  const location = useLocation();
  const legacy = useMemo(() => (slots ? null : defaultSlotRenders('AccountNav', 'storefront', {}, docKey)), [slots, docKey]);
  const head = slots?.head ?? legacy!.head!;
  const name = sessionNickname ?? profile.data?.nickname ?? null;
  const standing = profile.data ? { memberSince: profile.data.memberSince, totalOrders: profile.data.totalOrders } : null;
  const value = useMemo(
    () => ({ data: { name, standing, pathname: location.pathname }, views: ACCOUNT_VIEWS }),
    // `standing` is rebuilt every render; its fields are the dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, standing?.memberSince, standing?.totalOrders, location.pathname],
  );

  return (
    <AccountFamily.Provider value={value}>
      <div className={isOrderDetailPath(location.pathname) ? `${classes.account} ${classes.accountOrder}` : classes.account}>
        {head()}
        <div key={location.pathname} className={FADE}>
          {children ?? <Outlet />}
        </div>
      </div>
    </AccountFamily.Provider>
  );
}
