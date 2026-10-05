import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  installMocks, installTelegramStub, PASSWORD_ACCOUNT,
  type InstallMocksOptions, type MockHandle, type OrderFixtureName,
} from './mocks.ts';
import { FIXED_NOW, onlyVisible } from './flows.ts';
import type { UnpaidOrder } from '../web/src/types/orders.ts';

/**
 * Unpaid order recovery, as a signed-in shopper meets it: the "you have an unpaid order" pop-up, the account order
 * page it leads to, paying from there, and cancelling behind a confirmation. Everything runs against the mocked
 * backend, whose cancel and unpaid routes mirror the real ones (`ORDER_NOT_CANCELLABLE:<reason>` on 409, the
 * `{ reference, status: 'cancelled' }` answer). Synthetic data only.
 */

const REF = 'K4M2QP';
const KEY = 'KEY2';
const TOTAL = 46.03;
const PROMPT_TITLE = 'You have an unpaid order';
const ORDER_PAGE = `/account/orders/${REF}`;

const unpaidRow = (over: Partial<UnpaidOrder> = {}): UnpaidOrder => ({
  reference: REF, createdAt: '2026-08-24T08:30:00.000Z', totalAmount: TOTAL, outstandingBalance: TOTAL,
  payBy: null, canCancel: true, cancelBlockedBy: null, ...over,
});

interface OpenOptions extends InstallMocksOptions {
  width?: number;
  path?: string;
  /** Skip the navigation, so the test can arrange routes first. */
  noGoto?: boolean;
  fixture?: OrderFixtureName;
}

/** An account order K4M2QP, unpaid with no method chosen unless a test says otherwise, and a signed-in customer. */
async function open(page: Page, o: OpenOptions = {}): Promise<MockHandle> {
  const { width = 1280, path = '/', noGoto, fixture = 'unpaid', session = true, ...rest } = o;
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.clock.setFixedTime(FIXED_NOW);
  const mocks = await installMocks(page, { layout: 'storefront', orderFixture: fixture, orderReference: REF, session, ...rest });
  if (!noGoto) await page.goto(path);
  return mocks;
}

const prompt = (page: Page): Locator => page.getByRole('dialog', { name: PROMPT_TITLE });
const payCard = (page: Page): Locator => page.getByRole('region', { name: 'Payment needed' });
const cancelDialog = (page: Page): Locator => page.getByRole('dialog', { name: `Cancel order ${REF}?` });

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

