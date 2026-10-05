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
  setSecondaryButton,
  supportsSecondaryButton,
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
    SecondaryButton: bottomButton(),
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

describe('SecondaryButton', () => {
  const quiet = { color: '#1a1a1a', textColor: '#ffffff' };

  it('shows to the left of the main button, in the given colours, with one click handler', () => {
    const wa = stubWebApp();
    const first = vi.fn();
    const second = vi.fn();
    setSecondaryButton({ text: 'Back', onClick: first, ...quiet });
    expect(wa.SecondaryButton.setParams).toHaveBeenCalledWith({
      text: 'Back', color: '#1a1a1a', text_color: '#ffffff', is_active: true, is_visible: true, position: 'left',
    });
    expect(wa.SecondaryButton.onClick).toHaveBeenCalledWith(first);

    setSecondaryButton({ text: 'Back', onClick: second, ...quiet });
    expect(wa.SecondaryButton.offClick).toHaveBeenCalledWith(first);
    expect(wa.SecondaryButton.onClick).toHaveBeenLastCalledWith(second);
    expect(wa.SecondaryButton.onClick).toHaveBeenCalledTimes(2);
    expect(wa.SecondaryButton.offClick).toHaveBeenCalledTimes(1);
  });

  it('hides and drops its handler when cleared, and clearing twice unhooks nothing twice', () => {
    const wa = stubWebApp();
    const click = vi.fn();
    setSecondaryButton({ text: 'Back', onClick: click, ...quiet });
    // The module keeps the previous test's handler until the next call; start from a clean count.
    wa.SecondaryButton.offClick.mockClear();
    setSecondaryButton(null);
    setSecondaryButton(null);
    expect(wa.SecondaryButton.offClick).toHaveBeenCalledTimes(1);
    expect(wa.SecondaryButton.offClick).toHaveBeenCalledWith(click);
    expect(wa.SecondaryButton.hide).toHaveBeenCalled();
  });

  it('does not touch the main button', () => {
    const wa = stubWebApp();
    setSecondaryButton({ text: 'Back', onClick: vi.fn(), ...quiet });
    expect(wa.MainButton.setParams).not.toHaveBeenCalled();
    expect(wa.MainButton.onClick).not.toHaveBeenCalled();
  });

  it('is a no-op below 7.10 and outside Telegram', () => {
    const old = stubWebApp('7.9');
    expect(supportsSecondaryButton()).toBe(false);
    setSecondaryButton({ text: 'Back', onClick: vi.fn(), ...quiet });
    expect(old.SecondaryButton.setParams).not.toHaveBeenCalled();
    expect(old.SecondaryButton.onClick).not.toHaveBeenCalled();

    delete (window as unknown as { Telegram?: unknown }).Telegram;
    expect(supportsSecondaryButton()).toBe(false);
    expect(() => setSecondaryButton({ text: 'Back', onClick: vi.fn(), ...quiet })).not.toThrow();
  });

  it('reports support from 7.10 when the client has the button', () => {
    stubWebApp('7.10');
    expect(supportsSecondaryButton()).toBe(true);
    stubWebApp('8.0', { SecondaryButton: undefined });
    expect(supportsSecondaryButton()).toBe(false);
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
