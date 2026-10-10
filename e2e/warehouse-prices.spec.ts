import { expect, test } from '@playwright/test';
import { installMocks, type InstallMocksOptions } from './mocks.ts';
import { fillCheckout, onlyVisible, openCart, openProduct } from './flows.ts';

/**
 * Prices follow the selected warehouse (STOREFRONT.md 3.8b), mocked end to end. "Main" is the shop's default and
 * serves the fixture's prices; "Test EU" (id 2) serves its own for Alpine Extract: 55.00 instead of 42.50. A guest
 * basket is priced on the device, so it must follow the switch by itself.
 */
test.use({ viewport: { width: 390, height: 844 } });

const WAREHOUSES: NonNullable<InstallMocksOptions['warehouses']> = {
  list: [
    { id: 1, name: 'Main', country: 'GB', isDefault: true },
    { id: 2, name: 'Test EU', country: 'DE', isDefault: false },
  ],
  carries: { 2: [101, 102] },
  prices: { 2: { 101: { price: 55, pricingTiers: [] } } },
};

test('a guest basket, the product page and the checkout review all follow the warehouse', async ({ page }) => {
  const mocks = await installMocks(page, {
    layout: 'storefront',
    warehouses: WAREHOUSES,
    tweakSettings: (s) => {
      s.features.guestCheckout = true;
    },
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();

  // At the default warehouse: 42.50 on the product and in the basket.
  await openProduct(page, 'storefront', 'Alpine Extract 10ml');
  await expect(page.getByText('£42.50').first()).toBeVisible();
  await page.getByRole('button', { name: /^Add · / }).first().click();
  await expect(page.getByRole('group', { name: /in your cart/ }).first()).toBeVisible();
  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
  await expect(page.getByText('£42.50').first()).toBeVisible();
  await expect(page.getByText('£55.00')).toHaveCount(0);

  // Switch warehouse: the basket re-prices on its own.
  await page.goto('/');
  await page.getByLabel('Shipping from').selectOption({ label: 'Test EU · DE' });
  await expect.poll(() => mocks.state.urls).toContain('GET catalog?warehouse=2');

  await openProduct(page, 'storefront', 'Alpine Extract 10ml');
  await expect(page.getByText('£55.00').first()).toBeVisible();
  await expect(page.getByText('£42.50')).toHaveCount(0);

  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
  await expect(page.getByText('£55.00').first()).toBeVisible();
  await expect(page.getByText('£42.50')).toHaveCount(0);
  await expect(page.getByText('Price updated')).toHaveCount(0);

  // The review step sends the lines and the warehouse, and shows the warehouse's price.
  await page.getByRole('link', { name: 'Checkout' }).click();
  await expect(page.getByRole('heading', { name: 'Guest checkout', level: 1 })).toBeVisible();
  await fillCheckout(page);
  await expect.poll(() => mocks.state.guestQuotes.length).toBeGreaterThan(0);
  expect(mocks.state.guestQuotes.at(-1)).toMatchObject({ warehouseId: 2, items: [{ productId: 101, quantity: 1 }] });
  await expect(page.getByText('£55.00').first()).toBeVisible();
  await expect(page.getByText('£42.50')).toHaveCount(0);
  await expect(page.getByText('Price updated')).toHaveCount(0);
});

test('switching back to the default warehouse brings the default price back', async ({ page }) => {
  await installMocks(page, { layout: 'storefront', warehouses: WAREHOUSES });
  await page.addInitScript(() => window.localStorage.setItem('sf-warehouse-v1', JSON.stringify({ state: { warehouseId: 2 }, version: 0 })));
  await page.goto('/');
  await openProduct(page, 'storefront', 'Alpine Extract 10ml');
  await expect(page.getByText('£55.00').first()).toBeVisible();
  await page.getByRole('button', { name: /^Add · / }).first().click();
  await expect(page.getByRole('group', { name: /in your cart/ }).first()).toBeVisible();

  await page.goto('/');
  await page.getByLabel('Shipping from').selectOption({ label: 'Main · GB' });
  await openCart(page, 'mobile');
  await expect(page.getByText('£42.50').first()).toBeVisible();
  await expect(page.getByText('£55.00')).toHaveCount(0);
  await expect(onlyVisible(page.getByText('Price updated'))).toHaveCount(0);
});
