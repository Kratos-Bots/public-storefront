import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Loads the real public/sw.js into a fake service-worker scope and fires notificationclick.
function load(windows: Array<{ url: string; navigate?: (u: string) => Promise<unknown> }>) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const openWindow = vi.fn(async () => undefined);
  const self = {
    location: { origin: 'https://shop.test' },
    addEventListener: (t: string, h: (e: unknown) => void) => { handlers[t] = h; },
    clients: { matchAll: async () => windows.map((w) => ({ focus: async () => undefined, navigate: w.navigate ?? (async () => undefined), url: w.url })), openWindow, claim: async () => undefined },
    registration: { showNotification: vi.fn() },
    skipWaiting: () => undefined,
  };
  new Function('self', readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8'))(self);
  return { handlers, openWindow };
}

async function click(ctx: ReturnType<typeof load>, url: unknown) {
  let p: Promise<unknown> = Promise.resolve();
  ctx.handlers.notificationclick({ notification: { close: () => undefined, data: { url } }, waitUntil: (x: Promise<unknown>) => { p = x; } });
  await p;
}

describe('sw notificationclick target', () => {
  it.each(['javascript:alert(1)', 'data:text/html,x', 'https://evil.test/a', 42, undefined])('opens home for %s', async (bad) => {
    const ctx = load([]);
    await click(ctx, bad);
    expect(ctx.openWindow).toHaveBeenCalledWith('https://shop.test/');
  });
  it('opens a same-origin order URL', async () => {
    const ctx = load([]);
    await click(ctx, 'https://shop.test/account/orders/AB1');
    expect(ctx.openWindow).toHaveBeenCalledWith('https://shop.test/account/orders/AB1');
  });
  it('navigates an existing same-origin window and never falls through to a raw url', async () => {
    const navigate = vi.fn(async () => undefined);
    const ctx = load([{ url: 'https://shop.test/x', navigate }]);
    await click(ctx, 'https://evil.test/');
    expect(navigate).toHaveBeenCalledWith('https://shop.test/');
    expect(ctx.openWindow).not.toHaveBeenCalled();
  });
});
