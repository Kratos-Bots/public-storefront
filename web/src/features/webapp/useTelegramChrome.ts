import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useCartStore, selectCount } from '@/stores/cart.ts';
import {
  haptic,
  isTelegramWebApp,
  setBackButton,
  setChromeColors,
  setClosingConfirmation,
  setVerticalSwipes,
  tgExpand,
  tgReady,
  watchSafeAreas,
} from '@/lib/telegram-webapp.ts';

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/**
 * Whether this is the first entry of the tab's history (react-router keeps its
 * own index in `history.state`). A page opened straight onto a deep link has
 * nothing behind it, so "back" must go home rather than leave the shop.
 */
export function isFirstHistoryEntry(): boolean {
  return (window.history.state as { idx?: number } | null)?.idx === 0;
}

/**
 * Everything the Mini App asks of Telegram's chrome. All of it is a no-op in a
 * browser (Task 1's adapter), so the shell calls this unconditionally.
 *
 * Colours come from the shop's resolved CSS variables — the template has
 * already turned the saved theme into them — and never from `themeParams`:
 * the Mini App is on brand whatever theme the shopper's Telegram uses.
 */
export function useTelegramChrome(): void {
  const { theme } = useSettings();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const count = useCartStore(selectCount);
  const lastCount = useRef(count);

  useEffect(() => {
    tgReady();
    tgExpand();
    // Swipe-down-to-close fights every scrolling sheet and list in the shop.
    setVerticalSwipes(false);
    const stop = watchSafeAreas();
    return () => {
      stop();
      setVerticalSwipes(true);
    };
  }, []);

  // Re-applied when the theme changes (a settings refetch). The document theme
  // is written by an effect above the router, which on the mounting commit runs
  // after this one, so the variables are read a tick later.
  useEffect(() => {
    if (!isTelegramWebApp()) return;
    const timer = window.setTimeout(() => {
      const bg = cssVar('--sf-bg', '#000000');
      setChromeColors({ header: bg, background: bg, bottomBar: cssVar('--sf-surface', bg) });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [theme]);

  useEffect(() => {
    if (pathname === '/') {
      setBackButton(null);
      return;
    }
    setBackButton(() => (isFirstHistoryEntry() ? navigate('/', { replace: true }) : navigate(-1)));
  }, [pathname, navigate]);

  useEffect(() => () => setBackButton(null), []);

  // Half-filled checkout: ask before the swipe/close throws it away.
  useEffect(() => {
    setClosingConfirmation(pathname === '/checkout');
    return () => setClosingConfirmation(false);
  }, [pathname]);

  useEffect(() => {
    if (count > lastCount.current && isTelegramWebApp()) haptic.impact('light');
    lastCount.current = count;
  }, [count]);
}
