import { expect, test, type Page } from '@playwright/test';
import { installMocks, type Layout, type MockHandle, type MockText } from './mocks.ts';
import { addFirstToCart, FIXED_NOW, onlyVisible, openProduct } from './flows.ts';

const PRODUCT = 'Alpine Extract 10ml';

/** Signed in, one Alpine Extract in the cart, then the cart page. */
async function cartWithOne(page: Page, layout: Layout, text?: MockText): Promise<MockHandle> {
  await page.clock.setFixedTime(FIXED_NOW);
  const mocks = await installMocks(page, { layout, session: true, text });
  await page.goto('/');
  await openProduct(page, layout, PRODUCT);
  await addFirstToCart(page, layout, mocks);
  await page.goto('/cart');
  return mocks;
}

/** The cart summary's label reads `Subtotal<span>1 item</span>`, so it is matched as a prefix. */
const startsWith = (label: string) => new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
const subtotalLabel = (page: Page, label: string) => onlyVisible(page.getByText(startsWith(label)));

test.describe('published site text', () => {
  // A phone: `/cart` is a page there — on a desktop it redirects home and opens the drawer.
  test.use({ viewport: { width: 390, height: 844 } });

  for (const layout of ['storefront', 'menu', 'webapp'] as const) {
    test(`a shared edit shows on the ${layout} layout`, async ({ page }) => {
      await cartWithOne(page, layout, { shared: { 'common.totals.subtotal': 'Sub-total' } });
      await expect(subtotalLabel(page, 'Sub-total')).toBeVisible();
      await expect(page.getByText(startsWith('Subtotal'))).toHaveCount(0);
    });
  }

  test('a layout override shows on its layout', async ({ page }) => {
    await cartWithOne(page, 'menu', { shared: { 'common.totals.subtotal': 'Sub-total' }, layout: { menu: { 'common.totals.subtotal': 'Menu total' } } });
    await expect(subtotalLabel(page, 'Menu total')).toBeVisible();
  });

  test('another layout\'s override does not leak', async ({ page }) => {
    await cartWithOne(page, 'storefront', { shared: { 'common.totals.subtotal': 'Sub-total' }, layout: { menu: { 'common.totals.subtotal': 'Menu total' } } });
    await expect(subtotalLabel(page, 'Sub-total')).toBeVisible();
    await expect(page.getByText('Menu total')).toHaveCount(0);
  });

  test('an override with an unknown placeholder falls back to the shared value', async ({ page }) => {
    await cartWithOne(page, 'storefront', { shared: { 'common.totals.subtotal': 'Sub-total' }, layout: { storefront: { 'common.totals.subtotal': 'Total {oops}' } } });
    await expect(subtotalLabel(page, 'Sub-total')).toBeVisible();
    await expect(page.getByText('Total {oops}')).toHaveCount(0);
  });

  test('cart plural at 1 and 2 items', async ({ page }) => {
    await cartWithOne(page, 'storefront', { shared: { 'cart.summary.items': { one: '{count} thing', other: '{count} things' } } });
    await expect(onlyVisible(page.getByText('1 thing', { exact: true }))).toBeVisible();
    await onlyVisible(page.getByRole('button', { name: `One more ${PRODUCT}` })).click();
    await expect(onlyVisible(page.getByText('2 things', { exact: true }))).toBeVisible();
  });

  test('an edited checkout validation message', async ({ page }) => {
    await cartWithOne(page, 'storefront', { shared: { 'checkout.errors.required': 'Please fill this in' } });
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    await page.getByRole('textbox', { name: 'First name' }).fill('');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(onlyVisible(page.getByText('Please fill this in', { exact: true }))).toBeVisible();
  });

  test('de + de-DE sets <html lang> and German money', async ({ page }) => {
    const mocks = await cartWithOne(page, 'storefront', { locale: 'de', formatLocale: 'de-DE' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: mocks.state.settings.currency }).format(mocks.state.cart.subtotal);
    await expect(onlyVisible(page.getByText(money, { exact: true }))).toBeVisible();
  });

  test('de-DE dates on the account order page', async ({ page }) => {
    await page.clock.setFixedTime(FIXED_NOW);
    const mocks = await installMocks(page, { layout: 'storefront', session: true, text: { locale: 'de', formatLocale: 'de-DE' } });
    await page.goto('/account/orders/K4M2QP');
    const date = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(mocks.state.orderDetail.createdAt));
    await expect(onlyVisible(page.getByText(date, { exact: false }))).toBeVisible();
  });

  test('a 503 renders the defaults', async ({ page }) => {
    await page.clock.setFixedTime(FIXED_NOW);
    await installMocks(page, { layout: 'storefront', session: true, pagesFail: 503, text: { shared: { 'common.totals.subtotal': 'Sub-total' } } });
    await page.goto('/');
    await expect(onlyVisible(page.getByRole('link', { name: /^Cart, / }))).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('an old-shape response renders the defaults', async ({ page }) => {
    await cartWithOne(page, 'storefront');
    await expect(subtotalLabel(page, 'Subtotal')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});
