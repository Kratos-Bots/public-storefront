import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  installMocks, installTelegramStub, publicOrderVariant, SESSION_CUSTOMER, SESSION_TOKEN,
  type InstallMocksOptions, type MockHandle,
} from './mocks.ts';
import { FIXED_NOW, onlyVisible } from './flows.ts';
import type { OrderDetail, UnpaidOrder } from '../web/src/types/orders.ts';
import type { PublicOrder } from '../web/src/types/public-order.ts';

/**
 * Unpaid order recovery, as a shopper meets it: paying and cancelling from the account order page, from the
 * order link, and from the "you have an unpaid order" pop-up. Everything runs against the mocked backend,
 * whose cancel and unpaid routes mirror the real ones (`ORDER_NOT_CANCELLABLE:<reason>` on 409, the
 * `{ reference, status: 'cancelled' }` answer). Synthetic data only.
 */

const REF = 'K4M2QP';
const KEY = 'KEY2';
const LINK = { reference: REF, accessKey: KEY };
const TOTAL = 46.03;
const PROMPT_TITLE = 'You have an unpaid order';
const SAVED = 'sf-orders-v1';

/** The account order, unpaid and with no way of paying chosen yet. */
function unpaidDetail(d: OrderDetail): void {
  d.status = 'pending';
  d.items = [{ name: 'Alpine Extract 10ml', quantity: 1, unitPrice: 42.5, lineTotal: 42.5 }];
  d.subtotal = 42.5;
  d.shippingAmount = 4.95;
  d.totalAmount = TOTAL;
  d.payments = [];
  d.shipments = [];
  d.outstandingBalance = TOTAL;
  d.publicUrl = `http://localhost:5199/order/${REF}/${KEY}`;
  d.accessKey = KEY;
  d.canCancel = true;
  d.cancelBlockedBy = null;
}

/** The same order through its link: awaiting payment, no method chosen, cancellable. */
function choosing(): PublicOrder {
  const o = publicOrderVariant('choose');
  o.payment = { ...o.payment!, canCancel: true, cancelBlockedBy: null };
  return o;
}

const unpaidRow = (over: Partial<UnpaidOrder> = {}): UnpaidOrder => ({
  reference: REF, accessKey: KEY, createdAt: '2026-08-24T08:30:00.000Z', totalAmount: TOTAL, outstandingBalance: TOTAL,
  payBy: null, canCancel: true, cancelBlockedBy: null, ...over,
});

interface OpenOptions extends InstallMocksOptions {
  width?: number;
  path?: string;
  /** Saved order links (`sf-orders-v1`), seeded once per tab so a reload does not bring them back. */
  saved?: Array<{ reference: string; accessKey: string; savedAt: string }>;
  /** Boot signed in (once per tab: a sign-out and reload stays signed out). */
  signedIn?: boolean;
  /** Skip the navigation, so the test can arrange routes first. */
  noGoto?: boolean;
}

/** An account order K4M2QP that is unpaid, plus the same order through its link, unless a test says otherwise. */
async function open(page: Page, o: OpenOptions = {}): Promise<MockHandle> {
  const { width = 1280, path = '/', saved, signedIn = true, noGoto, ...rest } = o;
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.clock.setFixedTime(FIXED_NOW);
  const mocks = await installMocks(page, {
    layout: 'storefront',
    orderLink: LINK,
    order: choosing(),
    ...rest,
    tweakOrderDetail: rest.tweakOrderDetail ?? unpaidDetail,
  });
  await page.addInitScript(
    (seed) => {
      if (window.sessionStorage.getItem('e2e-seeded')) return;
      window.sessionStorage.setItem('e2e-seeded', '1');
      if (seed.saved) window.localStorage.setItem('sf-orders-v1', JSON.stringify(seed.saved));
      if (seed.session) {
        window.localStorage.setItem('sf-session-v1', JSON.stringify({ state: { token: seed.session.token, customer: seed.session.customer }, version: 0 }));
      }
    },
    { saved, session: signedIn ? { token: SESSION_TOKEN, customer: SESSION_CUSTOMER } : null },
  );
  if (!noGoto) await page.goto(path);
  return mocks;
}

const prompt = (page: Page): Locator => page.getByRole('dialog', { name: PROMPT_TITLE });

