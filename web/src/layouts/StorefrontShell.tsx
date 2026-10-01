import { Suspense, useMemo, type ReactNode } from 'react';
import { Outlet } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { NoticeBanners } from '@/features/notices/NoticeBanners.tsx';
import { CutoffBar } from '@/features/notices/CutoffBar.tsx';
import { LoginModal } from '@/features/auth/LoginModal.tsx';
import { CartDrawer } from '@/features/cart/CartDrawer.tsx';
import { MobileCartBar, useMobileCartBar } from '@/features/cart/MobileCartBar.tsx';
import { HeaderBar, legacyHeaderSlots } from '@/layouts/header-parts.tsx';
import { ShellFooter } from '@/layouts/ShellFooter.tsx';
import { ShellStateContext, useShellState, useShellStateValue } from '@/layouts/shell-context.ts';
import { Slot } from '@/templates/runtime.tsx';
import classes from '@/layouts/StorefrontShell.module.css';
import type { StyleAttrs } from '@/builder/define.ts';

export interface ShellHeaderProps {
  /** The template TopBar slot above the header (default on). */
  topBar?: boolean;
  /** The centre search field (default on; CSS still hides it below 62em). */
  search?: boolean;
  /** Sticky to the top of the viewport (default on). */
  sticky?: boolean;
  /** Rendered between the home link and the search field — the Header block's nav slot. */
  nav?: ReactNode;
  /** A styled Header block's attributes (block-styling spec §4 `pass`), spread onto <header>. */
  styleAttrs?: StyleAttrs;
}

/** TopBar slot + the header bar: the Header container's default arrangement (v0.7.0 markup). */
export function StorefrontHeader({ topBar = true, search: withSearch = true, sticky = true, nav, styleAttrs }: ShellHeaderProps) {
  const slots = useMemo(() => legacyHeaderSlots('storefront', withSearch, nav), [withSearch, nav]);
  return <HeaderBar variant="storefront" topBar={topBar} sticky={sticky} slots={slots} styleAttrs={styleAttrs} />;
}

/** The content column: the routed page, with the shell's search handed down as outlet context. */
export function StorefrontMain() {
  const outletContext = useShellState();
  return (
    <main className={classes.main} data-sf-part="main">
      <Suspense fallback={<PageSkeleton inline />}>
        <Outlet context={outletContext} />
      </Suspense>
    </main>
  );
}

/** The shell root and the system mounts that sit after the page chrome (spec §5.4). */
export function StorefrontFrame({ children, cartBar = true }: { children: ReactNode; cartBar?: boolean }) {
  const { features } = useSettings();
  // The tab is fixed to the foot of the phone; the shell owes it the clearance.
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
 * The image-led shell: header, notice + dispatch rails, content column, footer.
 * v0.6.0's composition, kept verbatim as the parity oracle for the builder's
 * default shell document (test/builder-shell.test.tsx) — production renders PuckShell.
 */
export function StorefrontShell() {
  const state = useShellStateValue();
  return (
    <ShellStateContext.Provider value={state}>
      <StorefrontFrame>
        <StorefrontHeader />
        <NoticeBanners />
        <CutoffBar />
        <StorefrontMain />
        <ShellFooter />
      </StorefrontFrame>
    </ShellStateContext.Provider>
  );
}
