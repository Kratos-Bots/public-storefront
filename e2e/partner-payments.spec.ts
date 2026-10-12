import { expect, test, type Locator, type Page } from '@playwright/test';
import { installMocks, ORDER_REF, PARTNER_EUR_METHODS, type InstallMocksOptions, type MockHandle } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';

/**
 * Paying through a partner: a dropship warehouse whose partner takes payment itself, in its own currency. The store sells
 * in USD here and the partner charges EUR. Everything runs against the mocked backend; synthetic data only.
 */

const NAME = 'Alpine Extract 10ml';
const ORDER_PAGE = `/account/orders/${ORDER_REF}`;
/** Set PP_SHOT_DIR to keep screenshots of the states below; unset, none are taken. */
const SHOTS = process.env.PP_SHOT_DIR;

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize()!.width}.png`, fullPage: true });
}

const usd: InstallMocksOptions['tweakSettings'] = (s) => {
  s.currency = 'USD';
};

async function open(page: Page, o: InstallMocksOptions & { path: string; cart?: boolean; width?: number; clock?: boolean }): Promise<MockHandle> {
  const { path, cart, width = 1280, clock, ...rest } = o;
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  if (clock) await page.clock.install({ time: FIXED_NOW });
  else await page.clock.setFixedTime(FIXED_NOW);
  const mocks = await installMocks(page, { layout: 'storefront', session: true, tweakSettings: usd, ...rest });
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
  await expect.poll(() => mocks.state.quotes.length).toBeGreaterThan(asked);
  await next();
  await expect(page.getByRole('heading', { name: /How you.ll pay/ })).toBeVisible();
}

const methodLabels = (page: Page): Locator => page.locator('label').filter({ has: page.getByRole('radio') });

for (const width of [1280, 390]) {
  test.describe(`partner payments · ${width}px`, () => {
    test('1 · the Payment step says what the chosen method and coin charge in', async ({ page }) => {
      const mocks = await open(page, { path: '/checkout', cart: true, width, paymentMethods: PARTNER_EUR_METHODS });
      await toPayment(page, mocks);
      await expect(page.getByTestId('charged-in')).toHaveCount(0);
      await methodLabels(page).filter({ hasText: 'Pay by card' }).first().click();
      await expect(page.getByTestId('charged-in')).toHaveText('Charged in EUR: €43.65');
      // The total on the row stays in the store currency.
      await expect(methodLabels(page).filter({ hasText: 'Pay by card' })).toContainText('$47.45');
      await methodLabels(page).filter({ hasText: 'Pay with crypto' }).first().click();
      await expect(page.getByTestId('charged-in')).toHaveText('Charged in EUR: €43.65');
      await methodLabels(page).filter({ hasText: 'USDT' }).first().click();
      await expect(page.getByTestId('charged-in')).toHaveText('Charged in EUR: €42.30');
      await shot(page, 'payment-step-eur');
    });

    test('2 · an unavailable quote replaces the methods with a message, and Try again asks for them again', async ({ page }) => {
      const mocks = await open(page, { path: '/checkout', cart: true, width, paymentMethods: PARTNER_EUR_METHODS, partnerQuoteUnavailable: 'partner_unreachable' });
      await toPayment(page, mocks);
      await expect(page.getByText(/couldn.t reach the payment service/)).toBeVisible();
      await expect(page.getByRole('radio')).toHaveCount(0);
      await shot(page, 'payment-step-unavailable');
      // Nothing to choose, so Continue stays on the step.
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByRole('heading', { name: /How you.ll pay/ })).toBeVisible();
      mocks.state.quoteUnavailable = null;
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(methodLabels(page)).toHaveCount(2);
      await expect(page.getByText(/couldn.t reach the payment service/)).toHaveCount(0);
    });

    test('3 · a warehouse whose partner is not ready says so, with nothing to retry', async ({ page }) => {
      const mocks = await open(page, { path: '/checkout', cart: true, width, partnerQuoteUnavailable: 'partner_not_ready' });
      await toPayment(page, mocks);
      await expect(page.getByText('Payment isn’t available at this warehouse right now.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    });

    test('4 · a payment still being prepared turns into the pay screen on the third read', async ({ page }) => {
      test.setTimeout(120_000);
      const mocks = await open(page, {
        path: '/checkout', cart: true, width, paymentMethods: PARTNER_EUR_METHODS, orderFixture: 'unpaid',
        checkoutPayment: { type: 'partner_pending', method: 'stripe' }, partnerPending: { resolveOnRead: 3 },
      });
      await toPayment(page, mocks);
      await methodLabels(page).filter({ hasText: 'Pay by card' }).first().click();
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
      const place = page.getByRole('button', { name: /^Place order/ });
      await expect(place).toBeEnabled();
      await place.click();
      await expect(page).toHaveURL(new RegExp(`${ORDER_PAGE}$`));
      await expect(page.getByRole('heading', { name: 'Payment is being prepared' })).toBeVisible();
      await expect(page.getByText(/Choose how you.d like to pay/)).toHaveCount(0);
      await shot(page, 'order-preparing');
      await expect(page.getByRole('link', { name: /Click here to Pay/ })).toBeVisible({ timeout: 30_000 });
      expect(mocks.state.paymentReads).toBe(3);
      await expect(page.getByText('Charged in EUR: €43.65')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Payment is being prepared' })).toHaveCount(0);
      await shot(page, 'order-pay-screen');
    });

    test('4b · the pay-later picker and the placed crypto payment say what they charge in', async ({ page }) => {
      await open(page, { path: ORDER_PAGE, width, orderFixture: 'unpaid', paymentMethods: PARTNER_EUR_METHODS });
      const card = page.getByRole('button', { name: /^Pay by card/ });
      await expect(card).toContainText('£47.45'); // the order's own currency (the fixture's)
      await expect(card).toContainText('Charged in EUR: €43.65');
      const crypto = page.getByRole('button', { name: /^Pay with crypto/ });
      await crypto.click();
      await page.getByText('USDT', { exact: true }).first().click();
      await expect(page.getByTestId('charged-in').filter({ hasText: '€43.65' }).last()).toBeVisible();
      await shot(page, 'order-picker-eur');
    });

    test('4c · a placed crypto payment shows its settlement in the same line', async ({ page }) => {
      await open(page, {
        path: ORDER_PAGE, width, orderFixture: 'crypto',
        tweakOrder: (o) => { Object.assign(o.payment!.activePayment!, { settlementAmount: 42.3, settlementCurrency: 'EUR' }); },
      });
      await expect(page.getByTestId('charged-in')).toHaveText('Charged in EUR: €42.30');
      await shot(page, 'order-crypto-eur');
    });

    test('5 · after two minutes it stops asking, says where the details will appear, and Refresh looks again', async ({ page }) => {
      const mocks = await open(page, {
        path: ORDER_PAGE, width, orderFixture: 'unpaid', clock: true, partnerPending: { resolveOnRead: null },
      });
      await expect(page.getByRole('heading', { name: 'Payment is being prepared' })).toBeVisible();
      await page.clock.runFor(125_000);
      await expect(page.getByText(/Your payment details aren.t ready yet/)).toBeVisible();
      await shot(page, 'order-preparing-late');
      // Asking has stopped.
      await expect.poll(() => mocks.state.paymentReads).toBeGreaterThan(1);
      await page.waitForTimeout(1_000); // let reads still in flight land
      const reads = mocks.state.paymentReads;
      await page.clock.runFor(60_000);
      await page.waitForTimeout(500);
      expect(mocks.state.paymentReads).toBe(reads);
      await page.getByRole('button', { name: 'Refresh' }).click();
      await expect.poll(() => mocks.state.paymentReads).toBe(reads + 1);
      // The shopper is never left without a way out.
      await expect(page.getByRole('button', { name: /Cancel order/ })).toBeVisible();
    });
  });
}
