import { Suspense, useMemo, useState } from 'react';
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
import { SearchField } from '@/layouts/SearchField.tsx';
import type { ShellSearchContext } from '@/layouts/shell-context.ts';
import classes from '@/layouts/MenuShell.module.css';

/** The dense shell: one compact bar, a narrow list column, contact strip at the foot of the catalog. */
export function MenuShell() {
  const { brand, features } = useSettings();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const cartCount = useCartStore(selectCount);
  const openPanel = useUiStore((s) => s.open);
  const { pathname } = useLocation();
  const [search, setSearch] = useState('');
  const outletContext = useMemo<ShellSearchContext>(() => ({ search, setSearch }), [search]);
  const onCatalog = pathname === '/' || pathname.startsWith('/c/');
  // Only the catalogue body carries the sheet this button opens — wholesale replaces
  // it, so the button would have nothing to show.
  const canFilter = onCatalog && !features.wholesale;
  // A category in the path is the only filter this layout has — the dot says one is on.
  const filtered = pathname.startsWith('/c/');

  return (
    <div className={classes.shell}>
      <header className={classes.bar}>
        <div className={classes.barInner}>
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

            {features.accounts ? (
              <Link
                to={loggedIn ? '/account' : '/login'}
                className={classes.action}
                aria-label={loggedIn ? 'Your account' : 'Sign in'}
              >
                <UserIcon size={17} />
              </Link>
            ) : null}

            {features.ordering ? (
              <Link
                to="/cart"
                className={classes.action}
                aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
              >
                <BagIcon size={17} />
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

      {onCatalog ? <ContactLinks variant="strip" /> : null}
    </div>
  );
}
