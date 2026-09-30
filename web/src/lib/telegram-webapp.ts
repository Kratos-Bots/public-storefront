/**
 * The one door to Telegram's Mini App SDK. Everything Telegram-specific the app
 * does goes through here, and every function is a silent no-op outside
 * Telegram, so callers never branch on "are we in Telegram" just to stay safe.
 *
 * The SDK is only loaded on a Telegram launch (`loadTelegramSdk`), so an
 * ordinary browser never waits on telegram.org. Methods are version-gated with
 * the client's own `isVersionAtLeast`, and each call is wrapped: older clients
 * throw on methods they don't know, and a decoration must never take the shop
 * down with it.
 */

import { isBuilderMode } from '@/app/builder-gate.ts';

export const TELEGRAM_SDK_SRC = 'https://telegram.org/js/telegram-web-app.js';

type Insets = { top?: number; bottom?: number; left?: number; right?: number };

interface TgBottomButton {
  setParams(p: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }): unknown;
  showProgress(leaveActive?: boolean): unknown;
  hideProgress(): unknown;
  hide(): unknown;
  onClick(cb: () => void): unknown;
  offClick(cb: () => void): unknown;
}

interface TgWebApp {
  initData: string;
  version: string;
  isVersionAtLeast(version: string): boolean;
  ready(): void;
  expand(): void;
  close(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor?(color: string): void;
  MainButton: TgBottomButton;
  BackButton: { show(): unknown; hide(): unknown; onClick(cb: () => void): unknown; offClick(cb: () => void): unknown };
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy'): unknown;
    notificationOccurred(type: 'success' | 'error' | 'warning'): unknown;
  };
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  enableVerticalSwipes?(): void;
  disableVerticalSwipes?(): void;
  openLink(url: string): void;
  onEvent(event: string, cb: () => void): void;
  offEvent(event: string, cb: () => void): void;
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

/** The SDK object, but only when Telegram actually launched us: the script
 *  defines `WebApp` in any browser, and empty `initData` means "not in Telegram". */
function webApp(): TgWebApp | null {
  if (typeof window === 'undefined') return null;
  const wa = window.Telegram?.WebApp;
  return wa && typeof wa.initData === 'string' && wa.initData.length > 0 ? wa : null;
}

function supports(wa: TgWebApp, version: string): boolean {
  try {
    return wa.isVersionAtLeast(version);
  } catch {
    return false;
  }
}

/** Runs `fn` inside Telegram on a client at least `min` (null = any version). */
function run(min: string | null, fn: (wa: TgWebApp) => void): void {
  const wa = webApp();
  if (!wa || (min && !supports(wa, min))) return;
  try {
    fn(wa);
  } catch {
    // An older client that doesn't know this method — Telegram throws rather than ignoring.
  }
}

export function looksLikeTelegramLaunch(): boolean {
  if (typeof window === 'undefined') return false;
  if (/(^#|&)tgWebAppData=/.test(window.location.hash)) return true;
  try {
    return sessionStorage.getItem('__telegram__initParams') !== null;
  } catch {
    return false;
  }
}

/** Loads the SDK on a Telegram launch; resolves (never rejects) on load, error or timeout. */
export function loadTelegramSdk(timeoutMs = 4000): Promise<void> {
  // Never in the page builder's frame: no third-party script loads there.
  if (typeof window === 'undefined' || window.Telegram?.WebApp || !looksLikeTelegramLaunch() || isBuilderMode()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const script = document.createElement('script');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      if (timer) clearTimeout(timer);
      resolve();
    };
    timer = setTimeout(done, timeoutMs);
    script.src = TELEGRAM_SDK_SRC;
    script.async = true;
    script.onload = done;
    script.onerror = done;
    document.head.appendChild(script);
  });
}

export function isTelegramWebApp(): boolean {
  return webApp() !== null;
}

/** The raw signed query string, posted verbatim to the backend — never re-encoded. */
export function telegramInitData(): string | null {
  return webApp()?.initData ?? null;
}

export function tgReady(): void {
  run(null, (wa) => wa.ready());
}

export function tgExpand(): void {
  run(null, (wa) => wa.expand());
}

export function tgClose(): void {
  run(null, (wa) => wa.close());
}

/** Telegram's chrome in the store's colours — never the shopper's Telegram theme. */
export function setChromeColors(c: { header: string; background: string; bottomBar: string }): void {
  run('6.1', (wa) => {
    wa.setHeaderColor(c.header);
    wa.setBackgroundColor(c.background);
  });
  run('7.10', (wa) => wa.setBottomBarColor?.(c.bottomBar));
}

export interface MainButtonState {
  text: string;
  onClick: () => void;
  color: string;
  textColor: string;
  disabled?: boolean;
  busy?: boolean;
}

// Telegram keeps every handler ever registered, so exactly one is kept here and
// the previous one is always unhooked first — otherwise a tap on "Checkout"
// would also fire the "View cart" it replaced.
let mainHandler: (() => void) | null = null;

export function setMainButton(state: MainButtonState | null): void {
  run(null, (wa) => {
    const button = wa.MainButton;
    if (mainHandler) {
      button.offClick(mainHandler);
      mainHandler = null;
    }
    if (!state) {
      button.hideProgress();
      button.hide();
      return;
    }
    button.setParams({
      text: state.text,
      color: state.color,
      text_color: state.textColor,
      is_active: !state.disabled && !state.busy,
      is_visible: true,
    });
    if (state.busy) button.showProgress(false);
    else button.hideProgress();
    mainHandler = state.onClick;
    button.onClick(mainHandler);
  });
}

let backHandler: (() => void) | null = null;

export function setBackButton(onBack: (() => void) | null): void {
  run('6.1', (wa) => {
    if (backHandler) {
      wa.BackButton.offClick(backHandler);
      backHandler = null;
    }
    if (!onBack) {
      wa.BackButton.hide();
      return;
    }
    backHandler = onBack;
    wa.BackButton.onClick(onBack);
    wa.BackButton.show();
  });
}

export const haptic = {
  impact(style: 'light' | 'medium' | 'heavy'): void {
    run('6.1', (wa) => wa.HapticFeedback.impactOccurred(style));
  },
  notify(type: 'success' | 'error' | 'warning'): void {
    run('6.1', (wa) => wa.HapticFeedback.notificationOccurred(type));
  },
};

export function setClosingConfirmation(on: boolean): void {
  run('6.2', (wa) => (on ? wa.enableClosingConfirmation() : wa.disableClosingConfirmation()));
}

export function setVerticalSwipes(on: boolean): void {
  run('7.7', (wa) => (on ? wa.enableVerticalSwipes?.() : wa.disableVerticalSwipes?.()));
}

/** Payment gateways that refuse the in-app WebView get the system browser inside Telegram. */
export function openExternalLink(url: string): void {
  if (isTelegramWebApp()) {
    run(null, (wa) => wa.openLink(url));
    return;
  }
  window.location.assign(url);
}

/** Mirrors Telegram's safe areas into CSS variables (0px outside Telegram). Returns an unsubscribe. */
export function watchSafeAreas(): () => void {
  const root = document.documentElement;
  const write = () => {
    const wa = webApp();
    const safe = wa?.safeAreaInset ?? {};
    const content = wa?.contentSafeAreaInset ?? {};
    root.style.setProperty('--tg-safe-top', `${safe.top ?? 0}px`);
    root.style.setProperty('--tg-safe-bottom', `${safe.bottom ?? 0}px`);
    root.style.setProperty('--tg-content-safe-top', `${content.top ?? 0}px`);
    root.style.setProperty('--tg-content-safe-bottom', `${content.bottom ?? 0}px`);
  };
  write();

  const wa = webApp();
  if (!wa) return () => undefined;
  try {
    wa.onEvent('safeAreaChanged', write);
    wa.onEvent('contentSafeAreaChanged', write);
  } catch {
    // Pre-8.0 clients have no safe-area events; the zeros written above stand.
  }
  return () => {
    try {
      wa.offEvent('safeAreaChanged', write);
      wa.offEvent('contentSafeAreaChanged', write);
    } catch {
      // Nothing was registered.
    }
  };
}

/** Black or white — whichever reads better on `hex` (WCAG relative luminance). */
export function readableTextOn(hex: string): '#000000' | '#ffffff' {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const channel = (i: number) => {
    const s = parseInt(m[1]!.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  // Contrast against black beats contrast against white above ~0.179.
  return luminance > 0.179 ? '#000000' : '#ffffff';
}
