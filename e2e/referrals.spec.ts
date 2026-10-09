import { expect, test, type Page } from '@playwright/test';
import { installMocks, type MockHandle } from './mocks.ts';

/**
 * Web referrals, as a shopper meets them: a `/ref/CODE` or `#/ref/CODE` link is remembered in the
 * browser, the checkout then stops asking for a code and sends the remembered one, and a shopper with no
 * link can type one under the coupon field. All against the mocked backend. Synthetic codes only.
 */

const STORE_KEY = 'sf-referral-v1';
const LINE = {
  productId: 101, displayName: 'Alpine Extract 10ml', sku: 'ALP-10', unitPrice: 42.5, basePrice: 42.5, pricingTiers: [], quantity: 1,
  isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
};

async function boot(page: Page): Promise<MockHandle> {
  await page.setViewportSize({ width: 1280, height: 900 });
  const mocks = await installMocks(page, {
    layout: 'storefront',
    tweakSettings: (s) => { s.features.guestCheckout = true; },
  });
  await page.addInitScript((line) => {
    if (!window.localStorage.getItem('sf-cart-v1')) window.localStorage.setItem('sf-cart-v1', JSON.stringify({ state: { lines: [line] }, version: 0 }));
  }, LINE);
  return mocks;
}

const stored = (page: Page) => page.evaluate((k) => window.localStorage.getItem(k), STORE_KEY);

/** Contact and Address, leaving the shipping step (where the coupon lives) on screen. */
async function toShipping(page: Page): Promise<void> {
  const next = () => page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
  await page.getByRole('textbox', { name: 'First name' }).fill('Ada');
  await page.getByRole('textbox', { name: 'Surname' }).fill('Sterling');
  await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.invalid');
  await next();
  await expect(page.getByRole('heading', { name: 'Delivery address' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Address line 1' }).fill('14 Kirkgate');
  await page.getByRole('textbox', { name: 'Town / City' }).fill('Leeds');
  await page.getByRole('textbox', { name: 'Postcode' }).fill('LS1 6BY');
  await expect(page.getByRole('combobox', { name: 'Country' })).toHaveValue('GB');
  await next();
  await expect(page.getByRole('heading', { name: 'Delivery and discounts' })).toBeVisible();
  await expect(page.getByText('Tracked 24')).toBeVisible();
}

/** From the shipping step to a placed order. */
async function placeOrder(page: Page): Promise<void> {
  const next = () => page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Tracked 24').click();
  await next();
  await expect(page.getByRole('heading', { name: /How you.ll pay/ })).toBeVisible();
  await page.locator('label').filter({ hasText: 'Crypto' }).first().click();
  await page.locator('label').filter({ hasText: 'USDT' }).first().click();
  await next();
  await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
  await page.getByRole('button', { name: /^Place order/ }).click();
  await expect(page).toHaveURL(/\/order-placed\?order=/);
}

test.describe('referral links', () => {
  test('/ref/CODE is remembered, lands on the shop, and rides along on the guest order', async ({ page }) => {
    const mocks = await boot(page);
    await page.goto('/ref/TESTCODE1');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
    expect(JSON.parse((await stored(page))!)).toMatchObject({ code: 'TESTCODE1' });

    await page.goto('/checkout');
    await toShipping(page);
    await expect(page.getByRole('textbox', { name: 'Coupon code' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Referral code' })).toHaveCount(0);
    await placeOrder(page);

    expect(mocks.state.checkouts).toHaveLength(1);
    expect(mocks.state.checkouts[0]).toMatchObject({ referralCode: 'TESTCODE1' });
    for (const q of mocks.state.guestQuotes) expect(q).not.toHaveProperty('referralCode');
    expect(await stored(page)).toBeNull();
  });

  test('the hash form #/ref/CODE works and leaves a clean address', async ({ page }) => {
    await boot(page);
    await page.goto('/#/ref/TESTCODE2');
    await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
    expect(JSON.parse((await stored(page))!)).toMatchObject({ code: 'TESTCODE2' });
    expect(new URL(page.url()).hash).toBe('');
  });

  test('a guest with no link types a code under the coupon field, and it is sent', async ({ page }) => {
    const mocks = await boot(page);
    await page.goto('/checkout');
    await toShipping(page);

    const coupon = page.getByRole('textbox', { name: 'Coupon code' });
    const referral = page.getByRole('textbox', { name: 'Referral code' });
    await expect(referral).toBeVisible();
    const [c, r] = await Promise.all([coupon.boundingBox(), referral.boundingBox()]);
    expect(r!.y).toBeGreaterThan(c!.y);
    await referral.fill('testcode3');
    await placeOrder(page);

    expect(mocks.state.checkouts[0]).toMatchObject({ referralCode: 'TESTCODE3' });
    for (const q of mocks.state.guestQuotes) expect(q).not.toHaveProperty('referralCode');
  });

  test('a guest who types nothing sends no referral code', async ({ page }) => {
    const mocks = await boot(page);
    await page.goto('/checkout');
    await toShipping(page);
    await placeOrder(page);
    expect(mocks.state.checkouts[0]).not.toHaveProperty('referralCode');
  });

  test('a signed-in shopper never sees the field', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const mocks = await installMocks(page, { layout: 'storefront', session: true });
    mocks.state.cart = {
      items: [{
        productId: 101, name: LINE.displayName, quantity: 1, unitPrice: 42.5, lineTotal: 42.5, imageUrl: null, isPreorder: false, outOfStock: false, priceChanged: false,
        inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null,
      }],
      subtotal: 42.5, itemCount: 1,
    };
    await page.goto('/checkout');
    await toShipping(page);
    await expect(page.getByRole('textbox', { name: 'Coupon code' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Referral code' })).toHaveCount(0);
  });

  test('the Referrals page offers the link with a working copy button', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const mocks = await installMocks(page, { layout: 'storefront', session: true });
    await page.goto('/account/referrals');
    const code = mocks.state.profile.referralCode;
    const link = `${new URL(page.url()).origin}/ref/${code}`;
    await expect(page.getByText(link, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Copy your referral link' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  });
});
