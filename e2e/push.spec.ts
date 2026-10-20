import { expect, test, type Page } from '@playwright/test';
import { installMocks, installTelegramStub, type MockHandle } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';

// A phone: coarse pointer and a phone-width viewport, the two things the invitation banner asks.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const PUBLIC_KEY = Buffer.from(new Uint8Array(65).fill(4)).toString('base64url');
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/e2e-endpoint';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

interface StubOptions { subscribed?: boolean }

/** Notification, PushManager and a service worker that subscribes in memory; `window.__push` records what the page did. */
async function stubPush(page: Page, opts: StubOptions = {}) {
  await page.addInitScript(({ endpoint, subscribed }) => {
    const calls = { register: 0, subscribe: 0, unsubscribe: 0, permission: 0 };
    (window as unknown as { __push: typeof calls }).__push = calls;
    const bytes = (n: number) => new Uint8Array(n).fill(7).buffer;
    let current: unknown = null;
    const makeSub = (key: ArrayBuffer | null) => ({
      endpoint,
      options: { applicationServerKey: key },
      toJSON: () => ({ endpoint, keys: { p256dh: 'cDI1Ng', auth: 'YXV0aA' } }),
      unsubscribe: async () => { calls.unsubscribe += 1; current = null; return true; },
    });
    if (subscribed) current = makeSub(bytes(65));
    const pushManager = {
      getSubscription: async () => current,
      subscribe: async (o: { applicationServerKey: BufferSource }) => {
        calls.subscribe += 1;
        const src = o.applicationServerKey as Uint8Array;
        current = makeSub(src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) as ArrayBuffer);
        return current;
      },
    };
    const reg = { pushManager };
    let registered = subscribed;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: async () => { calls.register += 1; registered = true; return reg; },
        getRegistration: async () => (registered ? reg : undefined),
        get ready() { return Promise.resolve(reg); },
      },
    });
    class FakeNotification {
      static permission: NotificationPermission = 'default';
      static async requestPermission() { calls.permission += 1; FakeNotification.permission = 'granted'; return 'granted' as const; }
    }
    Object.defineProperty(window, 'Notification', { configurable: true, value: FakeNotification });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class PushManager {} });
  }, { endpoint: ENDPOINT, subscribed: opts.subscribed === true });
}

const pushCalls = (page: Page) => page.evaluate(() => (window as unknown as { __push?: Record<string, number> }).__push ?? null);

async function open(page: Page, o: { push?: boolean; session?: boolean; subscribed?: boolean; path?: string } = {}): Promise<MockHandle> {
  await page.clock.setFixedTime(FIXED_NOW);
  await stubPush(page, { subscribed: o.subscribed });
  const mocks = await installMocks(page, {
    layout: 'storefront',
    session: o.session ?? true,
    tweakSettings: (s) => { if (o.push !== false) s.push = { enabled: true, publicKey: PUBLIC_KEY }; },
  });
  await page.goto(o.path ?? '/');
  return mocks;
}

// The catalogue has drawn: cards on the storefront layout, rows on the others.
const catalog = (page: Page) => page.locator('[data-sf-part="product-card"], [data-sf-part="product-row"]').first();
const banner = (page: Page) => page.getByRole('region', { name: 'Order updates' });

