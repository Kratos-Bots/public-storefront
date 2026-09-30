import { Suspense, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { useCartStore, selectCount } from '@/stores/cart.ts';
import { useUiStore } from '@/stores/ui.ts';
import { Brand } from '@/components/Brand.tsx';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { BagIcon, FilterIcon, UserIcon } from '@/components/icons.tsx';
import { NoticeBanners } from '@/features/notices/NoticeBanners.tsx';
import { CutoffBar } from '@/features/notices/CutoffBar.tsx';
import { LoginModal } from '@/features/auth/LoginModal.tsx';
import { CartDrawer } from '@/features/cart/CartDrawer.tsx';
import { MobileCartBar, useMobileCartBar } from '@/features/cart/MobileCartBar.tsx';
import { SearchField } from '@/layouts/SearchField.tsx';
import { ShellFooter } from '@/layouts/ShellFooter.tsx';
import type { ShellHeaderProps } from '@/layouts/StorefrontShell.tsx';
import { ShellStateContext, useShellState, useShellStateValue } from '@/layouts/shell-context.ts';
import { Slot } from '@/templates/runtime.tsx';
import { headerIconClass, useCoreOptions } from '@/templates/hooks.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/layouts/MenuShell.module.css';

const onCatalogPath = (pathname: string) => pathname === '/' || pathname.startsWith('/c/');

/** TopBar slot + the one compact bar. */
export function MenuHeader({ topBar = true, search: withSearch = true, sticky = true, nav, styleAttrs }: ShellHeaderProps) {
  const { brand, features } = useSettings();
  const { t, tp } = useText();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const cartCount = useCartStore(selectCount);
  const openPanel = useUiStore((s) => s.open);
  const { pathname } = useLocation();
  const { search, setSearch } = useShellState();
  const onCatalog = onCatalogPath(pathname);
  // Only the catalogue body carries the sheet this button opens — wholesale replaces
  // it, so the button would have nothing to show.
  const { showCategoryPicker, headerAccountIcon, headerCartIcon } = useCoreOptions();
  const canFilter = onCatalog && !features.wholesale && showCategoryPicker;
  const accountClass = headerIconClass(headerAccountIcon);
  const cartClass = headerIconClass(headerCartIcon);
  // A category in the path is the only filter this layout has — the dot says one is on.
  const filtered = pathname.startsWith('/c/');

  return (
    <>
      {topBar ? <Slot name="TopBar" /> : null}
      <header className={sticky ? classes.bar : `${classes.bar} ${classes.unstuck}`} data-sf-part="header" {...styleAttrs}>
        <NoticeBanners pinned />
        <div className={classes.barInner}>
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
                to={loggedIn ? '/account' : '/login'}
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
    </>
  );
}

/** The narrow list column: the routed page, with the shell's search handed down as outlet context. */
export function MenuMain() {
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
 * The contact strip at the foot. A running tab claims the foot as soon as there is
 * something on the order — the wholesale sheet's own sticky tab, or the cart bar on a
 * phone — and both bands want `bottom: 0`. The tab wins, the way it replaces the
 * contact strip in the chat menu this layout is ported from.
 */
export function MenuContactStrip({ catalogOnly = true }: { catalogOnly?: boolean }) {
  const { features } = useSettings();
  const cartCount = useCartStore(selectCount);
  const { pathname } = useLocation();
  const barShowing = useMobileCartBar();
  const show = (!catalogOnly || onCatalogPath(pathname)) && !barShowing && !(features.wholesale && cartCount > 0);
  return show ? <ContactLinks variant="strip" /> : null;
}

/** The shell root and the system mounts that sit after the page chrome (spec §5.4). */
export function MenuFrame({ children, cartBar = true }: { children: ReactNode; cartBar?: boolean }) {
  const { features } = useSettings();
  const barShowing = useMobileCartBar();
  return (
    <div className={barShowing ? `${classes.shell} ${classes.withBar}` : classes.shell}>
      {children}

      {features.ordering ? (
        <>
          <CartDrawer />
          {cartBar ? <MobileCartBar /> : null}
        </>
      ) : null}

      {features.accounts ? <LoginModal /> : null}

      <Slot name="Overlay" />
    </div>
  );
}

/**
 * The dense shell: one compact bar, a narrow list column, contact strip at the foot
 * of the catalog. v0.6.0's composition, kept as the parity oracle. Production renders PuckShell.
 */
export function MenuShell() {
  const state = useShellStateValue();
  return (
    <ShellStateContext.Provider value={state}>
      <MenuFrame>
        <MenuHeader />
        <NoticeBanners />
        <CutoffBar />
        <MenuMain />
        <ShellFooter />
        <MenuContactStrip />
      </MenuFrame>
    </ShellStateContext.Provider>
  );
}
