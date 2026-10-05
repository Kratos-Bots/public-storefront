import { expect, test, type Locator, type Page } from '@playwright/test';
import { FOUR_METHODS, installMocks, ORDER_REF, SESSION_CUSTOMER, SESSION_TOKEN, type InstallMocksOptions, type MockHandle } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';

/**
 * The payment method list, as a shopper meets it: every method under the shop's own name, in the shop's
 * order, at checkout, on the order page and on the account order page; and an older backend (no list
 * option, fixtures that still carry `slot`) still works. Everything runs against the mocked backend.
 * Synthetic data only.
 */

const NAME = 'Alpine Extract 10ml';
const NAMES = ['Pay with crypto', 'Pay by card', 'PayPal balance', 'Bank transfer (UK)'];

interface OpenOptions extends InstallMocksOptions {
  path: string;
  /** A server cart with one line, so /checkout stays on the checkout. */
  cart?: boolean;
  width?: number;
}

async function open(page: Page, o: OpenOptions): Promise<MockHandle> {
  const { path, cart, width = 1280, ...rest } = o;
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.clock.setFixedTime(FIXED_NOW);
  const mocks = await installMocks(page, { layout: 'storefront', session: true, ...rest });
  if (cart) {
    mocks.state.cart = {
      items: [{
        productId: 101, name: NAME, quantity: 1, unitPrice: 42.5, lineTotal: 42.5, imageUrl: null, isPreorder: false, outOfStock: false, priceChanged: false,
        inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null,
      }],
      subtotal: 42.5, itemCount: 1,
    };
  }
  await page.goto(path);
  return mocks;
}

