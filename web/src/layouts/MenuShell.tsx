import type { StyleAttrs } from '@/builder/define.ts';
import { Suspense, useMemo, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useCartStore, selectCount } from '@/stores/cart.ts';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { NoticeBanners } from '@/features/notices/NoticeBanners.tsx';
import { CutoffBar } from '@/features/notices/CutoffBar.tsx';
import { LoginModal } from '@/features/auth/LoginModal.tsx';
import { CartDrawer, useCartDrawerReady } from '@/features/cart/CartDrawer.tsx';
import { MobileCartBar, useMobileCartBar } from '@/features/cart/MobileCartBar.tsx';
import { HeaderBar, legacyHeaderSlots } from '@/layouts/header-parts.tsx';
import { ShellFooter } from '@/layouts/ShellFooter.tsx';
import type { ShellHeaderProps } from '@/layouts/StorefrontShell.tsx';
import { ShellStateContext, useShellState, useShellStateValue } from '@/layouts/shell-context.ts';
import { Slot } from '@/templates/runtime.tsx';
import classes from '@/layouts/MenuShell.module.css';

const onCatalogPath = (pathname: string) => pathname === '/' || pathname.startsWith('/c/');

/** TopBar slot + the one compact bar: the Header container's default arrangement (v0.7.0 markup). */
export function MenuHeader({ topBar = true, search: withSearch = true, sticky = true, nav, styleAttrs }: ShellHeaderProps) {
  const slots = useMemo(() => legacyHeaderSlots('menu', withSearch, nav), [withSearch, nav]);
  return <HeaderBar variant="menu" topBar={topBar} sticky={sticky} slots={slots} styleAttrs={styleAttrs} />;
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
export function MenuContactStrip({ catalogOnly = true, styleAttrs }: { catalogOnly?: boolean; styleAttrs?: StyleAttrs }) {
  const { features } = useSettings();
  const cartCount = useCartStore(selectCount);
  const { pathname } = useLocation();
  const barShowing = useMobileCartBar();
  const show = (!catalogOnly || onCatalogPath(pathname)) && !barShowing && !(features.wholesale && cartCount > 0);
  return show ? <ContactLinks variant="strip" styleAttrs={styleAttrs} /> : null;
}

/** The shell root and the system mounts that sit after the page chrome (spec §5.4). */
export function MenuFrame({ children, cartBar = true }: { children: ReactNode; cartBar?: boolean }) {
  const { features } = useSettings();
  const drawerReady = useCartDrawerReady();
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

      {/* After the drawer's panel, so the portal roots keep v0.7.0's order. */}
      {features.accounts && (!features.ordering || drawerReady) ? <LoginModal /> : null}

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
