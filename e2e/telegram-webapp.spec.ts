import { expect, test, type Page } from '@playwright/test';
import { installMocks, installTelegramStub, TELEGRAM_INIT_DATA, type InstallMocksOptions } from './mocks.ts';
import { addFirstToCart, fillCheckout, FIXED_NOW, openProduct } from './flows.ts';

type Tg = {
  calls: unknown[][];
  main: { text: string; isVisible: boolean; isActive: boolean };
  secondary: { text: string; isVisible: boolean; position: string | null; color: string | null; textColor: string | null };
  back: { isVisible: boolean };
};
const tg = (page: Page) => page.evaluate(() => (window as unknown as { __tg: Tg }).__tg);
const mainText = async (page: Page) => (await tg(page)).main.text;
const clickMain = (page: Page) => page.evaluate(() => (window as unknown as { __tg: { clickMain(): void } }).__tg.clickMain());
// Whichever back control this client has live: the bottom SecondaryButton from Bot API 7.10, else the header arrow.
const clickBack = (page: Page) => page.evaluate(() => {
  const g = (window as unknown as { __tg: { clickBack(): void; clickSecondary(): void; secondaryHandlerCount(): number } }).__tg;
  if (g.secondaryHandlerCount() > 0) g.clickSecondary();
  else g.clickBack();
});
const backShowing = (page: Page) => tg(page).then((t) => t.back.isVisible || t.secondary.isVisible);
const mainHandlers = (page: Page) => page.evaluate(() => (window as unknown as { __tg: { mainHandlerCount(): number } }).__tg.mainHandlerCount());
const secondaryHandlers = (page: Page) => page.evaluate(() => (window as unknown as { __tg: { secondaryHandlerCount(): number } }).__tg.secondaryHandlerCount());
const backHandlers = (page: Page) => page.evaluate(() => (window as unknown as { __tg: { backHandlerCount(): number } }).__tg.backHandlerCount());
const clickSecondary = (page: Page) => page.evaluate(() => (window as unknown as { __tg: { clickSecondary(): void } }).__tg.clickSecondary());
const callsNamed = async (page: Page, name: string) => (await tg(page)).calls.filter((c) => c[0] === name);

