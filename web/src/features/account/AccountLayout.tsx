import { NavLink, Outlet, useLocation } from 'react-router';
import { useSessionStore } from '@/stores/session.ts';
import { formatDate } from '@/lib/format.ts';
import { useProfile } from '@/features/account/queries.ts';
import { FADE } from '@/lib/motion.ts';
import classes from '@/features/account/Account.module.css';

const TABS = [
  { to: '/account/orders', label: 'Orders' },
  { to: '/account/loyalty', label: 'Loyalty' },
  { to: '/account/referrals', label: 'Referrals' },
  { to: '/account/profile', label: 'Profile' },
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
 */
export function AccountLayout() {
  const profile = useProfile();
  const sessionNickname = useSessionStore((s) => s.customer?.nickname);
  const name = sessionNickname ?? profile.data?.nickname ?? null;
  const standing = profile.data;
  const location = useLocation();

  return (
    <div className={classes.account}>
      <header className={classes.letterhead}>
        <span className={classes.eyebrow}>Account</span>
        <h1 className={classes.name}>{name ?? 'Your account'}</h1>
        {standing ? (
          <p className={classes.meta}>
            Member since {formatDate(standing.memberSince)} · {standing.totalOrders}{' '}
            {standing.totalOrders === 1 ? 'order' : 'orders'}
          </p>
        ) : null}
      </header>

      <nav className={classes.tabs} aria-label="Account sections">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              isActive ? `${classes.tab} ${classes.tabActive}` : classes.tab
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div key={location.pathname} className={FADE}>
        <Outlet />
      </div>
    </div>
  );
}