/** A server cart with one line, so /checkout stays on the checkout instead of sending the shopper back. */
function seedCart(mocks: MockHandle): void {
  mocks.state.cart = {
    items: [{
      productId: 101, name: 'Alpine Extract 10ml', quantity: 1, unitPrice: 42.5, lineTotal: 42.5, imageUrl: null, isPreorder: false,
      outOfStock: false, priceChanged: false, inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null,
    }],
    subtotal: 42.5, itemCount: 1,
  };
}

/** How many times the signed-in customer's unpaid orders were asked for. */
const unpaidAsks = (mocks: MockHandle): number => mocks.requests().filter((r) => r === 'GET storefront/orders/unpaid').length;

/** Leaves the page in the app (the account page) and comes back by the browser's Back. */
async function awayAndBack(page: Page): Promise<void> {
  await onlyVisible(page.getByRole('link', { name: 'Your account' })).click();
  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByRole('heading', { name: 'Ada', level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
}

test.describe('unpaid orders · the account order page', () => {
  test('1 · an unpaid order with no method shows the picker, and choosing one posts it', async ({ page }) => {
    const mocks = await open(page, { path: `/account/orders/${REF}` });
    await expect(page.getByRole('heading', { name: REF })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Choose how to pay/ })).toBeVisible();
    await page.getByRole('button', { name: /^Card/ }).click();
    await expect.poll(() => mocks.state.methods).toEqual([{ method: 'sushipp' }]);
    // The order now has a hosted payment open: the page moved on to it.
    await expect(page.getByRole('link', { name: 'Open secure checkout' })).toBeVisible();
  });

  test('2 · a pending hosted payment shows its checkout link', async ({ page }) => {
    await open(page, {
      path: `/account/orders/${REF}`,
      order: (() => {
        const o = choosing();
        o.payment!.activePayment = { paymentId: 9003, method: 'sushipp', kind: 'gateway', status: 'pending', checkoutUrl: 'https://pay.example.invalid/checkout/K4M2QP', canChange: true };
        return o;
      })(),
    });
    await expect(page.getByRole('heading', { name: 'Finish your payment' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open secure checkout' })).toHaveAttribute('href', 'https://pay.example.invalid/checkout/K4M2QP');
  });

  test('3 · cancelling from the order page shows the order cancelled', async ({ page }) => {
    const mocks = await open(page, { path: `/account/orders/${REF}` });
    await expect(page.getByRole('heading', { name: REF })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel order' }).click();
    await expect(page.getByText(`Cancel order ${REF}?`)).toBeVisible();
    await page.getByRole('button', { name: 'Yes, cancel it' }).click();
    await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /^Choose how to pay/ })).toHaveCount(0);
    expect(mocks.state.cancels).toEqual([REF]);
  });

  test('4 · a refused cancel says a payment may be on its way and refreshes the order', async ({ page }) => {
    const mocks = await open(page, { path: `/account/orders/${REF}`, cancelAnswers: 409 });
    await expect(page.getByRole('heading', { name: REF })).toBeVisible();
    const reads = () => mocks.requests().filter((r) => r === `GET storefront/orders/${REF}`).length;
    const before = reads();
    await page.getByRole('button', { name: 'Cancel order' }).click();
    await page.getByRole('button', { name: 'Yes, cancel it' }).click();
    await expect(page.getByText('A payment may already be on its way, so this order cannot be cancelled here.').first()).toBeVisible();
    // The refresh shows what the backend now says: money may be coming, so contact the shop instead.
    await expect(page.getByText('To cancel this order, contact us: a payment may already be on its way.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
    expect(reads()).toBeGreaterThan(before);
    expect(mocks.state.cancels).toEqual([]);
  });
});

test.describe('unpaid orders · the order link', () => {
  test('5 · cancelling from the public order page', async ({ page }) => {
    const mocks = await open(page, { path: `/order/${REF}/${KEY}`, signedIn: false });
    await page.getByRole('button', { name: 'Cancel order' }).click();
    await expect(page.getByText(`Cancel order ${REF}?`)).toBeVisible();
    await page.getByRole('button', { name: 'Yes, cancel it' }).click();
    await expect.poll(() => mocks.state.cancels).toEqual([REF]);
    await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /^Choose how to pay/ })).toHaveCount(0);
    expect(mocks.requests()).toContain(`POST orders/${REF}/${KEY}/cancel`);
  });
});

