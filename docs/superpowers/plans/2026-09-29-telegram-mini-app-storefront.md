# Telegram Mini App — Storefront Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the storefront as a Telegram Mini App: signed in automatically from `initData`, rendered in a new phone-first `webapp` layout that keeps the store's template and colours, with Telegram's native MainButton/BackButton, and a `beta`-mode switch back to the classic bot.

**Architecture:** One adapter (`web/src/lib/telegram-webapp.ts`) owns every Telegram SDK call and is a no-op in a normal browser; the SDK script is only fetched on a Telegram launch. A boot step trades `initData` for the ordinary storefront session. `useEffectiveLayout()` forces `webapp` inside Telegram, and `WebAppShell` renders it — reusing `MenuShell`'s styles and the menu-style catalogue — with a single "primary action" (View cart → Checkout → Place order) shown as Telegram's MainButton inside Telegram and as an in-page bar outside it.

**Tech Stack:** React 19, Vite, Mantine 9, zustand, TanStack Query, ky, Vitest (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-telegram-mini-app-design.md` (§5, §6, §8)

**Repo:** `T:\Projects\ecommerce\ecommerce-storefront` — app code in `web/`. Branch `feature/telegram-mini-app`. Deploy order is binding: backend plan (`2026-09-29-telegram-mini-app-backend.md`) → admin plan (`…-admin.md`) → this. Against an older backend the storefront still works: `telegramWebApp` is optional in settings, and the Mini App sign-in route 404s into the sign-in error card.

## Global Constraints

- **Invoke the `frontend-design` skill before any UI work** (Tasks 2, 4, 5), and design at 390×844 first — the phone is the only screen a Mini App has.
- `@/…` imports with `.ts`/`.tsx` extensions; unit tests in `web/test/*.test.ts(x)` (`npm --prefix web test -- test/<file>`); e2e via `npm run test:e2e -- <spec>` with `installMocks` (hermetic — every external host is aborted, including telegram.org).
- On brand always: Telegram chrome colours come from the store theme (`--sf-bg`, `--sf-surface`, `--sf-primary`); `Telegram.WebApp.themeParams` is never read.
- Sign-in runs on **every** launch and replaces any stored token; a failed Mini App sign-in clears the stored session.
- Routes: `POST storefront/auth/telegram-webapp` `{ initData }` → `LoginResult`; `POST storefront/account/bot-mode` `{ classic: boolean }`.
- Layout values `storefront | menu | webapp`; inside Telegram the effective layout is always `webapp`.
- No template contract change: `webapp` renders no `TopBar` or `Footer` slot.
- Deviation from spec §5.1, deliberate: the SDK is injected by `main.tsx` only on a Telegram launch (URL hash `tgWebAppData` or the SDK's own `sessionStorage` key), not a blocking `<script>` in `index.html` — ordinary browser visitors must not pay a third-party round-trip on every page load.

## Review Focus

- **Reload inside the Mini App** (pull-to-refresh / Telegram's reload menu): the hash is gone, so detection must fall back to the SDK's `sessionStorage` key — otherwise a reload silently drops to the browser layout with no session. Pinned in Task 1 (`looksLikeTelegramLaunch` sessionStorage case).
- **Two Telegram accounts on one phone**: launching as account B after account A must never show A's orders. Pinned in Task 2 (token replaced every launch; failure clears the session).
- **Payment gateway refusing to load inside the WebView**: external payment URLs go through `openLink` and the Mini App lands on the order page. Pinned in Task 4 (checkout outcome in Telegram).
- **MainButton left showing a stale handler** after navigating away (e.g. "Place order" still bound on the catalog). Pinned in Task 4 / Task 6 (one registered handler; override cleared on unmount).
- **`layout: 'webapp'` in a desktop browser**: no Telegram calls, in-page bar visible, column capped, no horizontal scroll. Pinned in Task 6.

---

### Task 1: Telegram adapter and on-demand SDK loader

**Files:**
- Create: `web/src/lib/telegram-webapp.ts`
- Modify: `web/src/main.tsx`
- Test: `web/test/telegram-webapp.test.ts`

**Deviation from spec §5.1 (deliberate):** the spec loads `telegram-web-app.js` with a synchronous `<script>` in `index.html`. That would make every ordinary browser visit wait on telegram.org. Instead `main.tsx` awaits `loadTelegramSdk()` before rendering, and the loader only injects the script when the page was *launched by Telegram* (Telegram puts `#tgWebAppData=…` in the launch URL, and its SDK keeps a copy in `sessionStorage.__telegram__initParams` for reloads). Normal browsers resolve immediately and pay nothing. The globals still exist before React renders, which is what the spec's sync load was for.

**Interfaces:**
- Produces (every later task uses these exact names; all are no-ops outside Telegram):
  - `TELEGRAM_SDK_SRC = 'https://telegram.org/js/telegram-web-app.js'`
  - `looksLikeTelegramLaunch(): boolean`
  - `loadTelegramSdk(timeoutMs = 4000): Promise<void>` — never rejects
  - `isTelegramWebApp(): boolean`; `telegramInitData(): string | null`
  - `tgReady(): void`; `tgExpand(): void`; `tgClose(): void`
  - `setChromeColors(c: { header: string; background: string; bottomBar: string }): void`
  - `interface MainButtonState { text: string; onClick: () => void; color: string; textColor: string; disabled?: boolean; busy?: boolean }`; `setMainButton(state: MainButtonState | null): void`
  - `setBackButton(onBack: (() => void) | null): void`
  - `haptic: { impact(style: 'light' | 'medium' | 'heavy'): void; notify(type: 'success' | 'error' | 'warning'): void }`
  - `setClosingConfirmation(on: boolean): void`; `setVerticalSwipes(on: boolean): void`
  - `openExternalLink(url: string): void`
  - `watchSafeAreas(): () => void` — CSS vars `--tg-safe-top`, `--tg-safe-bottom`, `--tg-content-safe-top`, `--tg-content-safe-bottom` on `<html>`
  - `readableTextOn(hex: string): '#000000' | '#ffffff'`

- [ ] **Step 1: Write the failing test**

```ts
// web/test/telegram-webapp.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TELEGRAM_SDK_SRC,
  haptic,
  isTelegramWebApp,
  loadTelegramSdk,
  looksLikeTelegramLaunch,
  openExternalLink,
  readableTextOn,
  setBackButton,
  setChromeColors,
  setClosingConfirmation,
  setMainButton,
  setVerticalSwipes,
  telegramInitData,
  watchSafeAreas,
} from '@/lib/telegram-webapp.ts';

const INIT_DATA = 'user=%7B%22id%22%3A1%7D&auth_date=1&hash=abc';

function atLeast(have: string, want: string): boolean {
  const a = have.split('.').map(Number);
  const b = want.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

const bottomButton = () => ({
  setParams: vi.fn(), showProgress: vi.fn(), hideProgress: vi.fn(),
  show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn(),
});

/** A recording stand-in for `window.Telegram.WebApp` at the given client version. */
function stubWebApp(version = '8.0', overrides: Record<string, unknown> = {}) {
  const wa = {
    initData: INIT_DATA,
    version,
    isVersionAtLeast: (v: string) => atLeast(version, v),
    ready: vi.fn(), expand: vi.fn(), close: vi.fn(),
    setHeaderColor: vi.fn(), setBackgroundColor: vi.fn(), setBottomBarColor: vi.fn(),
    MainButton: bottomButton(),
    BackButton: { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() },
    HapticFeedback: { impactOccurred: vi.fn(), notificationOccurred: vi.fn() },
    enableClosingConfirmation: vi.fn(), disableClosingConfirmation: vi.fn(),
    enableVerticalSwipes: vi.fn(), disableVerticalSwipes: vi.fn(),
    openLink: vi.fn(),
    onEvent: vi.fn(), offEvent: vi.fn(),
    safeAreaInset: { top: 0, bottom: 34, left: 0, right: 0 },
    contentSafeAreaInset: { top: 46, bottom: 0, left: 0, right: 0 },
    ...overrides,
  };
  (window as unknown as { Telegram: unknown }).Telegram = { WebApp: wa };
  return wa;
}

beforeEach(() => {
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  window.location.hash = '';
  sessionStorage.clear();
  document.head.querySelectorAll('script').forEach((s) => s.remove());
  document.documentElement.removeAttribute('style');
});
afterEach(() => vi.useRealTimers());

describe('detection', () => {
  it('is not a web app in a plain browser', () => {
    expect(isTelegramWebApp()).toBe(false);
    expect(telegramInitData()).toBeNull();
  });

  it('is not a web app when the SDK is loaded but Telegram gave no initData', () => {
    stubWebApp('8.0', { initData: '' });
    expect(isTelegramWebApp()).toBe(false);
  });

  it('is a web app inside Telegram and exposes the raw initData', () => {
    stubWebApp();
    expect(isTelegramWebApp()).toBe(true);
    expect(telegramInitData()).toBe(INIT_DATA);
  });

  it('recognises a Telegram launch from the URL hash', () => {
    window.location.hash = '#tgWebAppData=abc&tgWebAppVersion=8.0';
    expect(looksLikeTelegramLaunch()).toBe(true);
  });

  it('recognises a reload of a Telegram launch from sessionStorage', () => {
    sessionStorage.setItem('__telegram__initParams', '{"tgWebAppData":"abc"}');
    expect(looksLikeTelegramLaunch()).toBe(true);
  });

  it('does not mistake an ordinary hash for a launch', () => {
    window.location.hash = '#reviews';
    expect(looksLikeTelegramLaunch()).toBe(false);
  });
});

describe('loadTelegramSdk', () => {
  it('does nothing for an ordinary visit', async () => {
    await loadTelegramSdk();
    expect(document.head.querySelector('script')).toBeNull();
  });

  it('does nothing when the SDK is already on the page', async () => {
    window.location.hash = '#tgWebAppData=abc';
    stubWebApp();
    await loadTelegramSdk();
    expect(document.head.querySelector('script')).toBeNull();
  });

  it('injects the SDK on a Telegram launch and resolves once it loads', async () => {
    window.location.hash = '#tgWebAppData=abc';
    const pending = loadTelegramSdk();
    const script = document.head.querySelector<HTMLScriptElement>(`script[src="${TELEGRAM_SDK_SRC}"]`);
    expect(script).not.toBeNull();
    script!.dispatchEvent(new Event('load'));
    await expect(pending).resolves.toBeUndefined();
  });

  it('resolves (never rejects) when the SDK fails to load', async () => {
    window.location.hash = '#tgWebAppData=abc';
    const pending = loadTelegramSdk();
    document.head.querySelector('script')!.dispatchEvent(new Event('error'));
    await expect(pending).resolves.toBeUndefined();
  });

  it('gives up after the timeout', async () => {
    vi.useFakeTimers();
    window.location.hash = '#tgWebAppData=abc';
    const pending = loadTelegramSdk(4000);
    vi.advanceTimersByTime(4000);
    await expect(pending).resolves.toBeUndefined();
  });
});

describe('MainButton', () => {
  it('shows the action with the store colours and one click handler', () => {
    const wa = stubWebApp();
    const first = vi.fn();
    const second = vi.fn();
    setMainButton({ text: 'View cart · £12.00', onClick: first, color: '#f5c518', textColor: '#000000' });
    expect(wa.MainButton.setParams).toHaveBeenCalledWith({
      text: 'View cart · £12.00', color: '#f5c518', text_color: '#000000', is_active: true, is_visible: true,
    });
    expect(wa.MainButton.onClick).toHaveBeenCalledWith(first);

    setMainButton({ text: 'Checkout', onClick: second, color: '#f5c518', textColor: '#000000' });
    expect(wa.MainButton.offClick).toHaveBeenCalledWith(first);
    expect(wa.MainButton.onClick).toHaveBeenLastCalledWith(second);
  });

  it('greys out and spins while busy', () => {
    const wa = stubWebApp();
    setMainButton({ text: 'Place order', onClick: vi.fn(), color: '#000000', textColor: '#ffffff', busy: true });
    expect(wa.MainButton.setParams).toHaveBeenCalledWith(expect.objectContaining({ is_active: false }));
    expect(wa.MainButton.showProgress).toHaveBeenCalledWith(false);
  });

  it('hides and drops its handler when cleared', () => {
    const wa = stubWebApp();
    const click = vi.fn();
    setMainButton({ text: 'Checkout', onClick: click, color: '#000000', textColor: '#ffffff' });
    setMainButton(null);
    expect(wa.MainButton.offClick).toHaveBeenCalledWith(click);
    expect(wa.MainButton.hide).toHaveBeenCalled();
  });

  it('is a no-op outside Telegram', () => {
    expect(() => setMainButton({ text: 'x', onClick: vi.fn(), color: '#000000', textColor: '#ffffff' })).not.toThrow();
  });
});

describe('BackButton', () => {
  it('shows with a handler, then hides and unhooks it', () => {
    const wa = stubWebApp();
    const back = vi.fn();
    setBackButton(back);
    expect(wa.BackButton.onClick).toHaveBeenCalledWith(back);
    expect(wa.BackButton.show).toHaveBeenCalled();
    setBackButton(null);
    expect(wa.BackButton.offClick).toHaveBeenCalledWith(back);
    expect(wa.BackButton.hide).toHaveBeenCalled();
  });

  it('is skipped on a client older than 6.1', () => {
    const wa = stubWebApp('6.0');
    setBackButton(vi.fn());
    expect(wa.BackButton.show).not.toHaveBeenCalled();
  });
});

describe('version-gated chrome', () => {
  it('paints header and background from 6.1, bottom bar only from 7.10', () => {
    const wa = stubWebApp('7.0');
    setChromeColors({ header: '#101010', background: '#101010', bottomBar: '#1a1a1a' });
    expect(wa.setHeaderColor).toHaveBeenCalledWith('#101010');
    expect(wa.setBackgroundColor).toHaveBeenCalledWith('#101010');
    expect(wa.setBottomBarColor).not.toHaveBeenCalled();

    const newer = stubWebApp('8.0');
    setChromeColors({ header: '#101010', background: '#101010', bottomBar: '#1a1a1a' });
    expect(newer.setBottomBarColor).toHaveBeenCalledWith('#1a1a1a');
  });

  it('toggles vertical swipes only from 7.7', () => {
    const old = stubWebApp('7.6');
    setVerticalSwipes(false);
    expect(old.disableVerticalSwipes).not.toHaveBeenCalled();

    const wa = stubWebApp('8.0');
    setVerticalSwipes(false);
    expect(wa.disableVerticalSwipes).toHaveBeenCalled();
    setVerticalSwipes(true);
    expect(wa.enableVerticalSwipes).toHaveBeenCalled();
  });

  it('toggles closing confirmation from 6.2', () => {
    const wa = stubWebApp();
    setClosingConfirmation(true);
    expect(wa.enableClosingConfirmation).toHaveBeenCalled();
    setClosingConfirmation(false);
    expect(wa.disableClosingConfirmation).toHaveBeenCalled();
  });

  it('forwards haptics', () => {
    const wa = stubWebApp();
    haptic.impact('light');
    haptic.notify('success');
    expect(wa.HapticFeedback.impactOccurred).toHaveBeenCalledWith('light');
    expect(wa.HapticFeedback.notificationOccurred).toHaveBeenCalledWith('success');
  });

  it('opens external links through Telegram', () => {
    const wa = stubWebApp();
    openExternalLink('https://pay.example.com/x');
    expect(wa.openLink).toHaveBeenCalledWith('https://pay.example.com/x');
  });

  it('swallows a method the client throws on', () => {
    stubWebApp('8.0', { setHeaderColor: () => { throw new Error('unsupported'); } });
    expect(() => setChromeColors({ header: '#000000', background: '#000000', bottomBar: '#000000' })).not.toThrow();
  });
});

describe('watchSafeAreas', () => {
  const v = (name: string) => document.documentElement.style.getPropertyValue(name);

  it('writes zeros outside Telegram', () => {
    watchSafeAreas()();
    expect(v('--tg-safe-top')).toBe('0px');
    expect(v('--tg-content-safe-bottom')).toBe('0px');
  });

  it('writes the insets Telegram reports and follows changes', () => {
    const wa = stubWebApp();
    const stop = watchSafeAreas();
    expect(v('--tg-safe-bottom')).toBe('34px');
    expect(v('--tg-content-safe-top')).toBe('46px');
    expect(wa.onEvent).toHaveBeenCalledWith('safeAreaChanged', expect.any(Function));
    expect(wa.onEvent).toHaveBeenCalledWith('contentSafeAreaChanged', expect.any(Function));

    wa.safeAreaInset = { top: 0, bottom: 20, left: 0, right: 0 };
    const onChange = wa.onEvent.mock.calls[0]![1] as () => void;
    onChange();
    expect(v('--tg-safe-bottom')).toBe('20px');

    stop();
    expect(wa.offEvent).toHaveBeenCalledWith('safeAreaChanged', onChange);
  });
});

describe('readableTextOn', () => {
  it.each([
    ['#ffffff', '#000000'],
    ['#f5c518', '#000000'],
    ['#111111', '#ffffff'],
    ['#2f5bea', '#ffffff'],
  ])('%s → %s', (bg, text) => expect(readableTextOn(bg)).toBe(text));

  it('falls back to white for something it cannot parse', () => {
    expect(readableTextOn('var(--x)')).toBe('#ffffff');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web test -- test/telegram-webapp.test.ts`
Expected: FAIL — cannot resolve `@/lib/telegram-webapp.ts`.

- [ ] **Step 3: Implement `web/src/lib/telegram-webapp.ts`**

```ts
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
  if (typeof window === 'undefined' || window.Telegram?.WebApp || !looksLikeTelegramLaunch()) {
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
```

`TelegramLogin.tsx` already has a `declare global { interface Window { … } }` block; the two merge — do not touch it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix web test -- test/telegram-webapp.test.ts`
Expected: PASS.

- [ ] **Step 5: Load the SDK before first render**

Replace the render at the bottom of `web/src/main.tsx` with:

```ts
import { loadTelegramSdk } from '@/lib/telegram-webapp.ts';

// …existing imports and prefetchTemplate call unchanged…

function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// Inside Telegram the SDK has to be on the page before the first render (the
// shell and the sign-in read it synchronously). Anywhere else this resolves at
// once without touching the network.
void loadTelegramSdk().then(render);
```

(Put the new import with the others at the top of the file.)

- [ ] **Step 6: Typecheck and run the whole web suite**

Run: `npm --prefix web run typecheck && npm --prefix web test`
Expected: clean typecheck; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/telegram-webapp.ts web/src/main.tsx web/test/telegram-webapp.test.ts
git commit -m "feat(web): Telegram Mini App adapter, SDK loaded only on a Telegram launch"
```

---

### Task 2: Automatic sign-in inside Telegram

**Files:**
- Modify: `web/src/api/auth.ts`
- Create: `web/src/stores/telegram.ts`
- Modify: `web/src/features/auth/useLoginSuccess.ts` (extract `adoptAccountCart`)
- Create: `web/src/app/telegram-session.ts`
- Modify: `web/src/main.tsx`
- Modify: `web/src/app/App.tsx` (`useBootCart`, `SettingsBoundary`)
- Create: `web/src/features/auth/TelegramSignInError.tsx`
- Modify: `web/src/features/auth/LoginPage.tsx`
- Test: `web/test/telegram-session.test.ts`

This task touches UI (`TelegramSignInError`, `LoginPage`): **invoke the `frontend-design` skill before writing those components** (standing rule for this repo). The card reuses the existing `EmptyState` idiom — no new visual language.

**Interfaces:**
- Consumes: `isTelegramWebApp`, `telegramInitData` (Task 1); backend `POST storefront/auth/telegram-webapp` `{ initData }` → `LoginResult`.
- Produces:
  - `loginTelegramWebApp(initData: string): Promise<LoginResult>` (`@/api/auth.ts`)
  - `useTelegramAuthStore` (`@/stores/telegram.ts`): `{ status: 'none' | 'pending' | 'ready' | 'failed'; error: string | null; setStatus(status, error?: string | null): void }`; exported type `TelegramAuthStatus`
  - `adoptAccountCart(client?: QueryClient): Promise<void>` (`@/features/auth/useLoginSuccess.ts`)
  - `bootTelegramSession(deps?: Partial<TelegramSessionDeps>): Promise<void>` (`@/app/telegram-session.ts`) — sets `status` to `'pending'` **synchronously** before its first `await`
  - `TelegramSignInError` component

**Why the cart is adopted two ways.** The persisted cart (`sf-cart-v1`) keeps `lines` but not `mode`, so on a fresh launch it is impossible to tell a guest's basket from the local mirror of a signed-in account's server cart by looking at the lines. The token tells us: if a session token was stored before this launch, the lines are a mirror of *some* account's server cart (possibly a different Telegram account on a shared device), and merging them would double every quantity or leak one account's basket into another — so the server cart is adopted as-is, exactly as `useBootCart` does today. Only a launch with no prior token merges the local (guest) lines in, as the widget/WhatsApp login does.

- [ ] **Step 1: Write the failing test**

```ts
// web/test/telegram-session.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

import { bootTelegramSession, type TelegramSessionDeps } from '@/app/telegram-session.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useTelegramAuthStore } from '@/stores/telegram.ts';
import { ApiError } from '@/lib/errors.ts';
import type { LoginResult } from '@/types/auth.ts';

const RESULT: LoginResult = { token: 'tg-token', customer: { id: 7, nickname: 'Ada' } };

function deps(overrides: Partial<TelegramSessionDeps> = {}): TelegramSessionDeps {
  return {
    inTelegram: () => true,
    initData: () => 'user=%7B%22id%22%3A1%7D&hash=abc',
    login: vi.fn(async () => RESULT),
    adoptCart: vi.fn(async () => undefined),
    ...overrides,
  };
}

beforeEach(() => {
  useSessionStore.getState().clear();
  useTelegramAuthStore.getState().setStatus('none');
});

describe('bootTelegramSession', () => {
  it('stays out of the way in an ordinary browser', async () => {
    const d = deps({ inTelegram: () => false });
    await bootTelegramSession(d);
    expect(useTelegramAuthStore.getState().status).toBe('none');
    expect(d.login).not.toHaveBeenCalled();
  });

  it('is pending synchronously, before the request resolves', () => {
    void bootTelegramSession(deps({ login: () => new Promise(() => undefined) }));
    expect(useTelegramAuthStore.getState().status).toBe('pending');
  });

  it('posts the raw initData and signs the shopper in', async () => {
    const d = deps();
    await bootTelegramSession(d);
    expect(d.login).toHaveBeenCalledWith('user=%7B%22id%22%3A1%7D&hash=abc');
    expect(useSessionStore.getState().token).toBe('tg-token');
    expect(useSessionStore.getState().customer).toEqual({ id: 7, nickname: 'Ada' });
    expect(useTelegramAuthStore.getState()).toMatchObject({ status: 'ready', error: null });
  });

  it('merges a guest basket when there was no session before this launch', async () => {
    const d = deps();
    await bootTelegramSession(d);
    expect(d.adoptCart).toHaveBeenCalledWith(true);
  });

  it('replaces an existing session and adopts the server cart without merging', async () => {
    useSessionStore.getState().setSession('someone-elses-token', { id: 99, nickname: 'Bea' });
    const d = deps();
    await bootTelegramSession(d);
    expect(useSessionStore.getState().token).toBe('tg-token');
    expect(d.adoptCart).toHaveBeenCalledWith(false);
  });

  it('clears any stored session and reports the error when Telegram sign-in fails', async () => {
    useSessionStore.getState().setSession('stale', { id: 99, nickname: 'Bea' });
    const d = deps({ login: vi.fn(async () => { throw new ApiError(401, 'Telegram web app session expired'); }) });
    await bootTelegramSession(d);
    expect(useSessionStore.getState().token).toBeNull();
    expect(useTelegramAuthStore.getState()).toMatchObject({ status: 'failed', error: 'Telegram web app session expired' });
    expect(d.adoptCart).not.toHaveBeenCalled();
  });

  it('fails cleanly if Telegram handed over no initData', async () => {
    const d = deps({ initData: () => null });
    await bootTelegramSession(d);
    expect(useTelegramAuthStore.getState().status).toBe('failed');
    expect(d.login).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web test -- test/telegram-session.test.ts`
Expected: FAIL — cannot resolve `@/app/telegram-session.ts`.

- [ ] **Step 3: API call and status store**

Append to `web/src/api/auth.ts`:

```ts
/** Mini App sign-in: `initData` is posted exactly as Telegram handed it over. */
export const loginTelegramWebApp = (initData: string) =>
  unwrap<LoginResult>(api.post('storefront/auth/telegram-webapp', { json: { initData } }));
```

Create `web/src/stores/telegram.ts`:

```ts
import { create } from 'zustand';

/**
 * Where the automatic Telegram sign-in stands. `none` = not inside Telegram (the
 * normal sign-in page applies); `pending` = the initData is being exchanged and
 * the app holds its skeleton; `ready` / `failed` = done. Deliberately not
 * persisted: it is re-established on every launch.
 */
export type TelegramAuthStatus = 'none' | 'pending' | 'ready' | 'failed';

interface TelegramAuthState {
  status: TelegramAuthStatus;
  error: string | null;
  setStatus: (status: TelegramAuthStatus, error?: string | null) => void;
}

export const useTelegramAuthStore = create<TelegramAuthState>()((set) => ({
  status: 'none',
  error: null,
  setStatus: (status, error = null) => set({ status, error }),
}));
```

- [ ] **Step 4: Extract `adoptAccountCart` from `useLoginSuccess`**

In `web/src/features/auth/useLoginSuccess.ts`, add `import type { QueryClient } from '@tanstack/react-query';` (alongside the existing `useQueryClient` import) and add above `useLoginSuccess`:

```ts
/**
 * Fold whatever this browser was carrying into the account's server cart and
 * adopt the result. Never fails the sign-in: if the merge breaks, the shopper is
 * told plainly and stays in local mode with every line they picked — adopting
 * the server cart here would quietly discard the lines the merge failed to save.
 */
export async function adoptAccountCart(client?: QueryClient): Promise<void> {
  try {
    const local = useCartStore.getState().mergeForLogin();
    const server = await fetchCart();
    const merged =
      local.length === 0 ? server : await putCart(unionCartLines(server.items, local));
    useCartStore.getState().replaceFromServer(merged);
    await client?.invalidateQueries({ queryKey: ['cart'] });
  } catch (err) {
    notifications.show({
      message: errorMessage(err, "We couldn't add your basket to your account"),
      color: 'red',
    });
  }
}
```

and replace the `try { … } catch (err) { … }` block inside `useLoginSuccess`'s callback with:

```ts
      await adoptAccountCart(client);
```

Run: `npm --prefix web test -- test/use-login-success.test.tsx`
Expected: PASS unchanged (behaviour is identical; only the code moved).

- [ ] **Step 5: Implement `web/src/app/telegram-session.ts`**

```ts
import { loginTelegramWebApp } from '@/api/auth.ts';
import { fetchCart } from '@/api/cart.ts';
import { adoptAccountCart } from '@/features/auth/useLoginSuccess.ts';
import { resetCartSync } from '@/features/cart/useServerCart.ts';
import { errorMessage } from '@/lib/errors.ts';
import { isTelegramWebApp, telegramInitData } from '@/lib/telegram-webapp.ts';
import { useCartStore } from '@/stores/cart.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useTelegramAuthStore } from '@/stores/telegram.ts';
import type { LoginResult } from '@/types/auth.ts';

export interface TelegramSessionDeps {
  inTelegram: () => boolean;
  initData: () => string | null;
  login: (initData: string) => Promise<LoginResult>;
  /** `merge` = fold local (guest) lines in; otherwise adopt the server cart as-is. */
  adoptCart: (merge: boolean) => Promise<void>;
}

/** A signed-in launch: the persisted lines mirror *some* account's server cart, so never merge them. */
async function adoptServerCart(): Promise<void> {
  try {
    useCartStore.getState().replaceFromServer(await fetchCart());
  } catch {
    // Silent, like useBootCart: the local cart stands in until the next sync.
  }
}

const DEFAULT_DEPS: TelegramSessionDeps = {
  inTelegram: isTelegramWebApp,
  initData: telegramInitData,
  login: loginTelegramWebApp,
  adoptCart: (merge) => (merge ? adoptAccountCart() : adoptServerCart()),
};

/**
 * Inside Telegram the shopper's Telegram account *is* their identity: exchange
 * the signed initData for a storefront session on every launch, replacing any
 * token already stored — a phone shared by two Telegram accounts must always
 * land on the account that opened the shop. A failure clears the stored session
 * for the same reason: showing the previous account's orders is worse than
 * asking the shopper to reopen the shop.
 *
 * Sets `pending` synchronously, before the first await, so the first render
 * (which main.tsx starts right after calling this) already holds the skeleton.
 */
export async function bootTelegramSession(overrides: Partial<TelegramSessionDeps> = {}): Promise<void> {
  const d = { ...DEFAULT_DEPS, ...overrides };
  const auth = useTelegramAuthStore.getState();
  if (!d.inTelegram()) {
    auth.setStatus('none');
    return;
  }

  const initData = d.initData();
  if (!initData) {
    useSessionStore.getState().clear();
    auth.setStatus('failed', "Telegram didn't pass your account to the shop");
    return;
  }

  auth.setStatus('pending');
  const hadSession = useSessionStore.getState().token !== null;
  try {
    const result = await d.login(initData);
    useSessionStore.getState().setSession(result.token, result.customer);
    // A previous session can have left a debounce timer armed; it doesn't belong to this account.
    resetCartSync();
    await d.adoptCart(!hadSession);
    useTelegramAuthStore.getState().setStatus('ready');
  } catch (err) {
    useSessionStore.getState().clear();
    useTelegramAuthStore.getState().setStatus('failed', errorMessage(err, "Couldn't sign you in through Telegram"));
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm --prefix web test -- test/telegram-session.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Start it on launch and hold the app while it runs**

`web/src/main.tsx` — import `bootTelegramSession` from `'@/app/telegram-session.ts'` and change the last line to:

```ts
void loadTelegramSdk().then(() => {
  // Not awaited: it flips the Telegram status to `pending` synchronously, and the
  // app renders its skeleton until the exchange settles.
  void bootTelegramSession();
  render();
});
```

`web/src/app/App.tsx`:
- import `useTelegramAuthStore` from `'@/stores/telegram.ts'`;
- in `useBootCart`, after `started.current = true;` add:

```ts
    // Inside Telegram the sign-in adopts the right cart itself (telegram-session.ts);
    // fetching here too would race it with whatever token was stored before launch.
    if (useTelegramAuthStore.getState().status !== 'none') return;
```

- in `SettingsBoundary`, read the status and gate the themed app on it:

```tsx
function SettingsBoundary() {
  const query = useSettingsQuery();
  const telegramPending = useTelegramAuthStore((s) => s.status === 'pending');
  useBootCart();

  if (query.data && !telegramPending) return <ThemedApp settings={query.data} />;
  // …the isError branch and the final skeleton return stay exactly as they are…
```

(Keep the `isError` branch before the skeleton; a settings error still shows its error card even while Telegram is pending.)

- [ ] **Step 8: The failure card and the Telegram-aware login page**

Invoke the `frontend-design` skill now, before writing these components.

Create `web/src/features/auth/TelegramSignInError.tsx`:

```tsx
import { Button } from '@mantine/core';
import { EmptyState } from '@/components/EmptyState.tsx';
import { bootTelegramSession } from '@/app/telegram-session.ts';
import { useTelegramAuthStore } from '@/stores/telegram.ts';

/**
 * Inside Telegram there is no other way in — no widget, no WhatsApp code — so a
 * failed exchange says so plainly and offers the only two remedies there are.
 */
export function TelegramSignInError() {
  const error = useTelegramAuthStore((s) => s.error);
  return (
    <EmptyState
      eyebrow="Telegram"
      title="Couldn’t sign you in through Telegram"
      description={`Close and reopen the shop from the bot.${error ? ` (${error})` : ''}`}
      action={
        <Button variant="default" size="sm" onClick={() => void bootTelegramSession()}>
          Try again
        </Button>
      }
    />
  );
}
```

In `web/src/features/auth/LoginPage.tsx`:
- import `useTelegramAuthStore` from `'@/stores/telegram.ts'` and `TelegramSignInError` from `'@/features/auth/TelegramSignInError.tsx'`;
- read `const telegramStatus = useTelegramAuthStore((s) => s.status);` next to the other hooks (before any return);
- after the existing `if (entry.signedIn) { return <Navigate … /> }` block, add:

```tsx
  // Inside Telegram the account comes from Telegram or not at all: the widget and
  // WhatsApp options would only sign the shopper into something other than the
  // account that opened the shop. A successful exchange never lands here (the
  // signed-in redirect above catches it), so anything else is a failure.
  if (telegramStatus !== 'none') {
    return (
      <div className={classes.page}>
        <TelegramSignInError />
      </div>
    );
  }
```

Retry flow check: `bootTelegramSession()` sets `pending` → `SettingsBoundary` swaps to the skeleton → on `ready` the router re-mounts on `/login`, `entry.signedIn` is true, and the page redirects to `returnTo`/`DEFAULT_LANDING`. No extra code needed.

- [ ] **Step 9: Typecheck and full suite**

Run: `npm --prefix web run typecheck && npm --prefix web test`
Expected: clean; all tests pass.

- [ ] **Step 10: Commit**

```bash
git add web/src/api/auth.ts web/src/stores/telegram.ts web/src/features/auth web/src/app/telegram-session.ts web/src/app/App.tsx web/src/main.tsx web/test/telegram-session.test.ts
git commit -m "feat(web): sign in automatically from Telegram inside the Mini App"
```

---

### Task 3: The `webapp` layout value and the effective layout

**Files:**
- Modify: `web/src/types/settings.ts` (`LayoutKind`, `StorefrontSettings`)
- Create: `web/src/app/layout.ts`
- Create: `web/src/layouts/WebAppShell.tsx` (placeholder — Task 4 replaces it)
- Modify: `web/src/app/router.tsx` (`ShellSwitch`, `ProductRoute`, `CartRoute`)
- Modify: `web/src/features/catalog/CatalogPage.tsx`
- Modify: `web/src/features/wholesale/WholesaleCatalogPage.tsx:90`
- Modify: `web/src/templates/runtime.tsx` (`Slot` base props, ~line 129)
- Modify: `web/src/templates/slots.ts:10` (comment)
- Modify: `docs/templates.md` (~lines 338 and 380–386)
- Modify: `e2e/fixtures/settings.menu.json`, `e2e/fixtures/settings.storefront.json`
- Test: `web/test/effective-layout.test.ts`

**Interfaces:**
- Consumes: `isTelegramWebApp` (Task 1).
- Produces:
  - `type LayoutKind = 'storefront' | 'menu' | 'webapp'`
  - `StorefrontSettings.telegramWebApp?: { mode: 'off' | 'beta' | 'forced' }` (optional — backends older than the Mini App omit it)
  - `effectiveLayout(chosen: LayoutKind | undefined, inTelegram: boolean): LayoutKind` and `useEffectiveLayout(): LayoutKind` (`@/app/layout.ts`)
  - `WebAppShell` export from `@/layouts/WebAppShell.tsx` (placeholder here)

- [ ] **Step 1: Write the failing test**

```ts
// web/test/effective-layout.test.ts
import { describe, expect, it } from 'vitest';
import { effectiveLayout } from '@/app/layout.ts';

describe('effectiveLayout', () => {
  it.each([
    ['storefront', false, 'storefront'],
    ['menu', false, 'menu'],
    ['webapp', false, 'webapp'],
  ] as const)('browser, store picked %s → %s', (chosen, inTelegram, expected) => {
    expect(effectiveLayout(chosen, inTelegram)).toBe(expected);
  });

  it.each(['storefront', 'menu', 'webapp'] as const)('inside Telegram, store picked %s → webapp', (chosen) => {
    expect(effectiveLayout(chosen, true)).toBe('webapp');
  });

  it('falls back to storefront when an old backend sends no layout', () => {
    expect(effectiveLayout(undefined, false)).toBe('storefront');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web test -- test/effective-layout.test.ts`
Expected: FAIL — cannot resolve `@/app/layout.ts`.

- [ ] **Step 3: Types and the layout helper**

`web/src/types/settings.ts`:

```ts
export type LayoutKind = 'storefront' | 'menu' | 'webapp';
```

and in `interface StorefrontSettings`, after `turnstile: { siteKey: string } | null;`:

```ts
  /** The bot's effective web app mode. Absent on backends older than the Mini App. */
  telegramWebApp?: { mode: 'off' | 'beta' | 'forced' };
```

Create `web/src/app/layout.ts`:

```ts
import { useSettings } from '@/app/settings.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
import type { LayoutKind } from '@/types/settings.ts';

/**
 * The layout actually on screen. Inside Telegram it is always the web app,
 * whatever the store picked for browsers — the store's choice only decides what
 * an ordinary browser gets (and choosing `webapp` there is how a store makes
 * the web app its default everywhere).
 */
export function effectiveLayout(chosen: LayoutKind | undefined, inTelegram: boolean): LayoutKind {
  if (inTelegram) return 'webapp';
  return chosen ?? 'storefront';
}

export function useEffectiveLayout(): LayoutKind {
  const { features } = useSettings();
  return effectiveLayout(features?.layout, isTelegramWebApp());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix web test -- test/effective-layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Placeholder shell**

Create `web/src/layouts/WebAppShell.tsx`:

```tsx
import { MenuShell } from '@/layouts/MenuShell.tsx';

/** Placeholder until the web app shell lands (next task): borrows the menu shell. */
export function WebAppShell() {
  return <MenuShell />;
}
```

- [ ] **Step 6: Route on the effective layout**

`web/src/app/router.tsx` — import `useEffectiveLayout` from `'@/app/layout.ts'` and `WebAppShell` from `'@/layouts/WebAppShell.tsx'`, then replace the three helpers:

```tsx
/** The client picks the shell (Telegram always gets the web app); all render an <Outlet/>. */
function ShellSwitch() {
  const layout = useEffectiveLayout();
  if (layout === 'webapp') return <WebAppShell />;
  return layout === 'menu' ? <MenuShell /> : <StorefrontShell />;
}

/** In the list layouts (menu, web app) a product opens as a bottom sheet over the list, so /p/:id becomes /?p=id. */
function ProductRoute() {
  const layout = useEffectiveLayout();
  const { id } = useParams();
  if (layout !== 'storefront') return <Navigate to={`/?p=${encodeURIComponent(id ?? '')}`} replace />;
  return <ProductDetailPage />;
}

/**
 * The cart is a page on a phone and a drawer on a desktop — /cart hands off to the
 * drawer there. The web app has no drawer at any width: it is phone-first, and its
 * primary action goes to this page.
 */
function CartRoute() {
  const layout = useEffectiveLayout();
  // Resolve the match synchronously: with the default deferred read the first render
  // is always `false`, so a desktop visitor sees CartPage flash before the redirect.
  const desktop = useMediaQuery(DESKTOP, false, { getInitialValueInEffect: false });
  const drawer = desktop && layout !== 'webapp';
  const openPanel = useUiStore((s) => s.open);
  useEffect(() => {
    if (drawer) openPanel('cartOpen');
  }, [drawer, openPanel]);
  if (drawer) return <Navigate to="/" replace />;
  return <CartPage />;
}
```

(`useSettings` may now be unused in router.tsx — remove the import if so.)

`web/src/features/catalog/CatalogPage.tsx`:

```tsx
import { useSettings } from '@/app/settings.ts';
import { useEffectiveLayout } from '@/app/layout.ts';
import { ProductGrid } from '@/features/catalog/ProductGrid.tsx';
import { ProductList } from '@/features/catalog/ProductList.tsx';
import { WholesaleCatalogPage } from '@/features/wholesale/WholesaleCatalogPage.tsx';

/**
 * The one route (`/` and `/c/:categorySlug`) behind three catalogue bodies. The
 * client's flags decide which: wholesale replaces the catalogue under any shell,
 * otherwise the grid for the storefront layout and the dense list for the menu
 * and web app layouts.
 */
export function CatalogPage() {
  const { features } = useSettings();
  const layout = useEffectiveLayout();
  if (features.wholesale) return <WholesaleCatalogPage />;
  if (layout !== 'storefront') return <ProductList />;
  return <ProductGrid />;
}
```

`web/src/features/wholesale/WholesaleCatalogPage.tsx:90` — this line sits after early returns, so use the pure function, not the hook. Import `effectiveLayout` from `'@/app/layout.ts'` and `isTelegramWebApp` from `'@/lib/telegram-webapp.ts'`, then:

```ts
  // The menu and web app shells keep their search in the bar at every width; the
  // storefront header drops it below 62em, so there the sheet carries its own.
  const ownSearch = effectiveLayout(features.layout, isTelegramWebApp()) === 'storefront';
```

- [ ] **Step 7: Templates see the effective layout**

`web/src/templates/runtime.tsx` — import `effectiveLayout` from `'@/app/layout.ts'` and `isTelegramWebApp` from `'@/lib/telegram-webapp.ts'`; in `Slot`'s `base`:

```ts
    layout: effectiveLayout(settings.features?.layout, isTelegramWebApp()),
```

Every built-in footer slot already renders nothing unless `layout === 'storefront'`, so the web app gets no footer from any template without further changes.

`web/src/templates/slots.ts:10` — change the trailing comment to:

```ts
  layout: LayoutKind;      // 'storefront' | 'menu' | 'webapp' (always 'webapp' inside Telegram)
```

`docs/templates.md`:
- line ~338 (the copied `SlotBaseProps` block): same comment change as `slots.ts`.
- in the "Where each slot renders" table: `TopBar` row → "first child of `StorefrontShell` and `MenuShell` (not on `Chromeless`, not in `WebAppShell` — Telegram owns the top of the screen there)"; `Footer` row → append "; `WebAppShell`: not rendered"; `Overlay` row → "last child of every shell".
- after the table, add one paragraph:

```md
The `webapp` layout (Telegram Mini App, or any store that picks it for browsers) renders no
`TopBar` and no `Footer`. It does render `CatalogHero`, `SectionLabel`, `Overlay` and
`ButtonAdornment`, exactly as the menu layout does. A template that branches on `layout` should
treat `'webapp'` like `'menu'` unless it has a reason not to; external templates built before
this value existed keep working because every built-in check is `layout !== 'storefront'`.
```

- [ ] **Step 8: E2E fixtures carry the new field**

In both `e2e/fixtures/settings.menu.json` and `e2e/fixtures/settings.storefront.json`, add next to `"turnstile"`:

```json
  "telegramWebApp": { "mode": "off" },
```

(mind the comma on the preceding line so the JSON stays valid).

- [ ] **Step 9: Typecheck, unit tests, existing e2e unchanged**

Run: `npm --prefix web run typecheck && npm --prefix web test && npm run test:e2e -- storefront.spec.ts`
Expected: clean typecheck; unit tests pass; the storefront e2e spec passes unchanged (a plain browser still gets `storefront`/`menu` exactly as before).

- [ ] **Step 10: Commit**

```bash
git add web/src/types/settings.ts web/src/app/layout.ts web/src/layouts/WebAppShell.tsx web/src/app/router.tsx web/src/features/catalog/CatalogPage.tsx web/src/features/wholesale/WholesaleCatalogPage.tsx web/src/templates/runtime.tsx web/src/templates/slots.ts docs/templates.md e2e/fixtures web/test/effective-layout.test.ts
git commit -m "feat(web): webapp layout value; Telegram always gets it"
```


---

### Task 4: `WebAppShell` and the primary action

**Before any UI code:** invoke the `frontend-design` skill (user rule for all storefront UI work), and design at **390×844 first** (user rule since the bento redesign) — the desktop width is only a centred column.

**Files:**
- Create: `web/src/stores/primary-action.ts`
- Create: `web/src/features/webapp/default-action.ts`
- Create: `web/src/features/webapp/PrimaryActionBar.tsx`, `web/src/features/webapp/PrimaryActionBar.module.css`
- Create: `web/src/features/webapp/useTelegramChrome.ts`
- Replace: `web/src/layouts/WebAppShell.tsx` (Task 3's placeholder); Create: `web/src/layouts/WebAppShell.module.css`
- Modify: `web/src/features/checkout/CheckoutPage.tsx` (imports; new hook call just before the `if (guest && !settings.turnstile)` early return ~line 535; submit outcome ~line 510; nav button ~line 694)
- Modify: `web/src/features/cart/CartSummary.tsx` (no duplicate Checkout button in the webapp layout)
- Test: `web/test/default-action.test.ts`, `web/test/primary-action.test.tsx`

**Interfaces:**
- Consumes (Task 1): `isTelegramWebApp`, `tgReady`, `tgExpand`, `setChromeColors`, `setMainButton`, `MainButtonState`, `setBackButton`, `haptic`, `setClosingConfirmation`, `setVerticalSwipes`, `openExternalLink`, `watchSafeAreas`, `readableTextOn` from `@/lib/telegram-webapp.ts`. (Task 3): `useEffectiveLayout()` from `@/app/layout.ts`.
- Produces:
  - `interface PrimaryAction { label: string; onClick: () => void; disabled?: boolean; busy?: boolean }`, `usePrimaryActionStore` (`{ override: PrimaryAction | null; setOverride(a: PrimaryAction | null): void }`), `usePrimaryAction(action: PrimaryAction | null): void` — `@/stores/primary-action.ts`
  - `defaultPrimaryAction(input: DefaultActionInput): DefaultAction | null` with `DefaultActionInput = { pathname: string; count: number; subtotalLabel: string; checkoutTo: string; ordering: boolean; wholesale: boolean; blocked: boolean }` and `DefaultAction = { label: string; to: string; disabled: boolean }` — `@/features/webapp/default-action.ts`. (Adds `blocked`/`disabled` to the brief's shape: the cart must not offer Checkout over a withdrawn/over-limit line, same rule as `MobileCartBar`.)
  - `PrimaryActionBar` component, `useResolvedPrimaryAction(): PrimaryAction | null`, `usePrimaryBarShowing(): boolean` — `@/features/webapp/PrimaryActionBar.tsx`
  - `useTelegramChrome(): void` — `@/features/webapp/useTelegramChrome.ts`
  - `WebAppShell` — `@/layouts/WebAppShell.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
// web/test/default-action.test.ts
import { describe, expect, it } from 'vitest';
import { defaultPrimaryAction } from '@/features/webapp/default-action.ts';

const base = { pathname: '/', count: 2, subtotalLabel: '£24.00', checkoutTo: '/checkout', ordering: true, wholesale: false, blocked: false };

describe('defaultPrimaryAction', () => {
  it('offers the cart from the catalogue once something is in it', () => {
    expect(defaultPrimaryAction(base)).toEqual({ label: 'View cart · £24.00', to: '/cart', disabled: false });
  });

  it('offers the cart from a category and from a product sheet', () => {
    expect(defaultPrimaryAction({ ...base, pathname: '/c/tea' })?.to).toBe('/cart');
    expect(defaultPrimaryAction({ ...base, pathname: '/account/orders' })?.to).toBe('/cart');
  });

  it('offers checkout from the cart, to wherever checkout lives for this shopper', () => {
    expect(defaultPrimaryAction({ ...base, pathname: '/cart', checkoutTo: '/login?returnTo=%2Fcheckout' }))
      .toEqual({ label: 'Checkout · £24.00', to: '/login?returnTo=%2Fcheckout', disabled: false });
  });

  it('holds checkout while a line is flagged', () => {
    expect(defaultPrimaryAction({ ...base, pathname: '/cart', blocked: true })?.disabled).toBe(true);
  });

  it('stands down on checkout — the page registers its own action', () => {
    expect(defaultPrimaryAction({ ...base, pathname: '/checkout' })).toBeNull();
  });

  it('has nothing to offer with an empty cart, ordering off, or wholesale', () => {
    expect(defaultPrimaryAction({ ...base, count: 0 })).toBeNull();
    expect(defaultPrimaryAction({ ...base, pathname: '/cart', count: 0 })).toBeNull();
    expect(defaultPrimaryAction({ ...base, ordering: false })).toBeNull();
    expect(defaultPrimaryAction({ ...base, wholesale: true })).toBeNull();
  });

  it('never points at the page the shopper is already on', () => {
    expect(defaultPrimaryAction({ ...base, pathname: '/login' })?.to).toBe('/cart');
    expect(defaultPrimaryAction({ ...base, pathname: '/order-placed' })).toBeNull();
  });
});
```

```tsx
// web/test/primary-action.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePrimaryAction, usePrimaryActionStore } from '@/stores/primary-action.ts';

afterEach(() => usePrimaryActionStore.setState({ override: null }));

describe('usePrimaryAction', () => {
  it('publishes the action while mounted and clears it on unmount', () => {
    const onClick = vi.fn();
    const { unmount } = renderHook(() => usePrimaryAction({ label: 'Continue', onClick }));
    expect(usePrimaryActionStore.getState().override?.label).toBe('Continue');
    unmount();
    expect(usePrimaryActionStore.getState().override).toBeNull();
  });

  it('calls the latest handler without republishing on every render', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ fn }) => usePrimaryAction({ label: 'Continue', onClick: fn }), { initialProps: { fn: first } });
    const published = usePrimaryActionStore.getState().override;
    rerender({ fn: second });
    expect(usePrimaryActionStore.getState().override).toBe(published);
    published!.onClick();
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it('republishes when the label, disabled or busy state changes', () => {
    const { rerender } = renderHook(({ busy }) => usePrimaryAction({ label: 'Place order', onClick: () => {}, busy }), { initialProps: { busy: false } });
    rerender({ busy: true });
    expect(usePrimaryActionStore.getState().override?.busy).toBe(true);
  });

  it('publishes nothing for null', () => {
    renderHook(() => usePrimaryAction(null));
    expect(usePrimaryActionStore.getState().override).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix web test -- test/default-action.test.ts test/primary-action.test.tsx`
Expected: FAIL — cannot resolve `@/features/webapp/default-action.ts` / `@/stores/primary-action.ts`.

- [ ] **Step 3: Implement the store and the default action**

```ts
// web/src/stores/primary-action.ts
import { useEffect, useRef } from 'react';
import { create } from 'zustand';

/** The one thing the shopper most likely wants to do next, shown as Telegram's
 *  MainButton inside the Mini App and as a fixed bar in a browser. */
export interface PrimaryAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}

interface PrimaryActionState {
  /** A page's own action (checkout's Continue / Place order); beats the cart default. */
  override: PrimaryAction | null;
  setOverride: (action: PrimaryAction | null) => void;
}

export const usePrimaryActionStore = create<PrimaryActionState>()((set) => ({
  override: null,
  setOverride: (override) => set({ override }),
}));

/**
 * Lets a page claim the primary action while it is mounted. The published
 * object only changes when what the button *shows* changes — label, disabled,
 * busy — and its onClick forwards to the latest handler through a ref, so a
 * page that re-renders on every keystroke doesn't make Telegram's MainButton
 * flicker through offClick/onClick on each one.
 */
export function usePrimaryAction(action: PrimaryAction | null): void {
  const handler = useRef<(() => void) | null>(null);
  handler.current = action?.onClick ?? null;

  const present = action !== null;
  const label = action?.label ?? '';
  const disabled = action?.disabled ?? false;
  const busy = action?.busy ?? false;

  useEffect(() => {
    const { setOverride } = usePrimaryActionStore.getState();
    if (!present) {
      setOverride(null);
      return;
    }
    setOverride({ label, disabled, busy, onClick: () => handler.current?.() });
    return () => setOverride(null);
  }, [present, label, disabled, busy]);
}
```

```ts
// web/src/features/webapp/default-action.ts
export interface DefaultActionInput {
  pathname: string;
  count: number;
  /** The cart subtotal, already formatted in the store's currency. */
  subtotalLabel: string;
  /** `checkoutTarget(loggedIn, guestCheckout)` — /checkout, or login first. */
  checkoutTo: string;
  ordering: boolean;
  wholesale: boolean;
  /** A line the server has withdrawn or that breaks an order limit is on the order. */
  blocked: boolean;
}

export interface DefaultAction {
  label: string;
  to: string;
  disabled: boolean;
}

/** Routes that are the end of a purchase: nothing to push the shopper towards. */
const TERMINAL = ['/checkout', '/order-placed', '/order/', '/payment/'];

/**
 * The web app's standing primary action, when no page has claimed one: the way
 * into the cart from anywhere, and the way out of the cart into checkout. The
 * wholesale sheet flies its own tab, and a shop that isn't taking orders has
 * nothing to put behind the button.
 */
export function defaultPrimaryAction(input: DefaultActionInput): DefaultAction | null {
  const { pathname, count, subtotalLabel, checkoutTo, ordering, wholesale, blocked } = input;
  if (!ordering || wholesale || count === 0) return null;
  if (TERMINAL.some((p) => pathname === p || (p.endsWith('/') && pathname.startsWith(p)))) return null;
  if (pathname === '/cart') return { label: `Checkout · ${subtotalLabel}`, to: checkoutTo, disabled: blocked };
  return { label: `View cart · ${subtotalLabel}`, to: '/cart', disabled: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test -- test/default-action.test.ts test/primary-action.test.tsx`
Expected: PASS (11 tests).

- [ ] **Step 5: Implement `PrimaryActionBar`**

```css
/* web/src/features/webapp/PrimaryActionBar.module.css
   The browser stand-in for Telegram's MainButton: the running tab's band, one
   full-width button. Inside Telegram this renders nothing — the native button
   sits in the same place, painted in the shop's primary. */
.bar {
  composes: bar from '../cart/MobileCartBar.module.css';
}

.inner {
  composes: inner from '../cart/MobileCartBar.module.css';
  max-width: var(--sf-rail-max, 35rem);
}

.action {
  composes: checkout from '../cart/MobileCartBar.module.css';
  margin-left: 0;
}

.action[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Telegram's own bottom inset (home indicator) when a browser tab is a Mini App
   opened in an external browser — 0 everywhere else. */
.safe {
  height: var(--tg-safe-bottom, 0px);
}
```

```tsx
// web/src/features/webapp/PrimaryActionBar.tsx
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { useCartStore, selectCount, selectSubtotal } from '@/stores/cart.ts';
import { usePrimaryActionStore, type PrimaryAction } from '@/stores/primary-action.ts';
import { useServerCart } from '@/features/cart/useServerCart.ts';
import { checkoutTarget } from '@/features/cart/checkout-target.ts';
import { defaultPrimaryAction } from '@/features/webapp/default-action.ts';
import { formatMoney } from '@/lib/format.ts';
import { isTelegramWebApp, readableTextOn, setMainButton } from '@/lib/telegram-webapp.ts';
import { Slot } from '@/templates/runtime.tsx';
import classes from '@/features/webapp/PrimaryActionBar.module.css';

/** A page's own action if it claimed one, else the cart default for this route. */
export function useResolvedPrimaryAction(): PrimaryAction | null {
  const override = usePrimaryActionStore((s) => s.override);
  const { currency, features } = useSettings();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const count = useCartStore(selectCount);
  const subtotal = useCartStore((s) => selectSubtotal(s.lines));
  const { issues } = useServerCart();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  if (override) return override;
  const fallback = defaultPrimaryAction({
    pathname,
    count,
    subtotalLabel: formatMoney(subtotal, currency),
    checkoutTo: checkoutTarget(loggedIn, features.guestCheckout),
    ordering: features.ordering,
    wholesale: features.wholesale,
    blocked: issues.some((i) => i.inactive || i.belowMin || i.aboveMax),
  });
  if (!fallback) return null;
  return { label: fallback.label, disabled: fallback.disabled, onClick: () => navigate(fallback.to) };
}

/** Whether the in-page bar is on screen, so the shell can leave room under the content. */
export function usePrimaryBarShowing(): boolean {
  return !isTelegramWebApp() && useResolvedPrimaryAction() !== null;
}

function primaryColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--sf-primary').trim() || '#000000';
}

export function PrimaryActionBar() {
  const action = useResolvedPrimaryAction();
  const native = isTelegramWebApp();

  const label = action?.label ?? null;
  const disabled = action?.disabled ?? false;
  const busy = action?.busy ?? false;
  const onClick = action?.onClick;

  // Telegram: drive the native MainButton in the shop's primary, never Telegram's theme.
  useEffect(() => {
    if (!native) return;
    if (label === null || !onClick) {
      setMainButton(null);
      return;
    }
    const color = primaryColor();
    setMainButton({ text: label, onClick, color, textColor: readableTextOn(color), disabled, busy });
  }, [native, label, disabled, busy, onClick]);

  useEffect(() => (native ? () => setMainButton(null) : undefined), [native]);

  if (native || !action) return null;

  return (
    <div className={classes.bar} data-sf-part="primary-bar">
      <div className={classes.inner}>
        <button
          type="button"
          className={classes.action}
          onClick={action.onClick}
          disabled={action.disabled || action.busy}
          aria-busy={action.busy || undefined}
          data-sf-part="button"
          data-variant="filled"
          data-sf-cta="main"
        >
          {action.label}
          <Slot name="ButtonAdornment" variant="primary" cta busy={action.busy} />
        </button>
      </div>
      <div className={classes.safe} />
    </div>
  );
}
```

Note on `onClick` identity: the override's `onClick` is stable (Step 3); the default's is a fresh closure each render, so the effect re-runs on each render of the bar — cheap, and `setMainButton` swaps the handler with `offClick`/`onClick` (Task 1). If that shows as MainButton flicker on a real device, memoise the default with `useMemo` on `[fallback?.label, fallback?.to, fallback?.disabled]`.

- [ ] **Step 6: Implement `useTelegramChrome`**

```ts
// web/src/features/webapp/useTelegramChrome.ts
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

  // Re-applied when the theme changes (admin preview, a settings refetch). The
  // effect runs after TemplateProvider has written the variables for this theme.
  useEffect(() => {
    const bg = cssVar('--sf-bg', '#000000');
    setChromeColors({ header: bg, background: bg, bottomBar: cssVar('--sf-surface', bg) });
  }, [theme]);

  useEffect(() => {
    if (pathname === '/') {
      setBackButton(null);
      return;
    }
    // idx is react-router's own history index; 0 means this Mini App was opened
    // straight onto a deep link and "back" would leave the shop.
    const first = (window.history.state as { idx?: number } | null)?.idx === 0;
    setBackButton(() => (first ? navigate('/', { replace: true }) : navigate(-1)));
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
```

- [ ] **Step 7: Implement `WebAppShell`**

```css
/* web/src/layouts/WebAppShell.module.css
   The Mini App shell: MenuShell's compact bar and list column, narrowed to a
   phone column everywhere. No footer, no contact strip, no cart drawer — the
   primary action (Telegram's MainButton, or the in-page bar) is the foot. */
.shell {
  composes: shell from './MenuShell.module.css';
  --sf-rail-max: 35rem;
}

.bar { composes: bar from './MenuShell.module.css'; }
.barInner { composes: barInner from './MenuShell.module.css'; }
.home { composes: home from './MenuShell.module.css'; }
.search { composes: search from './MenuShell.module.css'; }
.actions { composes: actions from './MenuShell.module.css'; }
.action { composes: action from './MenuShell.module.css'; }
.count { composes: count from './MenuShell.module.css'; }
.mark { composes: mark from './MenuShell.module.css'; }
.main { composes: main from './MenuShell.module.css'; }

/* Telegram fullscreen puts its own controls over the top of the page; both
   insets are 0 in a normal Mini App and in a browser. */
.safeTop {
  height: calc(var(--tg-safe-top, 0px) + var(--tg-content-safe-top, 0px));
}

/* The back chevron points left: ChevronIcon draws down. */
.back svg {
  transform: rotate(90deg);
}

/* Room for the in-page bar (browser only — Telegram's MainButton sits outside the WebView). */
.withBar {
  padding-bottom: calc(76px + var(--tg-safe-bottom, 0px));
}

/* Telegram keeps the WebView above its MainButton, but the home indicator can
   still cover the last row. */
.native {
  padding-bottom: var(--tg-safe-bottom, 0px);
}
```

```tsx
// web/src/layouts/WebAppShell.tsx
import { Suspense, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { useCartStore, selectCount } from '@/stores/cart.ts';
import { useUiStore } from '@/stores/ui.ts';
import { Brand } from '@/components/Brand.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { BagIcon, ChevronIcon, FilterIcon, UserIcon } from '@/components/icons.tsx';
import { NoticeBanners } from '@/features/notices/NoticeBanners.tsx';
import { CutoffBar } from '@/features/notices/CutoffBar.tsx';
import { LoginModal } from '@/features/auth/LoginModal.tsx';
import { PrimaryActionBar, usePrimaryBarShowing } from '@/features/webapp/PrimaryActionBar.tsx';
import { useTelegramChrome } from '@/features/webapp/useTelegramChrome.ts';
import { SearchField } from '@/layouts/SearchField.tsx';
import type { ShellSearchContext } from '@/layouts/shell-context.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
import { Slot } from '@/templates/runtime.tsx';
import classes from '@/layouts/WebAppShell.module.css';

/**
 * The `webapp` layout: always inside Telegram, and wherever a store picks it.
 * The same list, sheets and template as the menu layout, with Telegram owning
 * the top chrome (so no TopBar slot) and the primary action owning the foot
 * (so no Footer slot, no contact strip, no cart drawer — contact lives on the
 * profile page). Outside Telegram the header grows a back chevron and the
 * primary action becomes an in-page bar.
 */
export function WebAppShell() {
  const { brand, features } = useSettings();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const cartCount = useCartStore(selectCount);
  const openPanel = useUiStore((s) => s.open);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const outletContext = useMemo<ShellSearchContext>(() => ({ search, setSearch }), [search]);
  const native = isTelegramWebApp();
  const barShowing = usePrimaryBarShowing();

  useTelegramChrome();

  const onCatalog = pathname === '/' || pathname.startsWith('/c/');
  const canFilter = onCatalog && !features.wholesale;
  const filtered = pathname.startsWith('/c/');
  const showBack = !native && !onCatalog;

  const shellClass = [classes.shell, barShowing ? classes.withBar : '', native ? classes.native : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClass} data-sf-layout="webapp">
      <header className={classes.bar} data-sf-part="header">
        <div className={classes.safeTop} />
        <div className={classes.barInner}>
          {showBack ? (
            <button
              type="button"
              className={`${classes.action} ${classes.back}`}
              onClick={() => navigate(-1)}
              aria-label="Back"
            >
              <ChevronIcon size={17} />
            </button>
          ) : null}

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
                to={loggedIn || native ? '/account' : '/login'}
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
                {cartCount > 0 ? <span className={classes.count} data-sf-part="badge">{cartCount}</span> : null}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <NoticeBanners />
      <CutoffBar />

      <main className={classes.main} data-sf-part="main">
        <Suspense fallback={<PageSkeleton inline />}>
          <Outlet context={outletContext} />
        </Suspense>
      </main>

      <PrimaryActionBar />

      {features.accounts && !native ? <LoginModal /> : null}

      <Slot name="Overlay" />
    </div>
  );
}
```

(`CatalogHero` is rendered by `ProductList` itself, not by the shell — check `MenuShell` renders no `CatalogHero` slot; it doesn't, so nothing to add here.)

- [ ] **Step 8: No second Checkout button on the cart page in the webapp layout**

In `web/src/features/cart/CartSummary.tsx` import `useEffectiveLayout` from `@/app/layout.ts`, and in `CartSummary`:

```tsx
  // The web app's primary action is the checkout button there — a second one
  // in the summary would be the same action twice, one thumb-width apart.
  const primaryElsewhere = useEffectiveLayout() === 'webapp';
```

Wrap the existing `{blocked ? (…) : (<Link …>Checkout…</Link>)}` so that when `primaryElsewhere` is true only the held message renders:

```tsx
      {primaryElsewhere ? (
        blocked ? <p className={classes.held}>Resolve the flagged items to continue.</p> : null
      ) : blocked ? (
        /* …existing disabled button + held message, unchanged… */
      ) : (
        /* …existing Checkout <Link>, unchanged… */
      )}
```

- [ ] **Step 9: Checkout claims the primary action inside Telegram**

In `web/src/features/checkout/CheckoutPage.tsx`:

Imports:

```ts
import { formatMoney } from '@/lib/format.ts';
import { haptic, isTelegramWebApp, openExternalLink } from '@/lib/telegram-webapp.ts';
import { usePrimaryAction } from '@/stores/primary-action.ts';
```

After `const navigate = useNavigate();`:

```ts
  // Inside Telegram the nav's primary button is Telegram's MainButton (Back stays in the page).
  const inTelegram = isTelegramWebApp();
```

In `submit()`, replace

```ts
      const outcome = resolveCheckoutOutcome(result);
      if (outcome.kind === 'external') window.location.assign(outcome.url);
      else navigate(outcome.to, { replace: true });
```

with

```ts
      if (inTelegram) haptic.notify('success');
      const outcome = resolveCheckoutOutcome(result);
      if (outcome.kind === 'external' && inTelegram) {
        // Some gateways refuse to run inside Telegram's WebView: pay in the
        // browser, and leave the Mini App on the order so the shopper comes back
        // to its status rather than an empty checkout.
        openExternalLink(outcome.url);
        navigate(orderPath ?? `/order-placed?${new URLSearchParams({ order: result.reference })}`, { replace: true });
      } else if (outcome.kind === 'external') {
        window.location.assign(outcome.url);
      } else {
        navigate(outcome.to, { replace: true });
      }
```

(`orderPath` is the `const orderPath = publicOrderPath(result.publicUrl);` already computed a few lines above for `saveOrder`.)

Immediately **before** `if (guest && !settings.turnstile) {` (hooks must run before the early returns), add:

```ts
  const lastStep = step === STEPS.length - 1;
  const showsForm = !(guest && !settings.turnstile) && !(lines.length === 0 && !placed);
  usePrimaryAction(
    inTelegram && showsForm
      ? {
          label: !lastStep
            ? 'Continue'
            : submitting
              ? 'Placing order…'
              : chargeTotal !== null && chargeTotal > 0
                ? `Place order · ${formatMoney(chargeTotal, currency)}`
                : 'Place order',
          onClick: lastStep ? () => void submit() : next,
          disabled: submitting || locked || (lastStep && guest && verifying),
          busy: submitting,
        }
      : null,
  );
```

In the nav, render the in-page primary buttons only outside Telegram — wrap the existing `{onReview ? (<button …Place order…/>) : (<button …Continue…/>)}` block:

```tsx
            {inTelegram ? null : onReview ? (
              /* …existing Place order button, unchanged… */
            ) : (
              /* …existing Continue button, unchanged… */
            )}
```

- [ ] **Step 10: Typecheck and run the web suite**

Run: `npm --prefix web run typecheck && npm --prefix web test`
Expected: clean typecheck; all tests pass. `checkout-page.test.tsx` runs outside Telegram (no `window.Telegram`), so its Continue/Place order assertions are unaffected.

- [ ] **Step 11: Look at it**

Run `npm run dev:web` (with the mocked backend or a real one), open DevTools device mode at **390×844**, set the store layout to `webapp` (or `localStorage` a settings override via the admin), and check: header fits one row with brand, search, filter, account and bag; the first product row is in the first screen; adding an item shows the bar "View cart · …"; the bar never covers the last row; at 1280px the column is centred at ~560px. Fix spacing against the `frontend-design` guidance before committing.

- [ ] **Step 12: Commit**

```bash
git add web/src/stores/primary-action.ts web/src/features/webapp web/src/layouts/WebAppShell.tsx web/src/layouts/WebAppShell.module.css web/src/features/checkout/CheckoutPage.tsx web/src/features/cart/CartSummary.tsx web/test/default-action.test.ts web/test/primary-action.test.tsx
git commit -m "feat(webapp): WebAppShell with Telegram MainButton/BackButton and in-page primary bar"
```

---

### Task 5: The account inside Telegram

**Files:**
- Modify: `web/src/api/profile.ts` (append `setBotMode`)
- Modify: `web/src/features/account/ProfilePage.tsx`
- Modify: `web/src/features/account/Account.module.css` (append two classes)
- Test: `web/test/profile-telegram.test.tsx`

**Interfaces:**
- Consumes: `isTelegramWebApp`, `tgClose` (Task 1); `useEffectiveLayout` (Task 3); `settings.telegramWebApp?.mode` (Task 3 types); backend `POST storefront/account/bot-mode { classic }` → `{ classic: boolean }`.
- Produces: `setBotMode(classic: boolean): Promise<{ classic: boolean }>` in `@/api/profile.ts`; `ClassicBotSwitch` (local to ProfilePage).

- [ ] **Step 1: Write the failing test**

```tsx
// web/test/profile-telegram.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';

const m = vi.hoisted(() => ({
  inTelegram: true,
  mode: 'beta' as 'off' | 'beta' | 'forced',
  setBotMode: vi.fn(async (classic: boolean) => ({ classic })),
  tgClose: vi.fn(),
}));

vi.mock('@/lib/telegram-webapp.ts', () => ({ isTelegramWebApp: () => m.inTelegram, tgClose: m.tgClose }));
vi.mock('@/api/profile.ts', () => ({ setBotMode: m.setBotMode }));
vi.mock('@/app/layout.ts', () => ({ useEffectiveLayout: () => (m.inTelegram ? 'webapp' : 'storefront') }));
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({
    currency: 'GBP',
    telegramWebApp: { mode: m.mode },
    brand: { name: 'Shop', links: { whatsapp: null, telegram: 'https://t.me/shop' } },
    supportLinks: [],
  }),
}));
vi.mock('@/components/ContactLinks.tsx', () => ({ ContactLinks: () => <div data-testid="contact" /> }));
vi.mock('@/features/account/queries.ts', () => ({
  useProfile: () => ({
    isPending: false,
    isError: false,
    data: {
      nickname: 'Ada', memberSince: '2026-01-01T00:00:00.000Z', totalOrders: 2, totalSpend: 40,
      identities: { telegram: true, whatsapp: false, email: false },
    },
  }),
}));

import { ProfilePage } from '@/features/account/ProfilePage.tsx';

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  m.inTelegram = true;
  m.mode = 'beta';
});
afterEach(() => vi.clearAllMocks());

describe('ProfilePage in the Telegram Mini App', () => {
  it('has no sign-out — identity is the Telegram account', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('shows contact links in place of the footer strip', () => {
    renderPage();
    expect(screen.getByTestId('contact')).toBeInTheDocument();
  });

  it('switches to the classic bot after a confirmation, then closes the Mini App', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to the classic bot' }));
    expect(m.setBotMode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, switch' }));
    await waitFor(() => expect(m.setBotMode).toHaveBeenCalledWith(true));
    await waitFor(() => expect(m.tgClose).toHaveBeenCalled());
  });

  it('can back out of the confirmation', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to the classic bot' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Switch to the classic bot' })).toBeInTheDocument();
  });

  it.each(['forced', 'off'] as const)('offers no switch in %s mode', (mode) => {
    m.mode = mode;
    renderPage();
    expect(screen.queryByRole('button', { name: 'Switch to the classic bot' })).toBeNull();
  });
});

describe('ProfilePage in a browser', () => {
  it('keeps sign-out and offers no bot switch', () => {
    m.inTelegram = false;
    renderPage();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Switch to the classic bot' })).toBeNull();
    expect(screen.queryByTestId('contact')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web test -- test/profile-telegram.test.tsx`
Expected: FAIL — `setBotMode` is not exported / Sign out still rendered in Telegram.

- [ ] **Step 3: API**

Append to `web/src/api/profile.ts`:

```ts
/** Beta web app mode only: hand this shopper back to the classic bot (`true`) or
 *  to the Mini App (`false`). The backend 422s in forced/off mode. */
export const setBotMode = (classic: boolean) =>
  unwrap<{ classic: boolean }>(api.post('storefront/account/bot-mode', { json: { classic } }));
```

- [ ] **Step 4: ProfilePage**

Imports to add:

```ts
import { useSettings } from '@/app/settings.ts';
import { useEffectiveLayout } from '@/app/layout.ts';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { setBotMode } from '@/api/profile.ts';
import { errorMessage } from '@/lib/errors.ts';
import { isTelegramWebApp, tgClose } from '@/lib/telegram-webapp.ts';
```

Add above `export function ProfilePage()`:

```tsx
/**
 * Beta web app mode's way back to the classic bot. Two taps, not a dialog: the
 * first says what will happen, the second does it. The backend flips the flag,
 * resets this chat's menu button and drops a "back to the menu" message in the
 * chat; the Mini App then closes so the shopper lands on that message.
 */
function ClassicBotSwitch() {
  const [stage, setStage] = useState<'idle' | 'confirm' | 'busy'>('idle');
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setStage('busy');
    setError(null);
    try {
      await setBotMode(true);
      tgClose();
    } catch (err) {
      setError(errorMessage(err, "We couldn't switch you — try again"));
      setStage('confirm');
    }
  };

  return (
    <section className={classes.section} aria-label="Classic bot">
      <div className={classes.sectionHead}>
        <h3 className={classes.sectionTitle}>Prefer the classic bot?</h3>
      </div>
      <p className={classes.note}>
        Shop with buttons in the chat instead of this app. You can come back from the bot&rsquo;s menu any time.
      </p>
      {stage === 'idle' ? (
        <button type="button" className={classes.switchBot} onClick={() => setStage('confirm')}>
          Switch to the classic bot
        </button>
      ) : (
        <div className={classes.switchConfirm}>
          <button type="button" className={classes.switchBot} onClick={() => void confirm()} disabled={stage === 'busy'}>
            {stage === 'busy' ? 'Switching…' : 'Yes, switch'}
          </button>
          <button type="button" className={classes.logout} onClick={() => setStage('idle')} disabled={stage === 'busy'}>
            Cancel
          </button>
        </div>
      )}
      {error ? <p className={classes.note} role="alert">{error}</p> : null}
    </section>
  );
}
```

Inside `ProfilePage`, after `const [signingOut, setSigningOut] = useState(false);`:

```ts
  const settings = useSettings();
  const inTelegram = isTelegramWebApp();
  const webapp = useEffectiveLayout() === 'webapp';
```

Replace the trailing Sign out `<button …>` with:

```tsx
      {webapp ? (
        <section className={classes.section} aria-label="Contact">
          <div className={classes.sectionHead}>
            <h3 className={classes.sectionTitle}>Talk to us</h3>
          </div>
          <ContactLinks variant="inline" />
        </section>
      ) : null}

      {inTelegram && settings.telegramWebApp?.mode === 'beta' ? <ClassicBotSwitch /> : null}

      {/* Inside Telegram the identity is the Telegram account: signing out would
          only sign straight back in on the next launch. */}
      {inTelegram ? null : (
        <button
          type="button"
          className={classes.logout}
          onClick={() => void signOut()}
          disabled={signingOut}
        >
          {signingOut ? 'Signing out' : 'Sign out'}
        </button>
      )}
```

Append to `web/src/features/account/Account.module.css`:

```css
/* The classic-bot switch: the sign-out button's quiet voice, since it is the
   same kind of act — leaving this surface — not a purchase. */
.switchBot {
  composes: logout;
}

.switchConfirm {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm --prefix web test -- test/profile-telegram.test.tsx && npm --prefix web run typecheck`
Expected: PASS (7 tests); clean typecheck. If `ContactLinks` renders nothing when the brand has no chat links, that's intended — the section header still says where contact would be; drop the section when `!brand.links.whatsapp && !brand.links.telegram && supportLinks.length === 0` if the empty header looks wrong in the browser check.

- [ ] **Step 6: Commit**

```bash
git add web/src/api/profile.ts web/src/features/account/ProfilePage.tsx web/src/features/account/Account.module.css web/test/profile-telegram.test.tsx
git commit -m "feat(account): classic-bot switch and contact in the Mini App; no sign-out in Telegram"
```

---

### Task 6: End-to-end pass, docs, release

**Files:**
- Create: `e2e/telegram-stub.js`
- Modify: `e2e/mocks.ts` (`Layout`, `InstallMocksOptions`, `MockState`, settings fixture pick, two routes, `installTelegramStub`)
- Modify: `e2e/flows.ts` (`webapp` behaves like `menu`; `fillCheckout` accepts an advance function)
- Create: `e2e/telegram-webapp.spec.ts`
- Modify: `README.md` (Deploying → Telegram Mini App; Releases v0.5.0), `docs/templates.md` (slot note, if Task 3 didn't add it)
- Modify: `web/package.json` (`"version": "0.5.0"`)

**Interfaces:**
- Consumes: everything above; the sign-in error card from Task 2 (`TelegramSignInError`, text matching `/couldn.t sign you in/i`, a `Try again`/`Retry` button).
- Produces: `installTelegramStub(page: Page): Promise<void>`; `InstallMocksOptions.telegramAuthFails?: boolean`; `MockState.webappLogins: Array<Record<string, unknown>>`, `MockState.botModes: Array<Record<string, unknown>>`; `TELEGRAM_INIT_DATA` constant.

- [ ] **Step 1: The Telegram stub**

```js
// e2e/telegram-stub.js — installed with page.addInitScript before navigation.
// A recording stand-in for telegram-web-app.js: the app's loader sees
// window.Telegram.WebApp already present and never fetches the real script.
(() => {
  const calls = [];
  const rec = (name) => (...args) => { calls.push([name, ...args]); };
  const handlers = { main: [], back: [] };

  const main = {
    text: '', color: null, textColor: null, isVisible: false, isActive: true, isProgressVisible: false,
    setParams(p) {
      calls.push(['MainButton.setParams', p]);
      if ('text' in p) this.text = p.text;
      if ('color' in p) this.color = p.color;
      if ('text_color' in p) this.textColor = p.text_color;
      if ('is_visible' in p) this.isVisible = p.is_visible;
      if ('is_active' in p) this.isActive = p.is_active;
      return this;
    },
    setText(t) { this.text = t; return this; },
    show() { this.isVisible = true; return this; },
    hide() { this.isVisible = false; return this; },
    enable() { this.isActive = true; return this; },
    disable() { this.isActive = false; return this; },
    showProgress() { this.isProgressVisible = true; return this; },
    hideProgress() { this.isProgressVisible = false; return this; },
    onClick(fn) { handlers.main.push(fn); return this; },
    offClick(fn) { handlers.main = handlers.main.filter((h) => h !== fn); return this; },
  };

  const back = {
    isVisible: false,
    show() { this.isVisible = true; return this; },
    hide() { this.isVisible = false; return this; },
    onClick(fn) { handlers.back.push(fn); return this; },
    offClick(fn) { handlers.back = handlers.back.filter((h) => h !== fn); return this; },
  };

  window.Telegram = {
    WebApp: {
      initData: window.__TG_INIT_DATA__,
      initDataUnsafe: {},
      version: '8.0',
      platform: 'ios',
      colorScheme: 'light',
      // Deliberately loud colours: the app must never paint with these.
      themeParams: { bg_color: '#123456', secondary_bg_color: '#654321', button_color: '#abcdef', button_text_color: '#fedcba' },
      safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
      contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
      isVersionAtLeast: () => true,
      ready: rec('ready'),
      expand: rec('expand'),
      close: rec('close'),
      setHeaderColor: rec('setHeaderColor'),
      setBackgroundColor: rec('setBackgroundColor'),
      setBottomBarColor: rec('setBottomBarColor'),
      enableClosingConfirmation: rec('enableClosingConfirmation'),
      disableClosingConfirmation: rec('disableClosingConfirmation'),
      enableVerticalSwipes: rec('enableVerticalSwipes'),
      disableVerticalSwipes: rec('disableVerticalSwipes'),
      openLink: rec('openLink'),
      onEvent: rec('onEvent'),
      offEvent: rec('offEvent'),
      HapticFeedback: {
        impactOccurred: rec('haptic.impact'),
        notificationOccurred: rec('haptic.notify'),
        selectionChanged: rec('haptic.selection'),
      },
      MainButton: main,
      BackButton: back,
    },
  };

  window.__tg = {
    calls,
    main,
    back,
    clickMain: () => handlers.main.slice().forEach((h) => h()),
    clickBack: () => handlers.back.slice().forEach((h) => h()),
  };
})();
```

- [ ] **Step 2: Mocks**

In `e2e/mocks.ts`:

```ts
export type Layout = 'storefront' | 'menu' | 'webapp';

/** What the stub hands the app as `Telegram.WebApp.initData`, verbatim. */
export const TELEGRAM_INIT_DATA =
  'query_id=AAE&user=%7B%22id%22%3A777000111%2C%22first_name%22%3A%22Ada%22%7D&auth_date=1790000000&hash=' + 'a'.repeat(64);

const TELEGRAM_STUB = readFileSync(fileUrl('./telegram-stub.js'), 'utf8');

/** Makes the page a Telegram Mini App launch. Call before installMocks' navigation. */
export async function installTelegramStub(page: Page): Promise<void> {
  await page.addInitScript(`window.__TG_INIT_DATA__ = ${JSON.stringify(TELEGRAM_INIT_DATA)};`);
  await page.addInitScript(TELEGRAM_STUB);
}
```

(`fileUrl` is the helper already used for `turnstile-shim.js`.)

`InstallMocksOptions` gains:

```ts
  /** The Mini App sign-in answers 401, as it does for stale or forged initData. */
  telegramAuthFails?: boolean;
```

`MockState` gains:

```ts
  /** Bodies posted to the Mini App sign-in route. */
  webappLogins: Array<Record<string, unknown>>;
  /** Bodies posted to the classic-bot switch. */
  botModes: Array<Record<string, unknown>>;
```

and the `state` literal initialises both to `[]`.

The settings fixture pick — `webapp` has no fixture of its own; it is the menu fixture with the layout flipped:

```ts
    settings: options.settings ?? (() => {
      const s = read<StorefrontSettings>(`settings.${layout === 'webapp' ? 'menu' : layout}.json`);
      s.features.layout = layout;
      return s;
    })(),
```

Routes, next to the WhatsApp auth mocks:

```ts
    if (path === 'storefront/auth/telegram-webapp' && method === 'POST') {
      state.webappLogins.push(body(route));
      if (options.telegramAuthFails) {
        await fail(route, 401, 'Telegram web app session expired');
        return;
      }
      const result: LoginResult = { token: SESSION_TOKEN, customer: SESSION_CUSTOMER };
      await envelope(route, result);
      return;
    }

    if (path === 'storefront/account/bot-mode' && method === 'POST') {
      state.botModes.push(body(route));
      await envelope(route, { classic: body(route).classic === true });
      return;
    }
```

- [ ] **Step 3: Flows**

In `e2e/flows.ts`, `webapp` opens products as sheets exactly like `menu`:

```ts
const sheets = (layout: Layout) => layout !== 'storefront';
```

and replace the three `layout === 'menu'` checks in `productOpener`, `openProduct` and `addFirstToCart` with `sheets(layout)`.

`fillCheckout` gains an optional way to press the primary button (inside Telegram there is no in-page Continue):

```ts
export async function fillCheckout(
  page: Page,
  advance: () => Promise<void> = () => page.getByRole('button', { name: 'Continue' }).click(),
): Promise<void> {
```

and each `await page.getByRole('button', { name: 'Continue' }).click();` inside it becomes `await advance();`.

- [ ] **Step 4: Write the spec**

```ts
// e2e/telegram-webapp.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { installMocks, installTelegramStub, TELEGRAM_INIT_DATA, type InstallMocksOptions } from './mocks.ts';
import { addFirstToCart, fillCheckout, FIXED_NOW, openProduct } from './flows.ts';

type Tg = { calls: unknown[][]; main: { text: string; isVisible: boolean; isActive: boolean }; back: { isVisible: boolean } };
const tg = (page: Page) => page.evaluate(() => (window as unknown as { __tg: Tg }).__tg);
const mainText = async (page: Page) => (await tg(page)).main.text;
const clickMain = (page: Page) => page.evaluate(() => (window as unknown as { __tg: { clickMain(): void } }).__tg.clickMain());
const clickBack = (page: Page) => page.evaluate(() => (window as unknown as { __tg: { clickBack(): void } }).__tg.clickBack());
const callsNamed = async (page: Page, name: string) => (await tg(page)).calls.filter((c) => c[0] === name);

async function openInTelegram(page: Page, opts: InstallMocksOptions = {}) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(FIXED_NOW);
  await installTelegramStub(page);
  const mocks = await installMocks(page, { layout: 'storefront', ...opts });
  await page.goto('/');
  return mocks;
}

const firstProductName = (mocks: Awaited<ReturnType<typeof installMocks>>) =>
  mocks.state.catalog.products.find((p) => p.isActive && (p.inStock || p.isPreorder))!.displayName;

test.describe('inside Telegram', () => {
  test('signs in from initData with no login step', async ({ page }) => {
    const mocks = await openInTelegram(page);
    await expect.poll(() => mocks.state.webappLogins).toEqual([{ initData: TELEGRAM_INIT_DATA }]);
    await page.goto('/account/profile');
    await expect(page).toHaveURL(/\/account\/profile$/);
    await expect(page.getByRole('heading', { name: 'Ada' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  });

  test('uses the web app shell even when the store layout is storefront', async ({ page }) => {
    await openInTelegram(page);
    await expect(page.locator('[data-sf-layout="webapp"]')).toBeVisible();
    await expect(page.locator('[data-sf-part="product-row"]').first()).toBeVisible();
  });

  test('paints Telegram chrome from the store theme, never themeParams', async ({ page }) => {
    const mocks = await openInTelegram(page);
    await expect.poll(async () => (await callsNamed(page, 'setHeaderColor')).length).toBeGreaterThan(0);
    const bg = mocks.state.settings.theme.colors.bg.toLowerCase();
    const header = await callsNamed(page, 'setHeaderColor');
    const background = await callsNamed(page, 'setBackgroundColor');
    expect(String(header.at(-1)![1]).toLowerCase()).toBe(bg);
    expect(String(background.at(-1)![1]).toLowerCase()).toBe(bg);
    const everyArg = JSON.stringify((await tg(page)).calls).toLowerCase();
    for (const loud of ['#123456', '#654321', '#abcdef', '#fedcba']) expect(everyArg).not.toContain(loud);
  });

  test('MainButton follows the cart through to Place order', async ({ page }) => {
    const mocks = await openInTelegram(page);
    await expect.poll(() => mocks.state.webappLogins.length).toBe(1);
    await expect.poll(() => tg(page).then((t) => t.main.isVisible)).toBe(false);

    await openProduct(page, 'webapp', firstProductName(mocks));
    await addFirstToCart(page, 'webapp', mocks);
    await expect.poll(() => mainText(page)).toMatch(/^View cart · /);
    // A haptic tick for the add.
    expect((await callsNamed(page, 'haptic.impact')).length).toBeGreaterThan(0);

    await clickMain(page);
    await expect(page).toHaveURL(/\/cart$/);
    await expect.poll(() => mainText(page)).toMatch(/^Checkout · /);
    // The summary's own Checkout button stands down in favour of the MainButton.
    await expect(page.getByRole('link', { name: 'Checkout' })).toHaveCount(0);

    await clickMain(page);
    await expect(page).toHaveURL(/\/checkout$/);
    await expect.poll(() => mainText(page)).toBe('Continue');
    await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
    expect((await callsNamed(page, 'enableClosingConfirmation')).length).toBeGreaterThan(0);

    await fillCheckout(page, () => clickMain(page));
    await expect.poll(() => mainText(page)).toMatch(/^Place order/);
    await clickMain(page);
    await expect.poll(() => mocks.state.checkouts.length).toBe(1);
    expect((await callsNamed(page, 'haptic.notify')).map((c) => c[1])).toContain('success');
  });

  test('BackButton appears off the catalogue and goes back', async ({ page }) => {
    await openInTelegram(page);
    await expect.poll(() => tg(page).then((t) => t.back.isVisible)).toBe(false);
    await page.getByRole('link', { name: /^Cart, / }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect.poll(() => tg(page).then((t) => t.back.isVisible)).toBe(true);
    await clickBack(page);
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => tg(page).then((t) => t.back.isVisible)).toBe(false);
  });

  test('a rejected sign-in says so instead of offering other logins', async ({ page }) => {
    await openInTelegram(page, { telegramAuthFails: true });
    await page.goto('/account');
    await expect(page.getByText(/couldn.t sign you in/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /try again|retry/i })).toBeVisible();
    await expect(page.getByText(/WhatsApp/)).toHaveCount(0);
  });

  test('beta shops offer the classic bot, which posts and closes the Mini App', async ({ page }) => {
    const mocks = await openInTelegram(page, { tweakSettings: (s) => { s.telegramWebApp = { mode: 'beta' }; } });
    await page.goto('/account/profile');
    await page.getByRole('button', { name: 'Switch to the classic bot' }).click();
    await page.getByRole('button', { name: 'Yes, switch' }).click();
    await expect.poll(() => mocks.state.botModes).toEqual([{ classic: true }]);
    await expect.poll(async () => (await callsNamed(page, 'close')).length).toBe(1);
  });

  test('forced shops have no way back to the classic bot', async ({ page }) => {
    await openInTelegram(page, { tweakSettings: (s) => { s.telegramWebApp = { mode: 'forced' }; } });
    await page.goto('/account/profile');
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch to the classic bot' })).toHaveCount(0);
  });

  test('phone: first product in the first screen, no sideways scroll', async ({ page }) => {
    await openInTelegram(page);
    const first = page.locator('[data-sf-part="product-row"]').first();
    await expect(first).toBeVisible();
    expect((await first.boundingBox())!.y, 'first product top edge').toBeLessThan(844 - 120);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('webapp layout in a plain browser', () => {
  test('shows the in-page bar and never touches Telegram', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(FIXED_NOW);
    const mocks = await installMocks(page, { layout: 'webapp', session: true });
    await page.goto('/');
    await expect(page.locator('[data-sf-layout="webapp"]')).toBeVisible();
    expect(await page.evaluate(() => 'Telegram' in window && Boolean((window as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData))).toBe(false);
    expect(mocks.state.webappLogins).toHaveLength(0);

    await openProduct(page, 'webapp', firstProductName(mocks));
    await addFirstToCart(page, 'webapp', mocks);
    const bar = page.locator('[data-sf-part="primary-bar"]');
    await expect(bar.getByRole('button', { name: /^View cart · / })).toBeVisible();
    await bar.getByRole('button', { name: /^View cart · / }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(bar.getByRole('button', { name: /^Checkout · / })).toBeVisible();
    // In a browser the header carries a back chevron instead of Telegram's BackButton.
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
```

- [ ] **Step 5: Run the new spec**

Run: `npm run test:e2e -- telegram-webapp`
Expected: all tests pass. Likely snags and their fixes (fix the app, not the test, unless the test's assumption is wrong):
- The first-product check fails → the header or notices are too tall at 390px; tighten the shell (Task 4 CSS), not the threshold.
- `Place order` never appears → `fillCheckout`'s last `advance()` runs on the Review step's predecessor; confirm the MainButton label switches when `step` reaches the last index (Task 4 Step 9).
- `setHeaderColor` got `''` → the effect ran before the template wrote `--sf-bg`; move the colour effect's dependency to the resolved theme object from `useDocumentTheme` or wrap the read in `requestAnimationFrame`.

- [ ] **Step 6: Full regression**

Run: `npm test && npm run test:e2e`
Expected: everything green — in particular `storefront.spec.ts` and the template baselines (no layout changed for `storefront`/`menu`; `flows.ts` behaves identically for them).

- [ ] **Step 7: Docs**

`README.md` — in **Deploying**, after the manual deploy paragraph, add:

```md
### Telegram Mini App

The same deployment is the bot's Mini App — nothing extra to build. To switch a store on:

1. Deploy in order: **backend → admin SPA → storefront** (the storefront reads
   `telegramWebApp` from settings and posts to `/public/storefront/auth/telegram-webapp`;
   an older backend 404s that route and shoppers inside Telegram see the sign-in error card).
2. BotFather: `/setdomain` → the storefront hostname (the web Login Widget needs this too).
   Optionally `/newapp` for a `t.me/<bot>/<app>` link; the menu button is set by the backend.
3. Admin → Bot Settings → **Shop in web app (BETA)** → Beta. The bot then shows only a welcome
   (Open shop / Contact / Use classic bot) and notifications.

Inside Telegram the storefront always uses the `webapp` layout and signs the shopper in from
`initData`; choosing **Web app** in Admin → Storefront → Features makes browsers use it too.
Reviews, FAQ and Giveaways are not in the storefront yet — prefer Beta over Forced until they are.
```

In **Releases**, add at the top:

```md
- v0.5.0 — Telegram Mini App: opened from the bot, the storefront signs the shopper in from Telegram and uses the new `webapp` layout — the store's own template in a phone-first shell with Telegram's MainButton/BackButton, chrome painted in the store's colours, payment pages opened in the browser. `webapp` is also a layout choice for browsers (Admin → Storefront → Features). Needs the backend with `storefront_webapp_mode` and `/auth/telegram-webapp` deployed first, then the admin SPA.
```

`docs/templates.md` — if Task 3 hasn't already, under the slot list add one line: "The `webapp` layout renders neither `TopBar` nor `Footer` (Telegram owns the top chrome, the primary action owns the foot); slots receive `layout: 'webapp'` there."

- [ ] **Step 8: Version and build**

`web/package.json`: `"version": "0.4.3"` → `"version": "0.5.0"`.

Run: `npm --prefix web run build && npm test`
Expected: build succeeds; tests pass.

- [ ] **Step 9: Commit**

```bash
git add e2e/telegram-stub.js e2e/mocks.ts e2e/flows.ts e2e/telegram-webapp.spec.ts README.md docs/templates.md web/package.json
git commit -m "chore(web): v0.5.0 — Telegram Mini App"
```

Tagging `v0.5.0` and pushing are the user's (no GitHub auth in Claude's shell) — say so in the hand-off.
