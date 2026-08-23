import { Suspense, useMemo, useState } from 'react';
import { Link, Outlet } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { useCartStore, selectCount } from '@/stores/cart.ts';
import { Brand } from '@/components/Brand.tsx';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { BagIcon, UserIcon } from '@/components/icons.tsx';
import { NoticeBanners } from '@/features/notices/NoticeBanners.tsx';
import { CutoffBar } from '@/features/notices/CutoffBar.tsx';
import { CartDrawer } from '@/features/cart/CartDrawer.tsx';
import { MobileCartBar, useMobileCartBar } from '@/features/cart/MobileCartBar.tsx';
import { SearchField } from '@/layouts/SearchField.tsx';
import type { ShellSearchContext } from '@/layouts/shell-context.ts';
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

  return (
    <div className={barShowing ? `${classes.shell} ${classes.withBar}` : classes.shell}>
      <header className={classes.header}>
        <div className={classes.headerInner}>
          <Link to="/" className={classes.home} aria-label={`${brand.name} — home`}>
            <Brand size="md" />
          </Link>

          <SearchField className={classes.search} value={search} onChange={setSearch} />

          <div className={classes.actions}>
            {features.accounts ? (
              loggedIn ? (
                <Link to="/account" className={classes.action} aria-label="Your account">
                  <UserIcon size={18} />
                </Link>
              ) : (
                <Link to="/login" className={classes.signIn}>
                  Sign in
                </Link>
              )
            ) : null}

            {features.ordering ? (
              <Link
                to="/cart"
                className={classes.action}
                aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
              >
                <BagIcon size={18} />
                {cartCount > 0 ? <span className={classes.count}>{cartCount}</span> : null}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <NoticeBanners />
      <CutoffBar />

      <main className={classes.main}>
        <Suspense fallback={<PageSkeleton inline />}>
          <Outlet context={outletContext} />
        </Suspense>
      </main>

      <footer className={classes.footer}>
        <div className={classes.footerInner}>
          <div className={classes.footerBrand}>
            <Brand size="sm" />
            {brand.tagline ? <p className={classes.tagline}>{brand.tagline}</p> : null}
          </div>

          {supportLinks.length > 0 ? (
            <nav aria-label="Support">
              <h2 className={classes.footerHead}>Support</h2>
              <ul className={classes.footerList}>
                {supportLinks.map((link) => (
                  <li key={link.url}>
                    <a
                      className={classes.footerLink}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          {hasChat ? (
            <div>
              <h2 className={classes.footerHead}>Talk to us</h2>
              <ContactLinks />
            </div>
          ) : null}
        </div>

        <div className={classes.colophon}>
          <span>{brand.name}</span>
          <span>{new Date().getFullYear()}</span>
        </div>
      </footer>

      {features.ordering ? (
        <>
          <CartDrawer />
          <MobileCartBar />
        </>
      ) : null}
    </div>
  );
}
