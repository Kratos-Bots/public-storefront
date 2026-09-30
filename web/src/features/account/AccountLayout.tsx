import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useSessionStore } from '@/stores/session.ts';
import { formatDate } from '@/lib/format.ts';
import { useProfile } from '@/features/account/queries.ts';
import { textKey, useText } from '@/text/runtime.tsx';
import { FADE } from '@/lib/motion.ts';
import classes from '@/features/account/Account.module.css';

const TABS = [
  { to: '/account/orders', label: textKey('account.nav.orders') },
  { to: '/account/loyalty', label: textKey('account.nav.loyalty') },
  { to: '/account/referrals', label: textKey('account.nav.referrals') },
  { to: '/account/profile', label: textKey('account.nav.profile') },
];

/**
 * The statement's letterhead and its rail of sections. The name comes from the
 * session the moment the page paints — the profile behind it only fills in the
 * standing line — so a returning customer is greeted before the network answers.
 *
 * The rail is built from links rather than an ARIA tablist: every section is a
 * real route, so it has to survive a middle-click, a bookmark and the back
 * button, and `/account/orders/:ref` keeps the Orders section marked as the one
 * it belongs to.
 *
 * The page builder's AccountNav block passes the section as `children`; a route
 * that nests under it still uses the outlet.
 */
export function AccountLayout({ children }: { children?: ReactNode }) {
  const { t, tp } = useText();
  const profile = useProfile();
  const sessionNickname = useSessionStore((s) => s.customer?.nickname);
  const name = sessionNickname ?? profile.data?.nickname ?? null;
  const standing = profile.data;
  const location = useLocation();

  return (
    <div className={classes.account}>
      <header className={classes.letterhead}>
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

      <nav className={classes.tabs} aria-label={t('account.nav.ariaLabel')}>
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

      <div key={location.pathname} className={FADE}>
        {children ?? <Outlet />}
      </div>
    </div>
  );
}
