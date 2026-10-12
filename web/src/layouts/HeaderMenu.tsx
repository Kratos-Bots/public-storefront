import { useEffect, useState } from 'react';
import { Drawer } from '@mantine/core';
import { useMediaQuery, useReducedMotion } from '@mantine/hooks';
import { Link, useLocation } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { isPreviewMode } from '@/app/preview-listener.ts';
import { CloseIcon, MenuIcon } from '@/components/icons.tsx';
import { useFaqAvailable } from '@/features/faq/use-faq-available.ts';
import { reviewSettingsOf } from '@/features/reviews/settings.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
import { HeaderFamily } from '@/builder/family-header.ts';
import { useBottomNavShown } from '@/layouts/bottom-nav-rules.ts';
import { MENU_LINKS, type MenuContext } from '@/layouts/menu-links.ts';
import { useCoreOptions } from '@/templates/hooks.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/layouts/HeaderMenu.module.css';

/** Mantine's `md` breakpoint: from here the header carries everything and the menu stands down. */
const DESKTOP = '(min-width: 62em)';

/**
 * The header's menu: a button at the right end of the phone header that opens a panel of the shop's pages
 * (`MENU_LINKS`). A system mount of the header bar, like the Reviews link: not a part an owner places, so every header
 * (a published one included) carries it. Phones only (it is not rendered at 62em and wider, where the header holds the
 * links itself), and not drawn in the page builder's canvas or in previews.
 *
 * The panel is Mantine's Drawer, the same focus trap, Escape, scroll lock and scrim as the shop's other sheets, set to
 * slide in from the right. Navigating (or choosing the page you are already on) closes it.
 */
export function HeaderMenu() {
  const { showHeaderMenu } = useCoreOptions();
  // Read synchronously: a deferred match would flash the button on a desktop first paint.
  const desktop = useMediaQuery(DESKTOP, false, { getInitialValueInEffect: false });
  if (!showHeaderMenu || desktop || isBuilderMode() || isPreviewMode()) return null;
  return <Menu />;
}

function Menu() {
  const settings = useSettings();
  const { t } = useText();
  const { pathname } = useLocation();
  const { variant, classes: header, loggedIn, native } = HeaderFamily.useData();
  const reducedMotion = useReducedMotion();
  const [opened, setOpened] = useState(false);
  // With the bottom bar off, the header may still hold Account and Cart beside the search: see `.crowded`. Only a button
  // that is really drawn on a phone counts (the shop's switches and the icon options can hide either).
  const barShown = useBottomNavShown();
  const { headerAccountIcon, headerCartIcon } = useCoreOptions();
  const onPhone = (mode: string) => mode === 'all' || mode === 'mobile';
  const holdsButtons = (settings.features.accounts && onPhone(headerAccountIcon)) || (settings.features.ordering && onPhone(headerCartIcon));
  const close = () => setOpened(false);

  // Any navigation (a link in the panel, the browser's back button) leaves the panel behind.
  useEffect(() => setOpened(false), [pathname]);

  const faq = useFaqAvailable();
  const ctx: MenuContext = {
    reviews: reviewSettingsOf(settings).enabled,
    faq,
    accounts: settings.features.accounts,
    loggedIn,
    // Where the header's own Account button sends a signed-out visitor.
    signInTo: variant === 'webapp' && native ? '/account' : '/login',
  };
  const links = MENU_LINKS.filter((l) => !l.when || l.when(ctx));
  const inTelegram = isTelegramWebApp();

  return (
    <>
      <button
        type="button"
        className={!barShown && holdsButtons ? `${header.action} ${classes.button} ${classes.crowded}` : `${header.action} ${classes.button}`}
        onClick={() => setOpened(true)}
        aria-label={t('shell.menu.open')}
        aria-haspopup="dialog"
        aria-expanded={opened}
        data-sf-part="header-menu"
      >
        <MenuIcon size={20} />
      </button>
      <Drawer.Root
        opened={opened}
        onClose={close}
        position="right"
        size="min(20rem, 86vw)"
        padding={0}
        returnFocus
        classNames={{ content: inTelegram ? `${classes.panel} ${classes.telegram}` : classes.panel }}
        // Compound Drawer parts do not read the theme's Drawer defaults (see components/Sheet.tsx): repeat them here.
        transitionProps={{ duration: reducedMotion ? 0 : 280, timingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
      >
        <Drawer.Overlay backgroundOpacity={0.7} blur={2} />
        <Drawer.Content data-sf-part="menu-panel">
          <div className={classes.head}>
            <Drawer.Title className={classes.title}>{t('shell.menu.title')}</Drawer.Title>
            <button type="button" className={classes.close} onClick={close} aria-label={t('shell.menu.close')}>
              <CloseIcon size={16} />
            </button>
          </div>
          <nav className={classes.nav} aria-label={t('shell.menu.title')}>
            <ul className={classes.list}>
              {links.map(({ key, to, label, Icon, current }) => {
                const href = typeof to === 'function' ? to(ctx) : to;
                const isCurrent = current ? current(pathname) : pathname === href;
                return (
                  <li key={key}>
                    <Link to={href} className={classes.item} aria-current={isCurrent ? 'page' : undefined} onClick={close} data-sf-menu={key}>
                      {Icon ? <Icon size={19} /> : null}
                      <span className={classes.label}>{t(label)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </Drawer.Content>
      </Drawer.Root>
    </>
  );
}
