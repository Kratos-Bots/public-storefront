import { Suspense, useMemo, type ReactNode } from 'react';
import { Outlet } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { NoticeBanners } from '@/features/notices/NoticeBanners.tsx';
import { CutoffBar } from '@/features/notices/CutoffBar.tsx';
import { LoginModal } from '@/features/auth/LoginModal.tsx';
import { PrimaryActionBar, usePrimaryBarShowing } from '@/features/webapp/PrimaryActionBar.tsx';
import { useTelegramChrome } from '@/features/webapp/useTelegramChrome.ts';
import { HeaderBar, legacyHeaderSlots } from '@/layouts/header-parts.tsx';
import type { ShellHeaderProps } from '@/layouts/StorefrontShell.tsx';
import { ShellStateContext, useShellState, useShellStateValue } from '@/layouts/shell-context.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
import { Slot } from '@/templates/runtime.tsx';
import classes from '@/layouts/WebAppShell.module.css';

/** Telegram owns the top chrome in this layout, so there is never a TopBar slot here. */
export function WebAppHeader({ search: withSearch = true, sticky = true, nav, styleAttrs }: Omit<ShellHeaderProps, 'topBar'>) {
  const slots = useMemo(() => legacyHeaderSlots('webapp', withSearch, nav), [withSearch, nav]);
  return <HeaderBar variant="webapp" topBar={false} sticky={sticky} slots={slots} styleAttrs={styleAttrs} />;
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
