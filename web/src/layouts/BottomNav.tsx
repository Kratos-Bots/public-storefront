import { useLayoutEffect, useRef, type ComponentType } from 'react';
import { Link, useLocation } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useEffectiveLayout } from '@/app/layout.ts';
import { BagIcon, FaqIcon, HelpIcon, HomeIcon, StarIcon, UserIcon, type GlyphProps } from '@/components/icons.tsx';
import { useFaqAvailable } from '@/features/faq/use-faq-available.ts';
import { reviewSettingsOf } from '@/features/reviews/settings.ts';
import { useModalOpen } from '@/lib/use-modal-open.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { useCartStore, selectCount } from '@/stores/cart.ts';
import { useText } from '@/text/runtime.tsx';
import { useBottomNavShown } from '@/layouts/bottom-nav-rules.ts';
import classes from '@/layouts/BottomNav.module.css';

interface Item {
  key: string;
  to: string;
  label: string;
  Icon: ComponentType<GlyphProps>;
  active: boolean;
  badge?: number;
  ariaLabel?: string;
}

/**
 * The phone's bottom navigation: Catalog, Profile, Cart, Reviews, then FAQ (Support while the shop has no FAQ), in a bar fixed to the foot of the screen.
 * Mounted once by each frame, so it needs no placement of its own. It publishes its measured height (safe area
 * included) as `--sf-nav-h` on the root, 0 whenever it is not on the page, and every other bottom element — the
 * cart bars, the wholesale bar, the contact strip, the shells' clearance — adds that value.
 *
 * `inset` says where the bar sits: `page` clears the browser's home-indicator inset; `webapp` is the Mini App's
 * browser stand-in (that inset plus Telegram's). Inside Telegram only `--tg-safe-bottom` counts, whatever the layout,
 * because `env(safe-area-inset-bottom)` would count the notch twice. `coverUnderDialog` hides it behind a dialog the
 * way the web app's own bars do, keeping the space it holds so the page does not shift.
 */
export function BottomNav({ inset = 'page', coverUnderDialog = false }: { inset?: 'page' | 'webapp'; coverUnderDialog?: boolean }) {
  const { pathname } = useLocation();
  if (!useBottomNavShown()) return null;
  return <Bar pathname={pathname} inset={inset} coverUnderDialog={coverUnderDialog} />;
}

function Bar({ pathname, inset, coverUnderDialog }: { pathname: string; inset: 'page' | 'webapp'; coverUnderDialog: boolean }) {
  const settings = useSettings();
  const { features } = settings;
  const { t, tp } = useText();
  const layout = useEffectiveLayout();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const count = useCartStore(selectCount);
  const modalOpen = useModalOpen();
  const ref = useRef<HTMLElement>(null);
  const native = isTelegramWebApp();

  useLayoutEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) return undefined;
    const publish = () => root.style.setProperty('--sf-nav-h', `${el.getBoundingClientRect().height}px`);
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty('--sf-nav-h');
    };
  }, []);

  const reviews = reviewSettingsOf(settings).enabled;
  const faq = useFaqAvailable();
  // Inside Telegram the web app layout has no sign-in page: the account is already there (as in the header).
  const profileTo = loggedIn || (layout === 'webapp' && native) ? '/account/profile' : '/login';
  const items: Item[] = [
    { key: 'catalog', to: '/', label: t('shell.bottomNav.catalog'), Icon: HomeIcon, active: pathname === '/' || pathname.startsWith('/c/') || pathname.startsWith('/p/') },
    ...(features.accounts
      ? [{ key: 'profile', to: profileTo, label: t('shell.bottomNav.profile'), Icon: UserIcon, active: pathname.startsWith('/account') }]
      : []),
    ...(features.ordering
      ? [{
          key: 'cart', to: '/cart', label: t('shell.bottomNav.cart'), Icon: BagIcon, active: pathname === '/cart', badge: count,
          ariaLabel: count > 0 ? tp('shell.header.cartAriaLabel', count) : undefined,
        }]
      : []),
    ...(reviews ? [{ key: 'reviews', to: '/reviews', label: t('shell.bottomNav.reviews'), Icon: StarIcon, active: pathname === '/reviews' }] : []),
    // FAQ takes Support's place while the shop has one (Support stays in the header menu); otherwise Support, as ever.
    faq
      ? { key: 'faq', to: '/faq', label: t('shell.bottomNav.faq'), Icon: FaqIcon, active: pathname === '/faq' }
      : { key: 'support', to: '/support', label: t('shell.bottomNav.support'), Icon: HelpIcon, active: pathname === '/support' || pathname.startsWith('/support/') },
  ];

  const cls = [classes.nav, native ? classes.telegram : inset === 'webapp' ? classes.webapp : '', coverUnderDialog && modalOpen ? classes.covered : '']
    .filter(Boolean)
    .join(' ');

  return (
    <nav ref={ref} className={cls} aria-label={t('shell.bottomNav.ariaLabel')} data-sf-part="bottom-nav">
      <ul className={classes.list}>
        {items.map(({ key, to, label, Icon, active, badge, ariaLabel }) => (
          <li key={key} className={classes.cell}>
            <Link
              to={to}
              className={classes.item}
              aria-current={active ? 'page' : undefined}
              aria-label={ariaLabel}
              data-sf-nav={key}
            >
              <span className={classes.icon}>
                <Icon size={21} />
                {badge ? <span className={classes.badge} data-sf-part="badge" aria-hidden>{badge}</span> : null}
              </span>
              <span className={classes.label}>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
