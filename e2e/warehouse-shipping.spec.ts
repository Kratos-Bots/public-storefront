import { expect, test, type Page } from '@playwright/test';
import { installMocks, type InstallMocksOptions } from './mocks.ts';
import { openProduct } from './flows.ts';

/**
 * Shipping follows the selected warehouse (STOREFRONT.md 3.8b), mocked end to end. "Main" is the shop's default and
 * serves the fixture's methods (Tracked 24 at 4.95, Tracked 48 at 2.95) in the shop's countries (GB, IE). "North
 * warehouse" (id 2) has its own shipping: Ireland and Germany, one method, Standard at 5.00.
 */
test.use({ viewport: { width: 390, height: 844 } });

const WAREHOUSES: NonNullable<InstallMocksOptions['warehouses']> = {
  list: [
    { id: 1, name: 'Main', country: 'GB', isDefault: true, shipping: { countries: ['GB', 'IE'], collectionCountries: [] } },
    { id: 2, name: 'North warehouse', country: 'DE', isDefault: false, shipping: { countries: ['DE', 'IE'], collectionCountries: [] } },
  ],
  carries: { 2: [101] },
  quoteShipping: { 2: [{ id: 41, name: 'Standard', courier: 'North Post', price: 5, freeShipping: false }] },
};

const next = (page: Page) => page.getByRole('button', { name: 'Continue' }).click();
const country = (page: Page) => page.getByRole('combobox', { name: 'Country' });

async function toAddress(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
  await page.getByRole('textbox', { name: 'First name' }).fill('Ada');
  await page.getByRole('textbox', { name: 'Surname' }).fill('Sterling');
  await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.invalid');
  await next(page);
  await expect(page.getByRole('heading', { name: 'Delivery address' })).toBeVisible();
}

async function fillAddress(page: Page): Promise<void> {
  await page.getByRole('textbox', { name: 'Address line 1' }).fill('14 Kirkgate');
  await page.getByRole('textbox', { name: 'Town / City' }).fill('Leeds');
  await page.getByRole('textbox', { name: /Postcode|Eircode/ }).fill('LS1 6BY');
}

test('switching warehouse changes the countries, the methods and the price, and drops the chosen method', async ({ page }) => {
  const mocks = await installMocks(page, {
    layout: 'storefront',
    warehouses: WAREHOUSES,
    tweakSettings: (s) => {
      s.features.guestCheckout = true;
      s.shipping = { countries: ['GB', 'IE'], collectionCountries: [] };
    },
  });

  // At the shop's own warehouse: its countries, its two methods, Tracked 24 chosen.
  await page.goto('/');
  await openProduct(page, 'storefront', 'Alpine Extract 10ml');
  await page.getByRole('button', { name: /^Add · / }).first().click();
  await expect(page.getByRole('group', { name: /in your cart/ }).first()).toBeVisible();
  await page.goto('/checkout');
  await toAddress(page);
  await expect(country(page).locator('option:not([value=""])')).toHaveText(['Ireland', 'United Kingdom']);
  await expect(country(page)).toHaveValue('GB');
  await fillAddress(page);
  await next(page);
  await expect(page.getByRole('heading', { name: 'Delivery and discounts' })).toBeVisible();
  await expect(page.getByText('Tracked 48')).toBeVisible();
  await page.getByText('Tracked 24').click();
  await expect(page.getByRole('radio', { name: /Tracked 24/ })).toBeChecked();

  // Switch to the north warehouse (the picker is hidden on /checkout, so on the shop front).
  await page.goto('/');
  await page.getByLabel('Shipping from').selectOption({ label: 'North warehouse · DE' });
  await expect.poll(() => mocks.state.urls).toContain('GET catalog?warehouse=2');
  await page.goto('/checkout');

  // Its own countries: the shop's United Kingdom is gone and the chosen country with it.
  await toAddress(page);
  await expect(country(page).locator('option:not([value=""])')).toHaveText(['Germany', 'Ireland']);
  await expect(country(page)).toHaveValue('');
  await country(page).selectOption('IE');
  await fillAddress(page);
  await next(page);

  // Its own method and price; the previously chosen Tracked 24 is neither offered nor kept.
  await expect(page.getByRole('heading', { name: 'Delivery and discounts' })).toBeVisible();
  await expect(page.getByText('Standard')).toBeVisible();
  await expect(page.getByText('£5.00').first()).toBeVisible();
  await expect(page.getByText('Tracked 24')).toHaveCount(0);
  await expect(page.getByText('Tracked 48')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /Standard/ })).not.toBeChecked();
  await expect.poll(() => mocks.state.guestQuotes.at(-1)).toMatchObject({ warehouseId: 2, country: 'IE' });
  await next(page);
  await expect(page.getByText('Choose a shipping method')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Delivery and discounts' })).toBeVisible();
});

test('with the feature off the checkout lists the shop\'s countries whatever a warehouse says', async ({ page }) => {
  const mocks = await installMocks(page, {
    layout: 'storefront',
    tweakSettings: (s) => {
      s.features.guestCheckout = true;
      s.shipping = { countries: ['GB', 'IE'], collectionCountries: [] };
    },
  });
  await page.addInitScript(() => window.localStorage.setItem('sf-warehouse-v1', JSON.stringify({ state: { warehouseId: 2 }, version: 0 })));
  await page.goto('/');
  await openProduct(page, 'storefront', 'Alpine Extract 10ml');
  await page.getByRole('button', { name: /^Add · / }).first().click();
  await expect(page.getByRole('group', { name: /in your cart/ }).first()).toBeVisible();
  await page.goto('/checkout');
  await toAddress(page);
  await expect(country(page).locator('option:not([value=""])')).toHaveText(['Ireland', 'United Kingdom']);
  expect(mocks.state.urls.filter((u) => /warehouse/.test(u))).toEqual([]);
});