/** Leaves the page in the app (the account page) and comes back by the browser's Back, without a reload. */
async function awayAndBack(page: Page): Promise<void> {
  await onlyVisible(page.getByRole('link', { name: 'Your account' })).click();
  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByRole('heading', { name: 'Ada', level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
}

test.describe('unpaid orders · the pop-up', () => {
  test('a · asked on the home page; Not now hides it for the visit, a reload brings it back', async ({ page }) => {
    const mocks = await open(page, { width: 390, unpaidOrders: [unpaidRow()] });
    const dialog = prompt(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`Order ${REF} is waiting for payment.`)).toBeVisible();
    await expect(dialog.getByText('Amount due')).toBeVisible();
    await expect(dialog.getByText('46.03')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Review or cancel order' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Not now' }).click();
    await expect(dialog).toHaveCount(0);
    // The one lookup that raised the pop-up has landed; nothing may ask again.
    expect(unpaidAsks(mocks)).toBe(1);

    // Navigating inside the site keeps it hidden, without asking again.
    await awayAndBack(page);
    await expect(page.locator('[data-sf-part="product-card"]').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(prompt(page)).toHaveCount(0);
    expect(unpaidAsks(mocks)).toBe(1);

    // Dismissal lives in the document, not in storage: a reload starts the visit over.
    await page.reload();
    await expect(prompt(page)).toBeVisible();
  });

  test('b · Review or cancel order lands on the order page: the payment card, no account tabs', async ({ page }) => {
    await open(page, { unpaidOrders: [unpaidRow()] });
    const dialog = prompt(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Review or cancel order' }).click();
    await expect(page).toHaveURL(new RegExp(`/account/orders/${REF}$`));
    await expect(page.getByRole('heading', { name: REF, level: 1 })).toBeVisible();
    await expect(payCard(page)).toBeVisible();
    await expect(page.getByRole('link', { name: 'All orders' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Account sections' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Loyalty' })).toHaveCount(0);
    await expect(dialog).toHaveCount(0);
  });

  test('f · a signed-out visitor gets no pop-up, and the unpaid orders are not even asked for', async ({ page }) => {
    const mocks = await open(page, { session: false, unpaidOrders: [unpaidRow()] });
    await expect(page.locator('[data-sf-part="product-card"]').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(prompt(page)).toHaveCount(0);
    expect(unpaidAsks(mocks)).toBe(0);
  });

  test('it never appears on the checkout, and is not even asked for there', async ({ page }) => {
    const mocks = await open(page, { noGoto: true, unpaidOrders: [unpaidRow()] });
    seedCart(mocks);
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: /Your details|Delivery address/ })).toBeVisible();
    await expect(prompt(page)).toHaveCount(0);
    expect(mocks.requests()).not.toContain('GET storefront/orders/unpaid');
  });

  test('inside Telegram the pop-up appears and Review or cancel order opens the order', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(FIXED_NOW);
    await installTelegramStub(page);
    await installMocks(page, { layout: 'storefront', orderFixture: 'unpaid', orderReference: REF, unpaidOrders: [unpaidRow()] });
    await page.goto('/');
    await expect(page.locator('[data-sf-layout="webapp"]')).toBeVisible();
    const dialog = prompt(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Review or cancel order' }).click();
    await expect(page).toHaveURL(new RegExp(`/account/orders/${REF}$`));
    await expect(page.getByRole('heading', { name: REF, level: 1 })).toBeVisible();
  });

  test('with the cart drawer open the pop-up waits, and appears once it is closed', async ({ page }) => {
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

  test('a customer the restricted shop has refused sees no pop-up on their account pages', async ({ page }) => {
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

test.describe('unpaid orders · the order page', () => {
  test('c · Cancel order asks first: no close button, the overlay does not close it, Keep order does, Yes cancels', async ({ page }) => {
    const mocks = await open(page, { path: ORDER_PAGE });
    await expect(payCard(page)).toBeVisible();
    await payCard(page).getByRole('button', { name: 'Cancel order' }).click();

    const dialog = cancelDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Keep order' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Yes, cancel order' })).toBeVisible();
    // Only its two buttons close it: nothing named Close, and a click on the overlay leaves it open.
    await expect(dialog.getByRole('button', { name: /close/i })).toHaveCount(0);
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Keep order' }).click();
    await expect(dialog).toHaveCount(0);
    expect(mocks.state.cancels).toEqual([]);
    await expect(payCard(page)).toBeVisible();

    await payCard(page).getByRole('button', { name: 'Cancel order' }).click();
    await cancelDialog(page).getByRole('button', { name: 'Yes, cancel order' }).click();
    await expect(page.getByText('Cancelled', { exact: true }).first()).toBeVisible();
    await expect(payCard(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /^Choose how to pay/ })).toHaveCount(0);
    expect(mocks.state.cancels).toEqual([REF]);
  });

  test('a refused cancel says a payment may be on its way and refreshes the order', async ({ page }) => {
    const mocks = await open(page, { path: ORDER_PAGE, cancelAnswers: 409 });
    await expect(payCard(page)).toBeVisible();
    const reads = () => mocks.requests().filter((r) => r === `GET storefront/orders/${REF}`).length;
    const before = reads();
    await payCard(page).getByRole('button', { name: 'Cancel order' }).click();
    await cancelDialog(page).getByRole('button', { name: 'Yes, cancel order' }).click();
    await expect(page.getByText('A payment may already be on its way, so this order cannot be cancelled here.').first()).toBeVisible();
    // The refresh shows what the backend now says: money may be coming, so contact the shop instead.
    await expect(page.getByText('To cancel this order, contact us: a payment may already be on its way.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
    expect(reads()).toBeGreaterThan(before);
    expect(mocks.state.cancels).toEqual([]);
  });

  test('d · choosing a hosted method opens its checkout, and posts the choice', async ({ page }) => {
    const mocks = await open(page, { path: ORDER_PAGE });
    await expect(page.getByRole('heading', { name: REF, level: 1 })).toBeVisible();
    await expect(payCard(page).getByRole('heading', { name: /^Choose how to pay/ })).toBeVisible();
    await payCard(page).getByRole('button', { name: /^Card/ }).click();
    await expect.poll(() => mocks.state.methods).toEqual([{ method: 'sushipp' }]);
    // The order now has a hosted payment open: the page moved on to it.
    await expect(payCard(page).getByRole('link', { name: 'Open secure checkout' })).toBeVisible();
  });

  test('an order that already has a hosted checkout open shows its link', async ({ page }) => {
    await open(page, { path: ORDER_PAGE, fixture: 'hosted' });
    await expect(payCard(page).getByRole('heading', { name: 'Finish your payment' })).toBeVisible();
    await expect(payCard(page).getByRole('link', { name: 'Open secure checkout' })).toHaveAttribute('href', `https://pay.example.invalid/checkout/${REF}`);
  });
});

test.describe('unpaid orders · the old order link', () => {
  test('e · signed out, /order/<ref>/<key> goes to sign-in and, once signed in, to the order', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(FIXED_NOW);
    await installMocks(page, { layout: 'storefront', orderFixture: 'unpaid', orderReference: REF, passwordLogin: true });
    await page.goto(`/order/${REF}/${KEY}`);
    await expect(page).toHaveURL(new RegExp(`/login\\?returnTo=%2Faccount%2Forders%2F${REF}$`));

    await page.getByRole('textbox', { name: 'Email address' }).fill(PASSWORD_ACCOUNT.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD_ACCOUNT.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/account/orders/${REF}$`));
    await expect(page.getByRole('heading', { name: REF, level: 1 })).toBeVisible();
    await expect(payCard(page)).toBeVisible();
  });

  test('signed in, /order/<ref>/<key> opens the order straight away', async ({ page }) => {
    await open(page, { path: `/order/${REF}/${KEY}` });
    await expect(page).toHaveURL(new RegExp(`/account/orders/${REF}$`));
    await expect(payCard(page)).toBeVisible();
  });
});

test.describe('the order page · what each order state shows', () => {
  test('unpaid crypto: the card carries the address and the txid form', async ({ page }) => {
    await open(page, { path: ORDER_PAGE, fixture: 'crypto' });
    await expect(payCard(page).getByRole('heading', { name: 'Send 46.03 USDT' })).toBeVisible();
    await expect(payCard(page).getByRole('textbox', { name: 'Transaction ID' })).toBeVisible();
    await expect(payCard(page).getByRole('button', { name: 'Cancel order' })).toBeVisible();
  });

  test('paid and shipped: two parcels, the delivery address, no payment card', async ({ page }) => {
    await open(page, { path: ORDER_PAGE, fixture: 'shipped' });
    await expect(page.getByRole('heading', { name: REF, level: 1 })).toBeVisible();
    await expect(payCard(page)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Parcels' }).getByText('NB000977GB')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Parcels' }).getByText('EV123456789')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Delivery address' }).getByText('14 Kirkgate')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Payments' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
  });

  test('a collection-point order says where to collect from', async ({ page }) => {
    await open(page, { path: ORDER_PAGE, fixture: 'collection' });
    await expect(page.getByRole('region', { name: 'Collect from' }).getByText('Corner News')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Delivery address' })).toHaveCount(0);
    await expect(payCard(page)).toHaveCount(0);
  });

  test('a cancelled order shows its state and no payment card', async ({ page }) => {
    await open(page, { path: ORDER_PAGE, fixture: 'cancelled' });
    await expect(page.getByRole('heading', { name: REF, level: 1 })).toBeVisible();
    await expect(page.getByText('Cancelled', { exact: true }).first()).toBeVisible();
    await expect(payCard(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
  });
});
