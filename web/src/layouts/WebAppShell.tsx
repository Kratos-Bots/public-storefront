import { Suspense, type ReactNode } from 'react';
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
import type { ShellHeaderProps } from '@/layouts/StorefrontShell.tsx';
import { ShellStateContext, useShellState, useShellStateValue } from '@/layouts/shell-context.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
import { Slot } from '@/templates/runtime.tsx';
import { headerIconClass, useCoreOptions } from '@/templates/hooks.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/layouts/WebAppShell.module.css';

/** Telegram owns the top chrome in this layout, so there is never a TopBar slot here. */
export function WebAppHeader({ search: withSearch = true, sticky = true, nav, styleAttrs }: Omit<ShellHeaderProps, 'topBar'>) {
  const { brand, features } = useSettings();
  const { t, tp } = useText();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const cartCount = useCartStore(selectCount);
  const openPanel = useUiStore((s) => s.open);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { search, setSearch } = useShellState();
  const native = isTelegramWebApp();

  const onCatalog = pathname === '/' || pathname.startsWith('/c/');
  const { showCategoryPicker, headerAccountIcon, headerCartIcon } = useCoreOptions();
  const canFilter = onCatalog && !features.wholesale && showCategoryPicker;
  const accountClass = headerIconClass(headerAccountIcon);
  const cartClass = headerIconClass(headerCartIcon);
  const filtered = pathname.startsWith('/c/');
  const showBack = !native && !onCatalog;

  return (
    <header className={sticky ? classes.bar : `${classes.bar} ${classes.unstuck}`} data-sf-part="header" {...styleAttrs}>
      <div className={classes.safeTop} />
      <NoticeBanners pinned />
      <div className={classes.barInner}>
        {showBack ? (
          <button
            type="button"
            className={`${classes.action} ${classes.back}`}
            // A deep link has nothing behind it in this tab: go home, not off the shop.
            onClick={() => (isFirstHistoryEntry() ? navigate('/', { replace: true }) : navigate(-1))}
            aria-label={t('shell.webapp.back')}
          >
            <ChevronIcon size={17} />
          </button>
        ) : null}

        <Link to="/" className={classes.home} aria-label={t('shell.header.homeAriaLabel', { shop: brand.name })}>
          <Brand size="sm" />
        </Link>

        {nav}

        {withSearch ? <SearchField className={classes.search} value={search} onChange={setSearch} placeholder={t('shell.header.searchPlaceholder')} /> : null}

        <div className={classes.actions}>
          {canFilter ? (
            <button
              type="button"
              className={classes.action}
              onClick={() => openPanel('filterOpen')}
              aria-label={filtered ? t('shell.header.categoriesFiltered') : t('shell.header.categories')}
            >
              <FilterIcon size={17} />
              {filtered ? <span className={classes.mark} aria-hidden /> : null}
            </button>
          ) : null}

          {features.accounts && accountClass !== null ? (
            <Link
              to={loggedIn || native ? '/account' : '/login'}
              className={`${classes.action} ${accountClass}`}
              aria-label={loggedIn ? t('common.nav.yourAccount') : t('common.actions.signIn')}
            >
              <UserIcon size={17} />
            </Link>
          ) : null}

          {features.ordering && cartClass !== null ? (
            <Link
              to="/cart"
              className={`${classes.action} ${cartClass}`}
              aria-label={tp('shell.header.cartAriaLabel', cartCount)}
            >
              <BagIcon size={17} />
              {cartCount > 0 ? <span className={classes.count} data-sf-part="badge">{cartCount}</span> : null}
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/** The list column: the routed page, with the shell's search handed down as outlet context. */
export function WebAppMain() {
  const outletContext = useShellState();
  return (
    <main className={classes.main} data-sf-part="main">
      <Suspense fallback={<PageSkeleton inline />}>
        <Outlet context={outletContext} />
      </Suspense>
    </main>
  );
}

/**
 * The web app's root: Telegram chrome wiring, the primary action at the foot (it is
 * this layout's cart bar, so `cartBar` is accepted and ignored), the login modal
 * outside Telegram, and the Overlay slot.
 */
export function WebAppFrame({ children }: { children: ReactNode; cartBar?: boolean }) {
  const { features } = useSettings();
  const native = isTelegramWebApp();
  const barShowing = usePrimaryBarShowing();

  useTelegramChrome();

  const shellClass = [classes.shell, barShowing ? classes.withBar : '', native ? classes.native : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClass} data-sf-layout="webapp">
      {children}

      <PrimaryActionBar />

      {features.accounts && !native ? <LoginModal /> : null}

      <Slot name="Overlay" />
    </div>
  );
}

/**
 * The `webapp` layout: always inside Telegram, and wherever a store picks it.
 * The same list, sheets and template as the menu layout, with Telegram owning
 * the top chrome (so no TopBar slot) and the primary action owning the foot
 * (so no Footer slot, no contact strip, no cart drawer — contact lives on the
 * profile page). Outside Telegram the header grows a back chevron and the
 * primary action becomes an in-page bar.
 * v0.6.0's composition, kept as the parity oracle. Production renders PuckShell.
 */
export function WebAppShell() {
  const state = useShellStateValue();
  return (
    <ShellStateContext.Provider value={state}>
      <WebAppFrame>
        <WebAppHeader />
        <NoticeBanners />
        <CutoffBar />
        <WebAppMain />
      </WebAppFrame>
    </ShellStateContext.Provider>
  );
}
