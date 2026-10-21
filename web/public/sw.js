// Push-only service worker. It deliberately has NO `fetch` listener and NO caches: the storefront is
// always served live from the network, and this worker must never sit between a shopper and the shop.

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = typeof payload.title === 'string' && payload.title ? payload.title : 'Notification';
  const options = {
    body: typeof payload.body === 'string' ? payload.body : '',
    icon: payload.icon,
    badge: payload.badge,
    tag: payload.tag,
    data: { url: payload.url },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// The payload is server-supplied; only ever open a same-origin URL (rejects javascript:, data:, off-site), else the home page.
function safeTarget(raw) {
  try {
    const u = new URL(typeof raw === 'string' ? raw : '/', self.location.origin);
    return u.origin === self.location.origin ? u.href : new URL('/', self.location.origin).href;
  } catch { return new URL('/', self.location.origin).href; }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safeTarget(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const sameOrigin = wins.find((c) => { try { return new URL(c.url).origin === self.location.origin; } catch { return false; } });
    if (sameOrigin) {
      await sameOrigin.focus();
      try { await sameOrigin.navigate(url); return; } catch { /* fall through to a new window */ }
    }
    await self.clients.openWindow(url);
  })());
});
