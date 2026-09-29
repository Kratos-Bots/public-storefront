import { Suspense, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { useCartStore, selectCount } from '@/stores/cart.ts';
import { useUiStore } from '@/stores/ui.ts';
import { Brand } from '@/components/Brand.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { BagIcon, ChevronIcon, FilterIcon, UserIcon } from '@/components/icons.tsx';
import { NoticeBanners } from '@/features/notices/NoticeBanners.tsx';
import { CutoffBar } from '@/features/notices/CutoffBar.tsx';
import { LoginModal } from '@/features/auth/LoginModal.tsx';
import { PrimaryActionBar, usePrimaryBarShowing } from '@/features/webapp/PrimaryActionBar.tsx';
import { isFirstHistoryEntry, useTelegramChrome } from '@/features/webapp/useTelegramChrome.ts';
import { SearchField } from '@/layouts/SearchField.tsx';
import type { ShellSearchContext } from '@/layouts/shell-context.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
import { Slot } from '@/templates/runtime.tsx';
import { headerIconClass, useCoreOptions } from '@/templates/hooks.ts';
import classes from '@/layouts/WebAppShell.module.css';

/**
 * The `webapp` layout: always inside Telegram, and wherever a store picks it.
 * The same list, sheets and template as the menu layout, with Telegram owning
 * the top chrome (so no TopBar slot) and the primary action owning the foot
 * (so no Footer slot, no contact strip, no cart drawer — contact lives on the
 * profile page). Outside Telegram the header grows a back chevron and the
 * primary action becomes an in-page bar.
 */
export function WebAppShell() {
  const { brand, features } = useSettings();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const cartCount = useCartStore(selectCount);
  const openPanel = useUiStore((s) => s.open);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const outletContext = useMemo<ShellSearchContext>(() => ({ search, setSearch }), [search]);
  const native = isTelegramWebApp();
  const barShowing = usePrimaryBarShowing();

  useTelegramChrome();

  const onCatalog = pathname === '/' || pathname.startsWith('/c/');
  const { showCategoryPicker, headerAccountIcon, headerCartIcon } = useCoreOptions();
  const canFilter = onCatalog && !features.wholesale && showCategoryPicker;
  const accountClass = headerIconClass(headerAccountIcon);
  const cartClass = headerIconClass(headerCartIcon);
  const filtered = pathname.startsWith('/c/');
  const showBack = !native && !onCatalog;

  const shellClass = [classes.shell, barShowing ? classes.withBar : '', native ? classes.native : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClass} data-sf-layout="webapp">
      <header className={classes.bar} data-sf-part="header">
        <div className={classes.safeTop} />
        <NoticeBanners pinned />
        <div className={classes.barInner}>
          {showBack ? (
            <button
              type="button"
              className={`${classes.action} ${classes.back}`}
              // A deep link has nothing behind it in this tab: go home, not off the shop.
              onClick={() => (isFirstHistoryEntry() ? navigate('/', { replace: true }) : navigate(-1))}
              aria-label="Back"
            >
              <ChevronIcon size={17} />
            </button>
          ) : null}

          <Link to="/" className={classes.home} aria-label={`${brand.name} — home`}>
            <Brand size="sm" />
          </Link>

          <SearchField className={classes.search} value={search} onChange={setSearch} placeholder="Search" />

          <div className={classes.actions}>
            {canFilter ? (
              <button
                type="button"
                className={classes.action}
                onClick={() => openPanel('filterOpen')}
                aria-label={filtered ? 'Categories — one category selected' : 'Categories'}
              >
                <FilterIcon size={17} />
                {filtered ? <span className={classes.mark} aria-hidden /> : null}
              </button>
            ) : null}

            {features.accounts && accountClass !== null ? (
              <Link
                to={loggedIn || native ? '/account' : '/login'}
                className={`${classes.action} ${accountClass}`}
                aria-label={loggedIn ? 'Your account' : 'Sign in'}
              >
                <UserIcon size={17} />
              </Link>
            ) : null}

            {features.ordering && cartClass !== null ? (
              <Link
                to="/cart"
                className={`${classes.action} ${cartClass}`}
                aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
              >
                <BagIcon size={17} />
                {cartCount > 0 ? <span className={classes.count} data-sf-part="badge">{cartCount}</span> : null}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <NoticeBanners />
      <CutoffBar />

      <main className={classes.main} data-sf-part="main">
        <Suspense fallback={<PageSkeleton inline />}>
          <Outlet context={outletContext} />
        </Suspense>
      </main>

      <PrimaryActionBar />

      {features.accounts && !native ? <LoginModal /> : null}

      <Slot name="Overlay" />
    </div>
  );
}
