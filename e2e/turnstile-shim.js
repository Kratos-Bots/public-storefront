/* eslint-disable */
/**
 * Stand-in for https://challenges.cloudflare.com/turnstile/v0/api.js.
 *
 * `page.route` serves this file in place of Cloudflare's own script, so the
 * real @marsidev/react-turnstile component (which the app uses unmodified) can
 * mount, solve and reset without any network. It implements only the surface
 * that component touches: `render` / `execute` / `reset` / `remove` /
 * `getResponse` / `isExpired`, plus the `?onload=` callback the loader waits on.
 *
 * Two behaviours matter and mirror the real widget:
 *  - a widget rendered WITHOUT `execution: 'execute'` (the tracking page) solves
 *    itself as soon as it is rendered, and again on every `reset()`;
 *  - a widget rendered WITH it (guest checkout) stays quiet until `execute()`,
 *    and `reset()` alone never mints a token.
 * Every solve hands over a fresh single-use token, so a spent one is never
 * re-offered — the same contract the app codes against.
 */
(function () {
  var widgets = Object.create(null);
  var widgetSeq = 0;
  var tokenSeq = 0;

  function mint() {
    tokenSeq += 1;
    return 'e2e-turnstile-token-' + tokenSeq;
  }

  function solve(id) {
    var w = widgets[id];
    if (!w) return;
    var token = mint();
    w.token = token;
    if (w.params && typeof w.params.callback === 'function') w.params.callback(token);
  }

  /** The library calls render/remove/reset with a widget id and execute with the container. */
  function idFor(target) {
    if (typeof target === 'string' && widgets[target]) return target;
    for (var id in widgets) if (widgets[id].el === target) return id;
    return null;
  }

  window.turnstile = {
    render: function (el, params) {
      var node = typeof el === 'string' ? document.querySelector(el) : el;
      var id = 'e2e-widget-' + ++widgetSeq;
      var onExecute = !!(params && params.execution === 'execute');
      widgets[id] = { el: node, params: params, onExecute: onExecute, token: null };
      if (!onExecute) setTimeout(function () { solve(id); }, 0);
      return id;
    },
    execute: function (target) {
      var id = idFor(target);
      if (id) setTimeout(function () { solve(id); }, 0);
    },
    reset: function (target) {
      var id = idFor(target);
      if (!id) return;
      widgets[id].token = null;
      if (!widgets[id].onExecute) setTimeout(function () { solve(id); }, 0);
    },
    remove: function (target) {
      var id = idFor(target);
      if (id) delete widgets[id];
    },
    getResponse: function (target) {
      var id = idFor(target);
      return id ? widgets[id].token : undefined;
    },
    isExpired: function () {
      return false;
    },
    ready: function (cb) {
      cb();
    },
  };

  var callbackName = 'onloadTurnstileCallback';
  try {
    var src = document.currentScript && document.currentScript.src;
    var match = src && /[?&]onload=([^&]+)/.exec(src);
    if (match) callbackName = decodeURIComponent(match[1]);
  } catch (err) {
    /* fall back to the library's default name */
  }
  if (typeof window[callbackName] === 'function') window[callbackName]();
})();
