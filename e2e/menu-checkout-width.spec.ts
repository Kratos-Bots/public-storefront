import { expect, test, type Page } from '@playwright/test';
import { installMocks, installTelegramStub, type Layout, type MockHandle } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';

/**
 * The checkout is the one page the compact catalogue layout does not narrow: at desktop width its form column gets the
 * room it has in the storefront layout, while browsing stays in the 48rem column and phones are untouched. The web
 * app's phone column never widens. Set MENU_CHECKOUT_SHOTS=<dir> to also write screenshots there.
 */

const SHOTS = process.env.MENU_CHECKOUT_SHOTS;
const LINE = {
  productId: 101, displayName: 'Alpine Extract 10ml', sku: 'ALP-10', unitPrice: 42.5, basePrice: 42.5, pricingTiers: [], quantity: 1,
  isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
};

async function open(page: Page, layout: Layout, path: string, width: number): Promise<MockHandle> {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 800 });
  await page.clock.setFixedTime(FIXED_NOW);
  if (layout === 'webapp') await installTelegramStub(page);
  const mocks = await installMocks(page, { layout, session: layout !== 'webapp' });
  mocks.state.cart = {
    items: [{
      productId: 101, name: LINE.displayName, quantity: 1, unitPrice: 42.5, lineTotal: 42.5, imageUrl: null, isPreorder: false, outOfStock: false,
      priceChanged: false, inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null,
    }],
    subtotal: 42.5, itemCount: 1,
  };
  await page.goto(path);
  return mocks;
}

const width = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => el.getBoundingClientRect().width);

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test.describe('menu layout · checkout width', () => {
  test('desktop: the checkout takes the wide rail, the catalogue keeps the compact one', async ({ page }) => {
    await open(page, 'menu', '/checkout', 1280);
    const main = '[data-sf-part="main"]';
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    expect(await width(page, main)).toBeGreaterThanOrEqual(1100);
    // The step card is the form column: the first of the page grid's two.
    const form = await page.locator(`${main} [data-sf-part="card"]`).first().evaluate((el) => el.getBoundingClientRect().width);
    expect(form).toBeGreaterThanOrEqual(600);
    await shot(page, 'final-menu-checkout-1280');

    await page.goto('/');
    await expect(page.locator(main)).toBeVisible();
    expect(await width(page, main)).toBeLessThanOrEqual(768);
    await shot(page, 'final-menu-catalogue-1280');
  });

  test('phone: the checkout is as wide as the phone', async ({ page }) => {
    await open(page, 'menu', '/checkout', 390);
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    expect(await width(page, '[data-sf-part="main"]')).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await shot(page, 'final-menu-checkout-390');
  });

  test('the web app keeps its phone column on the checkout', async ({ page }) => {
    await open(page, 'webapp', '/checkout', 1280);
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    expect(await width(page, '[data-sf-part="main"]')).toBeLessThanOrEqual(35 * 16);
    expect(await page.locator('[data-sf-wide]').count()).toBe(0);
    await shot(page, 'webapp-checkout-1280');
  });
});
