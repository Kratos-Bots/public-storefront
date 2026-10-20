import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useMediaQuery } from '@mantine/hooks';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { isPreviewMode } from '@/app/preview-listener.ts';
import { useMobileCartBar } from '@/features/cart/MobileCartBar.tsx';
import { readLastShown, shouldShowInvite, writeLastShown } from '@/features/push/invite-rules.ts';
import { useSettings } from '@/app/settings.ts';
import { useTurnOn } from '@/features/push/PushOptIn.tsx';
import { usePush } from '@/features/push/usePush.ts';
import { bottomNavAllowedOn } from '@/layouts/bottom-nav-rules.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/push/Push.module.css';

/** Mantine's `md` breakpoint: from here the shop is a desktop layout and the invitation stands down. */
const DESKTOP = '(min-width: 62em)';

/**
 * "Get order updates on this phone": a one-off invitation for a signed-in phone shopper whose browser can take
 * push, back at most every 7 days. The time is stored the moment it goes up, so a reload and either button count
 * as seen. It waits for the browser's own subscription to be read (never invite someone already subscribed) and
 * for any open sheet or dialog to close, and it stays off the pages the bottom bar avoids (checkout, payment, sign-in).
 */
function Banner() {
  const { t } = useText();
  const push = usePush();
  const { pathname } = useLocation();
  const desktop = useMediaQuery(DESKTOP, false, { getInitialValueInEffect: false });
  const coarse = useMediaQuery('(pointer: coarse)', false, { getInitialValueInEffect: false });
  const barShowing = useMobileCartBar();
  const { turnOn, guide } = useTurnOn(push);
  const [shown, setShown] = useState(false);
  const [gone, setGone] = useState(false);

  const isPhone = !desktop && coarse;
  const pathAllowed = bottomNavAllowedOn(pathname);
  const { availability, subscribed, settled } = push;

  useEffect(() => {
    if (shown || gone || !settled || isBuilderMode() || isPreviewMode()) return;
    const now = Date.now();
    // Mantine's Drawer and Modal both mount a role="dialog" while open: the cheapest signal that covers every sheet,
    // the cart drawer and the pop-ups without each of them reporting in. It is read when the decision is made.
    const sheetOpen = document.querySelector('[role="dialog"]') !== null;
    if (!shouldShowInvite({ availability, subscribed, isPhone, pathAllowed, lastShownAt: readLastShown(), now, sheetOpen })) return;
    writeLastShown(now);
    setShown(true);
  }, [shown, gone, settled, availability, subscribed, isPhone, pathAllowed]);

  const offered = availability === 'ready' || availability === 'needs-install';
  const visible = shown && !gone && offered && !subscribed && pathAllowed;

  // Either answer ends the invitation: iOS Safari gets the guide sheet (rendered below, outside the banner), elsewhere the browser asks.
  const accept = async () => {
    await turnOn();
    setGone(true);
  };

  return (
    <>
      {visible ? (
        <section className={barShowing ? `${classes.banner} ${classes.bannerAboveBar}` : classes.banner} aria-label={t('notices.pushInvite.aria')}>
          <p className={classes.message}>{t('notices.pushInvite.message')}</p>
          <div className={classes.buttons}>
            <button type="button" className={classes.primary} data-sf-part="button" data-variant="filled" onClick={() => void accept()}>
              {t('notices.pushInvite.turnOn')}
            </button>
            <button type="button" className={classes.secondary} onClick={() => setGone(true)}>
              {t('notices.pushInvite.notNow')}
            </button>
          </div>
        </section>
      ) : null}
      {guide}
    </>
  );
}

/** Mounted by the shop frames; the whole thing (hooks, queries, listeners) stays out until the shop has push. */
export function PushInviteBanner() {
  return useSettings().push?.enabled === true ? <Banner /> : null;
}
