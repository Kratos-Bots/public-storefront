import { Suspense, useMemo, useState } from 'react';
import { Link, Outlet } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { useCartStore, selectCount } from '@/stores/cart.ts';
import { Brand } from '@/components/Brand.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { BagIcon, UserIcon } from '@/components/icons.tsx';
import { NoticeBanners } from '@/features/notices/NoticeBanners.tsx';
import { CutoffBar } from '@/features/notices/CutoffBar.tsx';
import { LoginModal } from '@/features/auth/LoginModal.tsx';
import { CartDrawer } from '@/features/cart/CartDrawer.tsx';
import { MobileCartBar, useMobileCartBar } from '@/features/cart/MobileCartBar.tsx';
import { SearchField } from '@/layouts/SearchField.tsx';
import type { ShellSearchContext } from '@/layouts/shell-context.ts';
import { Slot } from '@/templates/runtime.tsx';
import { headerIconClass, useCoreOptions } from '@/templates/hooks.ts';
import classes from '@/layouts/StorefrontShell.module.css';

/** The image-led shell: header, notice + dispatch rails, content column, footer. */
export function StorefrontShell() {
  const { brand, features, supportLinks } = useSettings();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const cartCount = useCartStore(selectCount);
  const [search, setSearch] = useState('');
  const outletContext = useMemo<ShellSearchContext>(() => ({ search, setSearch }), [search]);
  const hasChat = !!(brand.links.whatsapp || brand.links.telegram);
  // The tab is fixed to the foot of the phone; the shell owes it the clearance.
  const barShowing = useMobileCartBar();
  const { headerAccountIcon, headerCartIcon } = useCoreOptions();
  const accountClass = headerIconClass(headerAccountIcon);
  const cartClass = headerIconClass(headerCartIcon);

  return (
    <div className={barShowing ? `${classes.shell} ${classes.withBar}` : classes.shell}>
      <Slot name="TopBar" />
      <header className={classes.header} data-sf-part="header">
        <NoticeBanners pinned />
        <div className={classes.headerInner}>
          <Link to="/" className={classes.home} aria-label={`${brand.name} — home`}>
            <Brand size="md" />
          </Link>

          <SearchField className={classes.search} value={search} onChange={setSearch} />

          <div className={classes.actions}>
            {features.accounts && accountClass !== null ? (
              loggedIn ? (
                <Link to="/account" className={`${classes.action} ${accountClass}`} aria-label="Your account">
                  <UserIcon size={18} />
                </Link>
              ) : (
                <Link to="/login" className={`${classes.signIn} ${accountClass}`}>
                  Sign in
                </Link>
              )
            ) : null}

            {features.ordering && cartClass !== null ? (
              <Link
                to="/cart"
                className={`${classes.action} ${cartClass}`}
                aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
              >
                <BagIcon size={18} />
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

      <Slot name="Footer" supportLinks={supportLinks} hasChat={hasChat} />

      {features.ordering ? (
        <>
          <CartDrawer />
          <MobileCartBar />
        </>
      ) : null}

      {features.accounts ? <LoginModal /> : null}

      <Slot name="Overlay" />
    </div>
  );
}