async function openInTelegram(page: Page, opts: InstallMocksOptions = {}, path = '/', version = '8.0') {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(FIXED_NOW);
  await installTelegramStub(page, version);
  const mocks = await installMocks(page, { layout: 'storefront', ...opts });
  await page.goto(path);
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

  test('exactly one MainButton handler is live, and it is never a stale checkout action', async ({ page }) => {
    const mocks = await openInTelegram(page);
    await expect.poll(() => mocks.state.webappLogins.length).toBe(1);
    await openProduct(page, 'webapp', firstProductName(mocks));
    await addFirstToCart(page, 'webapp', mocks);
    await expect.poll(() => mainText(page)).toMatch(/^View cart · /);
    expect(await mainHandlers(page)).toBe(1);
    expect(await secondaryHandlers(page)).toBe(0);
    expect(await backHandlers(page)).toBe(0);

    await clickMain(page);
    await expect(page).toHaveURL(/\/cart$/);
    await expect.poll(() => mainText(page)).toMatch(/^Checkout · /);
    expect(await mainHandlers(page)).toBe(1);
    expect(await secondaryHandlers(page)).toBe(1);
    expect(await backHandlers(page)).toBe(0);

    await clickMain(page);
    await expect(page).toHaveURL(/\/checkout$/);
    await expect.poll(() => mainText(page)).toBe('Continue');
    expect(await mainHandlers(page)).toBe(1);
    expect(await secondaryHandlers(page)).toBe(1);
    expect(await backHandlers(page)).toBe(0);

    // Back out of checkout to the catalogue: still one handler, and it is the catalogue's.
    await clickBack(page);
    await expect(page).toHaveURL(/\/cart$/);
    await clickBack(page);
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => mainText(page)).toMatch(/^View cart · /);
    expect(await mainHandlers(page)).toBe(1);
    expect(await secondaryHandlers(page)).toBe(0);
    expect(await backHandlers(page)).toBe(0);
    const checkoutsBefore = mocks.state.checkouts.length;
    await clickMain(page);
    await expect(page).toHaveURL(/\/cart$/);
    expect(mocks.state.checkouts.length).toBe(checkoutsBefore);
    await expect.poll(() => mainText(page)).toMatch(/^Checkout · /);
    expect(await mainHandlers(page)).toBe(1);
    expect(await secondaryHandlers(page)).toBe(1);
    expect(await backHandlers(page)).toBe(0);
  });

  test('an external payment opens in the browser and returns to the account order', async ({ page }) => {
    const gateway = 'https://pay.example.invalid/session/e2e';
    const mocks = await openInTelegram(page, {
      checkoutReference: 'K4M2QP',
      checkoutPayment: { type: 'checkout_url', paymentId: 9003, method: 'stripe', amount: 46.03, url: gateway },
    });
    await expect.poll(() => mocks.state.webappLogins.length).toBe(1);
    await openProduct(page, 'webapp', firstProductName(mocks));
    await addFirstToCart(page, 'webapp', mocks);
    await expect.poll(() => mainText(page)).toMatch(/^View cart · /);
    await clickMain(page);
    await expect(page).toHaveURL(/\/cart$/);
    await expect.poll(() => mainText(page)).toMatch(/^Checkout · /);
    await clickMain(page);
    await expect(page).toHaveURL(/\/checkout$/);
    await expect.poll(() => mainText(page)).toBe('Continue');
    await fillCheckout(page, () => clickMain(page));
    await expect.poll(() => mainText(page)).toMatch(/^Place order/);
    await clickMain(page);

    await expect.poll(() => mocks.state.checkouts.length).toBe(1);
    await expect.poll(async () => (await callsNamed(page, 'openLink')).map((c) => c[1])).toEqual([gateway]);
    // The Mini App itself never leaves for the gateway; it lands on the order inside the shell.
    await expect(page).toHaveURL(/\/account\/orders\/K4M2QP$/);
    expect(page.url()).not.toContain('pay.example');
    await expect(page.getByRole('heading', { name: 'K4M2QP' })).toBeVisible();
    await expect(page.locator('[data-sf-layout="webapp"]')).toBeVisible();
    await expect.poll(() => backShowing(page)).toBe(true);
  });

  test('the hosted face\'s pay button hands the checkout to Telegram\'s link opener', async ({ page }) => {
    const popups: string[] = [];
    page.on('popup', (p) => popups.push(p.url()));
    await openInTelegram(page, { orderFixture: 'hosted', orderReference: 'K4M2QP' }, '/account/orders/K4M2QP');
    await expect(page.getByText('Paying with Card payment')).toBeVisible();
    await expect(page.getByText('Secure hosted checkout')).toBeVisible();
    const pay = page.getByRole('link', { name: 'Click here to Pay' });
    await expect(pay).toHaveAttribute('href', 'https://pay.example.invalid/checkout/K4M2QP');
    await pay.click();
    await expect.poll(async () => (await callsNamed(page, 'openLink')).map((c) => c[1])).toEqual(['https://pay.example.invalid/checkout/K4M2QP']);
    expect(popups).toEqual([]);
    await expect(page).toHaveURL(/\/account\/orders\/K4M2QP$/);
  });

  test("the bot's order deep link opens signed in, on the order", async ({ page }) => {
    const mocks = await openInTelegram(page, {}, '/account/orders/K4M2QP');
    await expect(page.getByRole('heading', { name: 'K4M2QP' })).toBeVisible();
    await expect(page).toHaveURL(/\/account\/orders\/K4M2QP$/);
    expect(mocks.state.webappLogins).toEqual([{ initData: TELEGRAM_INIT_DATA }]);
    expect(mocks.requests().some((r) => r.startsWith('storefront/auth/login'))).toBe(false);
    await expect(page.getByText(/WhatsApp/)).toHaveCount(0);
    await expect.poll(() => backShowing(page)).toBe(true);
  });

  test('a Back control appears off the catalogue and goes back', async ({ page }) => {
    await openInTelegram(page);
    await expect.poll(() => backShowing(page)).toBe(false);
    await page.getByRole('link', { name: /^Cart, / }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect.poll(() => backShowing(page)).toBe(true);
    await clickBack(page);
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => backShowing(page)).toBe(false);
  });

  test('with a primary action, Back joins the bottom row beside it and the header arrow stands down', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(FIXED_NOW);
    await installTelegramStub(page);
    const mocks = await installMocks(page, { layout: 'storefront' });
    await page.goto('/');
    await expect.poll(() => mocks.state.webappLogins.length).toBe(1);
    await expect.poll(() => tg(page).then((t) => t.secondary.isVisible)).toBe(false);
    await openProduct(page, 'webapp', firstProductName(mocks));
    await addFirstToCart(page, 'webapp', mocks);
    await expect.poll(() => mainText(page)).toMatch(/^View cart · /);
    await clickMain(page);
    await expect(page).toHaveURL(/\/cart$/);
    await expect.poll(() => tg(page).then((t) => t.secondary.isVisible)).toBe(true);
    const t = await tg(page);
    expect(t.main.isVisible).toBe(true);
    expect(t.secondary.text).toBe('Back');
    expect(t.secondary.position).toBe('left');
    expect(t.back.isVisible).toBe(false);
    expect(await backHandlers(page)).toBe(0);
    expect(await secondaryHandlers(page)).toBe(1);
    await clickSecondary(page);
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => tg(page).then((x) => x.secondary.isVisible)).toBe(false);
    expect(await secondaryHandlers(page)).toBe(0);
  });

  test('with no primary action (an account page, empty cart) both back controls show, one handler each, and each goes back', async ({ page }) => {
    await openInTelegram(page);
    for (const control of ['bottom', 'header'] as const) {
      await page.getByRole('link', { name: 'Your account' }).click();
      await expect(page).toHaveURL(/\/account/);
      await expect.poll(() => tg(page).then((t) => t.secondary.isVisible && t.back.isVisible)).toBe(true);
      expect((await tg(page)).main.isVisible).toBe(false);
      expect(await secondaryHandlers(page)).toBe(1);
      expect(await backHandlers(page)).toBe(1);
      if (control === 'bottom') await clickSecondary(page);
      else await page.evaluate(() => (window as unknown as { __tg: { clickBack(): void } }).__tg.clickBack());
      await expect(page).toHaveURL(/\/$/);
      await expect.poll(() => tg(page).then((t) => t.secondary.isVisible || t.back.isVisible)).toBe(false);
      expect(await secondaryHandlers(page)).toBe(0);
      expect(await backHandlers(page)).toBe(0);
    }
  });

  test('an older client keeps the header BackButton and has no bottom Back', async ({ page }) => {
    await openInTelegram(page, {}, '/', '7.9');
    await page.getByRole('link', { name: /^Cart, / }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect.poll(() => tg(page).then((t) => t.back.isVisible)).toBe(true);
    expect((await tg(page)).secondary.isVisible).toBe(false);
    expect(await secondaryHandlers(page)).toBe(0);
    expect(await backHandlers(page)).toBe(1);
    await clickBack(page);
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => tg(page).then((t) => t.back.isVisible)).toBe(false);
  });

  for (const version of ['8.0', '7.9']) {
    test(`a dialog hides the bottom buttons and the back control, and closing it restores them (Telegram ${version})`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.clock.setFixedTime(FIXED_NOW);
      await installTelegramStub(page, version);
      const mocks = await installMocks(page, {
        layout: 'storefront',
        orderFixture: 'unpaid',
        orderReference: 'K4M2QP',
        unpaidOrders: [{ reference: 'K4M2QP', createdAt: '2026-08-24T08:30:00.000Z', totalAmount: 46.03, outstandingBalance: 46.03, payBy: null, canCancel: true, cancelBlockedBy: null }],
      });
      mocks.state.cart = {
        items: [{
          productId: 101, name: 'Alpine Extract 10ml', quantity: 1, unitPrice: 42.5, lineTotal: 42.5, imageUrl: null, isPreorder: false,
          outOfStock: false, priceChanged: false, inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null,
        }],
        subtotal: 42.5, itemCount: 1,
      };
      await page.goto('/cart');
      const newer = version === '8.0';
      const prompt = page.getByRole('dialog', { name: 'You have an unpaid order' });
      await expect(prompt).toBeVisible();
      // Under the dialog: no bottom button and no back control of either kind.
      await expect.poll(() => tg(page).then((t) => t.main.isVisible)).toBe(false);
      expect((await tg(page)).secondary.isVisible).toBe(false);
      expect((await tg(page)).back.isVisible).toBe(false);
      expect(await mainHandlers(page)).toBe(0);
      expect(await secondaryHandlers(page)).toBe(0);
      expect(await backHandlers(page)).toBe(0);

      await prompt.getByRole('button', { name: 'Not now' }).click();
      await expect(prompt).toHaveCount(0);
      await expect.poll(() => mainText(page)).toMatch(/^Checkout · /);
      await expect.poll(() => tg(page).then((t) => t.main.isVisible)).toBe(true);
      await expect.poll(() => tg(page).then((t) => (newer ? t.secondary.isVisible : t.back.isVisible))).toBe(true);
      expect((await tg(page)).back.isVisible).toBe(!newer);
      expect((await tg(page)).secondary.isVisible).toBe(newer);
      expect(await mainHandlers(page)).toBe(1);
      expect(await secondaryHandlers(page)).toBe(newer ? 1 : 0);
      expect(await backHandlers(page)).toBe(newer ? 0 : 1);
    });
  }

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
    await page.locator('[data-sf-part="header"]').getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('Back sits beside the primary action in the bar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(FIXED_NOW);
    const mocks = await installMocks(page, { layout: 'webapp', session: true });
    await page.goto('/');
    await expect(page.locator('[data-sf-part="primary-bar"]')).toHaveCount(0);
    await openProduct(page, 'webapp', firstProductName(mocks));
    await addFirstToCart(page, 'webapp', mocks);
    const bar = page.locator('[data-sf-part="primary-bar"]');
    await bar.getByRole('button', { name: /^View cart · / }).click();
    await expect(page).toHaveURL(/\/cart$/);
    const back = bar.getByRole('button', { name: 'Back' });
    await expect(back).toBeVisible();
    const [backBox, mainBox] = [await back.boundingBox(), await bar.getByRole('button', { name: /^Checkout · / }).boundingBox()];
    expect(backBox!.x).toBeLessThan(mainBox!.x);
    expect(backBox!.height).toBeGreaterThanOrEqual(44);
    expect(mainBox!.width).toBeGreaterThan(backBox!.width);
    await back.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(bar.getByRole('button', { name: 'Back' })).toHaveCount(0);
  });

  test('an account page with an empty cart gets no bar and no reserved room; the header chevron is its Back', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(FIXED_NOW);
    await installMocks(page, { layout: 'webapp', session: true });
    await page.goto('/account');
    await expect(page.locator('[data-sf-layout="webapp"]')).toBeVisible();
    await expect(page.locator('[data-sf-part="primary-bar"]')).toHaveCount(0);
    expect(await page.locator('[data-sf-layout="webapp"]').evaluate((el) => getComputedStyle(el).paddingBottom)).toBe('0px');
    await expect(page.locator('[data-sf-part="header"]').getByRole('button', { name: 'Back' })).toBeVisible();
  });

  test('the bar is not drawn under a dialog, and returns when it closes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(FIXED_NOW);
    const mocks = await installMocks(page, {
      layout: 'webapp',
      session: true,
      orderFixture: 'unpaid',
      orderReference: 'K4M2QP',
      unpaidOrders: [{ reference: 'K4M2QP', createdAt: '2026-08-24T08:30:00.000Z', totalAmount: 46.03, outstandingBalance: 46.03, payBy: null, canCancel: true, cancelBlockedBy: null }],
    });
    mocks.state.cart = {
      items: [{
        productId: 101, name: 'Alpine Extract 10ml', quantity: 1, unitPrice: 42.5, lineTotal: 42.5, imageUrl: null, isPreorder: false,
        outOfStock: false, priceChanged: false, inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null,
      }],
      subtotal: 42.5, itemCount: 1,
    };
    await page.goto('/cart');
    const prompt = page.getByRole('dialog', { name: 'You have an unpaid order' });
    await expect(prompt).toBeVisible();
    await expect(page.locator('[data-sf-part="primary-bar"]')).toHaveCount(0);
    await prompt.getByRole('button', { name: 'Not now' }).click();
    const bar = page.locator('[data-sf-part="primary-bar"]');
    await expect(bar.getByRole('button', { name: /^Checkout · / })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Back' })).toBeVisible();
  });
});