test.describe('push invitation banner', () => {
  test('phone signed-in sees banner, Not now hides, reload within 7 days stays hidden', async ({ page }) => {
    await open(page);
    await expect(banner(page).getByText('Get order updates on this phone')).toBeVisible();
    await banner(page).getByRole('button', { name: 'Not now' }).click();
    await expect(banner(page)).toHaveCount(0);

    await page.reload();
    await expect(catalog(page)).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test('Turn on posts subscription', async ({ page }) => {
    const mocks = await open(page);
    await banner(page).getByRole('button', { name: 'Turn on' }).click();
    await expect.poll(() => mocks.state.pushPosts.length).toBe(1);
    expect(mocks.state.pushPosts[0]).toEqual({ endpoint: ENDPOINT, keys: { p256dh: 'cDI1Ng', auth: 'YXV0aA' } });
    await expect(banner(page)).toHaveCount(0);
  });

  test('no push in settings → no banner, no Notifications section', async ({ page }) => {
    await open(page, { push: false });
    await expect(catalog(page)).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await page.goto('/account/profile');
    await expect(page.getByRole('heading', { name: 'Ada' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Notifications' })).toHaveCount(0);
  });

  test('signed out → no banner', async ({ page }) => {
    await open(page, { session: false });
    await expect(catalog(page)).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test('telegram webapp → no banner, no service worker', async ({ page }) => {
    await page.clock.setFixedTime(FIXED_NOW);
    await stubPush(page);
    await installTelegramStub(page);
    await installMocks(page, { layout: 'storefront', tweakSettings: (s) => { s.push = { enabled: true, publicKey: PUBLIC_KEY }; } });
    await page.goto('/');
    await expect(page.locator('[data-sf-layout="webapp"]')).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    expect((await pushCalls(page))?.register).toBe(0);
  });
});

test.describe('iPhone Safari, not installed', () => {
  test.use({ userAgent: IPHONE_UA });

  test('iPhone Safari UA not standalone → Turn on opens install guide', async ({ page }) => {
    const mocks = await open(page);
    await banner(page).getByRole('button', { name: 'Turn on' }).click();
    const guide = page.getByRole('dialog', { name: 'Add to Home Screen' });
    await expect(guide).toBeVisible();
    await expect(guide.getByText('1. Tap Share')).toBeVisible();
    await expect(guide.getByText('2. Add to Home Screen')).toBeVisible();
    await expect(guide.getByText('3. Open the app from your Home Screen, sign in, then tap Turn on')).toBeVisible();
    expect(mocks.state.pushPosts).toEqual([]);
    expect((await pushCalls(page))?.permission).toBe(0);
  });
});

test.describe('profile', () => {
  test('profile lists devices and Remove calls DELETE', async ({ page }) => {
    // Seeded before the page loads: this browser (subscribed) plus another phone.
    await stubPush(page, { subscribed: true });
    await page.clock.setFixedTime(FIXED_NOW);
    const mocks = await installMocks(page, {
      layout: 'storefront', session: true,
      tweakSettings: (s) => { s.push = { enabled: true, publicKey: PUBLIC_KEY }; },
    });
    mocks.state.pushDevices.push(
      { id: 7, endpoint: 'https://fcm.googleapis.com/fcm/send/other', deviceLabel: 'Pixel 7', createdAt: '2026-08-01T09:00:00.000Z' },
      { id: 8, endpoint: ENDPOINT, deviceLabel: 'Chrome on Android', createdAt: '2026-08-02T09:00:00.000Z' },
    );
    await page.goto('/account/profile');

    const section = page.getByRole('region', { name: 'Notifications' });
    await expect(section.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await expect(section.getByRole('switch', { name: 'This device' })).toBeChecked();
    await expect(section.getByText('Pixel 7')).toBeVisible();

    await section.getByRole('button', { name: 'Remove Pixel 7' }).click();
    await expect.poll(() => mocks.state.pushDeletes).toEqual([{ id: 7 }]);
    await expect(section.getByText('Pixel 7')).toHaveCount(0);
  });

  test('the This device switch subscribes this browser', async ({ page }) => {
    const mocks = await open(page, { path: '/account/profile' });
    const section = page.getByRole('region', { name: 'Notifications' });
    await expect(section.getByRole('switch', { name: 'This device' })).not.toBeChecked();
    await section.getByRole('switch', { name: 'This device' }).click();
    await expect.poll(() => mocks.state.pushPosts.length).toBe(1);
    await expect(section.getByRole('switch', { name: 'This device' })).toBeChecked();
  });
});

test.describe('order placed', () => {
  test('offers Get notified when your order ships and subscribes on tap', async ({ page }) => {
    const mocks = await open(page, { path: '/order-placed?order=E2E1' });
    await page.getByRole('button', { name: 'Get notified when your order ships' }).click();
    await expect.poll(() => mocks.state.pushPosts.length).toBe(1);
    await expect(page.getByRole('button', { name: 'Get notified when your order ships' })).toHaveCount(0);
  });

  test('push off → nothing on the page', async ({ page }) => {
    await open(page, { push: false, path: '/order-placed?order=E2E1' });
    await expect(page.getByRole('heading', { name: 'Order placed' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Get notified when your order ships' })).toHaveCount(0);
  });
});
