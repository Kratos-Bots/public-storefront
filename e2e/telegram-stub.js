// e2e/telegram-stub.js — installed with page.addInitScript before navigation.
// A recording stand-in for telegram-web-app.js: the app's loader sees
// window.Telegram.WebApp already present and never fetches the real script.
(() => {
  const calls = [];
  const rec = (name) => (...args) => { calls.push([name, ...args]); };
  const handlers = { main: [], secondary: [], back: [] };
  // A client's Bot API version, so one scenario can run on an older client (no SecondaryButton).
  const version = window.__TG_VERSION__ || '8.0';
  const atLeast = (want) => {
    const have = version.split('.').map(Number);
    const need = want.split('.').map(Number);
    for (let i = 0; i < Math.max(have.length, need.length); i++) {
      const d = (have[i] || 0) - (need[i] || 0);
      if (d !== 0) return d > 0;
    }
    return true;
  };

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

  const secondary = {
    text: '', color: null, textColor: null, position: null, isVisible: false, isActive: true,
    setParams(p) {
      calls.push(['SecondaryButton.setParams', p]);
      if ('text' in p) this.text = p.text;
      if ('color' in p) this.color = p.color;
      if ('text_color' in p) this.textColor = p.text_color;
      if ('position' in p) this.position = p.position;
      if ('is_visible' in p) this.isVisible = p.is_visible;
      if ('is_active' in p) this.isActive = p.is_active;
      return this;
    },
    setText(t) { this.text = t; return this; },
    show() { this.isVisible = true; return this; },
    hide() { this.isVisible = false; return this; },
    showProgress() { return this; },
    hideProgress() { return this; },
    onClick(fn) { handlers.secondary.push(fn); return this; },
    offClick(fn) { handlers.secondary = handlers.secondary.filter((h) => h !== fn); return this; },
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
      version,
      platform: 'ios',
      colorScheme: 'light',
      // Deliberately loud colours: the app must never paint with these.
      themeParams: { bg_color: '#123456', secondary_bg_color: '#654321', button_color: '#abcdef', button_text_color: '#fedcba' },
      safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
      contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
      isVersionAtLeast: atLeast,
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
      // Bot API 7.10; absent on an older client, as in Telegram.
      ...(atLeast('7.10') ? { SecondaryButton: secondary } : {}),
      BackButton: back,
    },
  };

  window.__tg = {
    calls,
    main,
    secondary,
    back,
    // Live count of registered MainButton click handlers.
    mainHandlerCount: () => handlers.main.length,
    clickMain: () => handlers.main.slice().forEach((h) => h()),
    // Live count of registered SecondaryButton click handlers.
    secondaryHandlerCount: () => handlers.secondary.length,
    backHandlerCount: () => handlers.back.length,
    clickSecondary: () => handlers.secondary.slice().forEach((h) => h()),
    clickBack: () => handlers.back.slice().forEach((h) => h()),
  };
})();
