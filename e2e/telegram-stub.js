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
    // Live count of registered MainButton click handlers.
    mainHandlerCount: () => handlers.main.length,
    clickMain: () => handlers.main.slice().forEach((h) => h()),
    clickBack: () => handlers.back.slice().forEach((h) => h()),
  };
})();