test.describe('unpaid orders · the pop-up', () => {
  test('6 · a signed-in customer is asked on the home page, and Review or cancel order opens the order', async ({ page }) => {
    await open(page, { unpaidOrders: [unpaidRow()] });
    const dialog = prompt(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`Order ${REF} is waiting for payment.`)).toBeVisible();
    await expect(dialog.getByText('Amount due')).toBeVisible();
    await expect(dialog.getByText('46.03')).toBeVisible();
    await dialog.getByRole('button', { name: 'Review or cancel order' }).click();
    await expect(page).toHaveURL(new RegExp(`/account/orders/${REF}$`));
    await expect(page.getByRole('heading', { name: REF })).toBeVisible();
    await expect(dialog).toHaveCount(0);
  });

  test('7 · Not now lasts for the visit: in-app navigation and a reload do not bring it back', async ({ page }) => {
    const mocks = await open(page, { width: 390, unpaidOrders: [unpaidRow()] });
    await expect(prompt(page)).toBeVisible();
    await prompt(page).getByRole('button', { name: 'Not now' }).click();
    await expect(prompt(page)).toHaveCount(0);

    // The one lookup that raised the pop-up has landed; nothing may ask again.
    expect(unpaidAsks(mocks)).toBe(1);

    await awayAndBack(page);
    await expect(page.locator('[data-sf-part="product-card"]').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(prompt(page)).toHaveCount(0);
    expect(unpaidAsks(mocks)).toBe(1);

    // Session storage survives a reload of the same tab.
    await page.reload();
    await expect(page.locator('[data-sf-part="product-card"]').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(prompt(page)).toHaveCount(0);
    expect(unpaidAsks(mocks)).toBe(1);
  });

  test('8 · a guest with a saved order link is asked, and Complete payment opens the order link', async ({ page }) => {
    await open(page, {
      signedIn: false,
      orderLink: { reference: 'E2E1', accessKey: 'KEY1' },
      order: (() => { const o = publicOrderVariant('choose'); o.payment!.canCancel = true; o.payment!.cancelBlockedBy = null; return o; })(),
      saved: [{ reference: 'E2E1', accessKey: 'KEY1', savedAt: '2026-08-24T08:30:00.000Z' }],
    });
    const dialog = prompt(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Order E2E1 is waiting for payment.')).toBeVisible();
    await expect(dialog.getByText('46.03')).toBeVisible();
    await dialog.getByRole('button', { name: 'Complete payment' }).click();
    await expect(page).toHaveURL(/\/order\/E2E1\/KEY1$/);
    await expect(dialog).toHaveCount(0);
  });

  test('9 · it never appears on the checkout, and is not even asked for there', async ({ page }) => {
    const mocks = await open(page, { noGoto: true, unpaidOrders: [unpaidRow()] });
    seedCart(mocks);
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: /Your details|Delivery address/ })).toBeVisible();
    await expect(prompt(page)).toHaveCount(0);
    expect(mocks.requests()).not.toContain('GET storefront/orders/unpaid');
  });

  test('10 · cancelling from the pop-up closes it for good', async ({ page }) => {
    const mocks = await open(page, { width: 390, unpaidOrders: [unpaidRow()] });
    const dialog = prompt(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel order' }).click();
    await expect(dialog.getByText(`Cancel order ${REF}?`)).toBeVisible();
    const asked = unpaidAsks(mocks);
    await dialog.getByRole('button', { name: 'Yes, cancel it' }).click();
    await expect(dialog).toHaveCount(0);
    expect(mocks.state.cancels).toEqual([REF]);
    // The cancel refreshed the lookup (the mock now answers an empty list), so nothing is left to offer.
    await expect.poll(() => unpaidAsks(mocks)).toBeGreaterThan(asked);

    await awayAndBack(page);
    await expect(page.locator('[data-sf-part="product-card"]').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(prompt(page)).toHaveCount(0);
    expect(mocks.state.cancels).toEqual([REF]);
  });

  test('11 · inside Telegram the pop-up appears and Review or cancel order works', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(FIXED_NOW);
    await installTelegramStub(page);
    await installMocks(page, {
      layout: 'storefront', orderLink: LINK, order: choosing(), tweakOrderDetail: unpaidDetail, unpaidOrders: [unpaidRow()],
    });
    await page.goto('/');
    await expect(page.locator('[data-sf-layout="webapp"]')).toBeVisible();
    const dialog = prompt(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Review or cancel order' }).click();
    await expect(page).toHaveURL(new RegExp(`/account/orders/${REF}$`));
    await expect(page.getByRole('heading', { name: REF })).toBeVisible();
  });

  test('12 · signing out forgets the saved order link: nothing is offered after the reload', async ({ page }) => {
    const mocks = await open(page, {
      path: '/account/profile',
      orderLink: { reference: 'E2E1', accessKey: 'KEY1' },
      order: choosing(),
      saved: [{ reference: 'E2E1', accessKey: 'KEY1', savedAt: '2026-08-24T08:30:00.000Z' }],
    });
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);
    // Signed out and loaded: the catalogue is up, and the saved link that would have raised the pop-up is gone.
    await expect(page.locator('[data-sf-part="product-card"]').first()).toBeVisible();
    await expect(prompt(page)).toHaveCount(0);
    expect(await page.evaluate((k) => window.localStorage.getItem(k), SAVED)).toBeNull();
    expect(mocks.requests().filter((r) => r.startsWith('GET orders/E2E1/'))).toEqual([]);
  });

  test('13 · with the cart drawer open the pop-up waits, and appears once it is closed', async ({ page }) => {
    // Hold the unpaid answer so the drawer can be opened before it arrives.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const mocks = await open(page, { noGoto: true, unpaidOrders: [unpaidRow()] });
    await page.route('http://localhost:5199/api/storefront/orders/unpaid', async (route) => {
      await gate;
      await route.fallback();
    });
    await page.goto('/');
    const cart = onlyVisible(page.getByRole('link', { name: /^Cart, / }));
    await cart.click();
    const drawer = page.getByRole('dialog', { name: 'Your cart' });
    await expect(drawer).toBeVisible();
    const answered = page.waitForResponse((r) => r.url().endsWith('/api/storefront/orders/unpaid'));
    release();
    // The held answer has reached the page; let it render, then check it did not open on top of the drawer.
    await answered;
    expect(unpaidAsks(mocks)).toBeGreaterThan(0);
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    await expect(prompt(page)).toHaveCount(0);
    await expect(drawer).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(prompt(page)).toBeVisible();
  });

  test('14 · Escape in the cancel confirmation closes only the confirmation, not the pop-up', async ({ page }) => {
    await open(page, { unpaidOrders: [unpaidRow()] });
    const dialog = prompt(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel order' }).click();
    await expect(dialog.getByText(`Cancel order ${REF}?`)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog.getByText(`Cancel order ${REF}?`)).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Complete payment' })).toBeVisible();
  });

  test('15 · an order that cannot be cancelled shows the contact line, not a Cancel button', async ({ page }) => {
    await open(page, { unpaidOrders: [unpaidRow({ canCancel: false, cancelBlockedBy: 'bank_transfer' })] });
    const dialog = prompt(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Complete payment' })).toBeVisible();
    await expect(dialog.getByText('To cancel this order, contact us: a payment may already be on its way.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
  });

  test('16 · a guest cancels from the pop-up through the order link', async ({ page }) => {
    const mocks = await open(page, {
      signedIn: false,
      orderLink: { reference: 'E2E1', accessKey: 'KEY1' },
      order: (() => { const o = publicOrderVariant('choose'); o.payment!.canCancel = true; o.payment!.cancelBlockedBy = null; return o; })(),
      saved: [{ reference: 'E2E1', accessKey: 'KEY1', savedAt: '2026-08-24T08:30:00.000Z' }],
    });
    const dialog = prompt(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel order' }).click();
    await dialog.getByRole('button', { name: 'Yes, cancel it' }).click();
    await expect(dialog).toHaveCount(0);
    expect(mocks.requests().filter((r) => r === 'POST orders/E2E1/KEY1/cancel')).toHaveLength(1);
    expect(mocks.state.cancels).toEqual(['E2E1']);
  });

  test('17 · a customer the restricted shop has refused sees no pop-up on their account pages', async ({ page }) => {
    const mocks = await open(page, {
      noGoto: true, access: { storefront: 'restricted', denied: true }, unpaidOrders: [unpaidRow()],
    });
    const profile = page.waitForResponse((r) => r.url().endsWith('/api/storefront/profile'));
    await page.goto('/account');
    // The profile answered shopAccess: false: the account layout knows the customer is refused.
    await profile;
    await page.waitForLoadState('networkidle');
    await expect(prompt(page)).toHaveCount(0);
    expect(unpaidAsks(mocks)).toBe(0);
  });
});