/** Contact, Address and Shipping filled in, stopping on the Payment step. */
async function toPayment(page: Page, mocks: MockHandle): Promise<void> {
  const next = () => page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
  await page.getByRole('textbox', { name: 'First name' }).fill('Ada');
  await page.getByRole('textbox', { name: 'Surname' }).fill('Sterling');
  await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.invalid');
  await next();
  await expect(page.getByRole('heading', { name: 'Delivery address' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Country' })).toHaveValue('GB');
  await page.getByRole('textbox', { name: 'Address line 1' }).fill('14 Kirkgate');
  await page.getByRole('textbox', { name: 'Town / City' }).fill('Leeds');
  await page.getByRole('textbox', { name: 'Postcode' }).fill('LS1 6BY');
  await next();
  await expect(page.getByRole('heading', { name: 'Delivery and discounts' })).toBeVisible();
  await expect(page.getByText('Tracked 24')).toBeVisible();
  const asked = mocks.state.quotes.length;
  await page.getByText('Tracked 24').click();
  // The choice re-prices the order after a short debounce: wait for that quote to be asked for.
  await expect.poll(() => mocks.state.quotes.length).toBeGreaterThan(asked);
  await next();
  await expect(page.getByRole('heading', { name: /How you.ll pay/ })).toBeVisible();
}

/** The radios' labels on the Payment step, top to bottom. */
const methodLabels = (page: Page): Locator => page.locator('label').filter({ has: page.getByRole('radio') });

async function chooseMethod(page: Page, name: string): Promise<void> {
  await methodLabels(page).filter({ hasText: name }).first().click();
}

/** On Review: wait for a settled quote (no request in flight, the button live), then place the order. */
async function placeOrder(page: Page, mocks: MockHandle): Promise<void> {
  const button = page.getByRole('button', { name: /^Place order/ });
  await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
  await expect(button).toBeEnabled();
  // Stable: the count of quote requests does not move across a full round trip of the page.
  let last = -1;
  await expect.poll(async () => {
    const now = mocks.state.quotes.length + mocks.state.guestQuotes.length;
    const stable = now === last;
    last = now;
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    return stable;
  }, { intervals: [100, 200, 400, 400], timeout: 10_000 }).toBe(true);
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page).toHaveURL(new RegExp(`/account/orders/${ORDER_REF}$`));
}

/** The order page's method buttons, in page order. */
const pickerRows = (page: Page): Locator => page.getByRole('button', { name: /^(Pay with crypto|Pay by card|PayPal balance|Bank transfer \(UK\)|Card payment|Crypto)/ });

const ORDER_PAGE = `/account/orders/${ORDER_REF}`;

test.describe('payment methods · checkout', () => {
  test('1 · the Payment step lists the four methods in the list order, under the shop’s names', async ({ page }) => {
    const mocks = await open(page, { path: '/checkout', cart: true, paymentMethods: FOUR_METHODS });
    await toPayment(page, mocks);
    await expect(methodLabels(page)).toHaveCount(4);
    const texts = await methodLabels(page).allTextContents();
    expect(texts.map((t, i) => t.startsWith(NAMES[i]!))).toEqual([true, true, true, true]);
    // The fee wording sits beside the name, and each row carries its own total.
    await expect(methodLabels(page).nth(2)).toContainText('PayPal balance fee +2%');
    await expect(methodLabels(page).nth(1)).toContainText('47.45');
  });

  test('2 · PayPal balance: Review names it, and the order is posted with paymentMethod paypal', async ({ page }) => {
    const mocks = await open(page, { path: '/checkout', cart: true, paymentMethods: FOUR_METHODS });
    await toPayment(page, mocks);
    await chooseMethod(page, 'PayPal balance');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
    await expect(page.getByText('PayPal balance', { exact: true })).toBeVisible();
    await placeOrder(page, mocks);
    expect(mocks.state.checkouts).toHaveLength(1);
    expect(mocks.state.checkouts[0]).toMatchObject({ paymentMethod: 'paypal', shippingOptionId: 11 });
    expect(mocks.state.checkouts[0]!.coin).toBeUndefined();
  });

  test('3 · Pay with crypto opens the coin picker, and the order is posted with the coin and network', async ({ page }) => {
    const mocks = await open(page, { path: '/checkout', cart: true, paymentMethods: FOUR_METHODS });
    await toPayment(page, mocks);
    await chooseMethod(page, 'Pay with crypto');
    await expect(page.getByText('Stablecoins', { exact: true })).toBeVisible();
    await chooseMethod(page, 'USDT');
    await page.getByRole('button', { name: 'Continue' }).click();
    // The shop's name for the method, then the combo, in the one line the Review step gives the payment.
    await expect(page.getByText(/^Pay with crypto\s*USDT · Polygon$/)).toBeVisible();
    await placeOrder(page, mocks);
    expect(mocks.state.checkouts[0]).toMatchObject({ paymentMethod: 'crypto', coin: 'usdt', network: 'polygon' });
  });

  test('4 · Bank transfer (UK) shows the offline note, and the order page shows the transfer details', async ({ page }) => {
    const mocks = await open(page, {
      path: '/checkout', cart: true, paymentMethods: FOUR_METHODS, orderFixture: 'unpaid',
      checkoutPayment: { type: 'manual', paymentId: 9004, method: 'uk_bank_transfer', displayName: 'Bank transfer (UK)', amount: 47.45, instructions: FOUR_METHODS[3]!.details! },
    });
    await toPayment(page, mocks);
    await chooseMethod(page, 'Bank transfer (UK)');
    await expect(page.getByText('We’ll send the transfer details once the order is placed.')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Bank transfer (UK)', { exact: true })).toBeVisible();
    await placeOrder(page, mocks);
    expect(mocks.state.checkouts[0]).toMatchObject({ paymentMethod: 'uk_bank_transfer' });
    // The order is still to be paid, so its page offers the methods; the transfer's row holds the details.
    await pickerRows(page).filter({ hasText: 'Bank transfer (UK)' }).click();
    await expect(page.getByText('Example Shop Ltd')).toBeVisible();
    await expect(page.getByText('00-00-00')).toBeVisible();
    await expect(page.getByText('00000000', { exact: true })).toBeVisible();
  });
});

test.describe('payment methods · the order page', () => {
  test('5 · the picker lists the same four names in the same order; a transfer creates no payment; card posts stripe', async ({ page }) => {
    const mocks = await open(page, { path: ORDER_PAGE, orderFixture: 'unpaid', paymentMethods: FOUR_METHODS });
    await expect(page.getByRole('heading', { name: /^Choose how to pay/ })).toBeVisible();
    await expect(pickerRows(page)).toHaveCount(4);
    const texts = await pickerRows(page).allTextContents();
    expect(texts.map((t, i) => t.startsWith(NAMES[i]!))).toEqual([true, true, true, true]);

    // The transfer opens its details here and asks the backend for nothing.
    await pickerRows(page).filter({ hasText: 'Bank transfer (UK)' }).click();
    await expect(page.getByText('Example Shop Ltd')).toBeVisible();
    expect(mocks.state.methods).toEqual([]);

    await pickerRows(page).filter({ hasText: 'Pay by card' }).click();
    await expect.poll(() => mocks.state.methods).toEqual([{ method: 'stripe' }]);
    await expect(page.getByRole('link', { name: 'Open secure checkout' })).toBeVisible();
  });

  test('8 · a method the backend refuses is explained, and the picker stays usable', async ({ page }) => {
    const mocks = await open(page, { path: ORDER_PAGE, orderFixture: 'unpaid', paymentMethods: FOUR_METHODS, refuseMethodSelection: true });
    await expect(pickerRows(page)).toHaveCount(4);
    await pickerRows(page).filter({ hasText: 'Pay by card' }).click();
    await expect(page.getByText('That payment method is not available for this order')).toBeVisible();
    await expect(pickerRows(page)).toHaveCount(4);
    for (const row of await pickerRows(page).all()) await expect(row).toBeEnabled();
    // Another method can be tried straight away.
    await pickerRows(page).filter({ hasText: 'PayPal balance' }).click();
    // The second attempt reached the backend first; only then can the message on screen be its answer.
    await expect.poll(() => mocks.state.methods).toEqual([{ method: 'stripe' }, { method: 'paypal' }]);
    await expect(page.getByText('That payment method is not available for this order')).toBeVisible();
  });

  test('9 · the fee wording reads with the shop’s name: a discount for crypto, a fee for PayPal', async ({ page }) => {
    await open(page, { path: ORDER_PAGE, orderFixture: 'unpaid', paymentMethods: FOUR_METHODS });
    await expect(pickerRows(page)).toHaveCount(4);
    await expect(pickerRows(page).nth(0)).toContainText('Pay with crypto (3% discount)');
    await expect(pickerRows(page).nth(2)).toContainText('PayPal balance (2% fee)');
    // No fee, no wording: the card row is the bare name.
    await expect(pickerRows(page).nth(1)).not.toContainText('fee');
    await expect(pickerRows(page).nth(1)).not.toContainText('discount');
  });
});

test.describe('payment methods · the account order page', () => {
  test('6 · a paid order’s payment is named as the shop names it', async ({ page }) => {
    await open(page, {
      path: '/account/orders/K4M2QP', paymentMethods: FOUR_METHODS,
      tweakOrderDetail: (d) => { d.payments[0]!.method = 'stripe'; },
    });
    await expect(page.getByRole('heading', { name: 'K4M2QP' })).toBeVisible();
    await expect(page.getByText('Pay by card', { exact: true })).toBeVisible();
    await expect(page.getByText('stripe', { exact: true })).toHaveCount(0);
  });
});

test.describe('payment methods · an older backend', () => {
  test('7 · with no list option (fixtures that still carry slot) checkout and the order page still work', async ({ page }) => {
    // Checkout: a method is shown, selectable, and posted.
    const mocks = await open(page, { path: '/checkout', cart: true });
    await toPayment(page, mocks);
    await expect(methodLabels(page).first()).toContainText('Card payment');
    await chooseMethod(page, 'Card payment');
    await expect(methodLabels(page).first().getByRole('radio')).toBeChecked();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
    await expect(page.getByText('Card payment', { exact: true })).toBeVisible();
    await placeOrder(page, mocks);
    expect(mocks.state.checkouts[0]).toMatchObject({ paymentMethod: 'sushipp' });
  });

  test('7b · the order page of an older backend lists its methods and a card choice posts', async ({ page }) => {
    const mocks = await open(page, { path: ORDER_PAGE, orderFixture: 'unpaid' });
    await expect(pickerRows(page)).toHaveCount(2);
    await expect(pickerRows(page).first()).toContainText('Card payment');
    await pickerRows(page).first().click();
    await expect.poll(() => mocks.state.methods).toEqual([{ method: 'sushipp' }]);
  });
});

test.describe('payment methods · a long name', () => {
  const LONG = 'Pay-by-card-or-contactless-wallet-instant'.slice(0, 40);
  const long = FOUR_METHODS.map((m) => (m.method === 'stripe' ? { ...m, displayName: LONG } : m));

  /** The element's right edge sits inside the viewport, and the page does not scroll sideways. */
  async function expectContained(page: Page, figure: Locator): Promise<void> {
    const box = (await figure.boundingBox())!;
    const width = page.viewportSize()!.width;
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    const scrolls = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(scrolls).toBe(false);
  }

  test('10 · an unbroken 40-character name wraps at 390 px on the Payment step: the total stays on screen', async ({ page }) => {
    expect(LONG).toHaveLength(40);
    const mocks = await open(page, { path: '/checkout', cart: true, width: 390, paymentMethods: long });
    await toPayment(page, mocks);
    const row = methodLabels(page).filter({ hasText: LONG });
    await expect(row).toBeVisible();
    await expectContained(page, row.getByText(/47\.45/).last());
  });

  test('10b · the same name wraps in the order page picker', async ({ page }) => {
    await open(page, { path: ORDER_PAGE, orderFixture: 'unpaid', width: 390, paymentMethods: long });
    const pick = page.getByRole('button', { name: new RegExp(`^${LONG}`) });
    await expect(pick).toBeVisible();
    await expectContained(page, pick.getByText(/47\.45/).last());
  });
});
