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

/** The price on a method's own row of the Delivery step. */
const rowPrice = (page: Page, name: string) => page.locator('label').filter({ hasText: name });
/** The shipping figure of the order summary (shown once a method is chosen). */
const summaryShipping = (page: Page) => page.getByText('Shipping', { exact: true }).locator('xpath=following-sibling::span').first();

async function addToBasket(page: Page): Promise<void> {
  await page.goto('/');
  await openProduct(page, 'storefront', 'Alpine Extract 10ml');
  await page.getByRole('button', { name: /^Add · / }).first().click();
  await expect(page.getByRole('group', { name: /in your cart/ }).first()).toBeVisible();
}

async function switchToNorth(page: Page, mocks: { state: { urls: string[] } }): Promise<void> {
  // The picker is hidden on /checkout, so the switch is made on the shop front.
  await page.goto('/');
  await page.getByLabel('Shipping from').selectOption({ label: 'North warehouse · DE' });
  await expect.poll(() => mocks.state.urls).toContain('GET catalog?warehouse=2');
}

const shopMocks = (page: Page) => installMocks(page, {
  layout: 'storefront',
  warehouses: WAREHOUSES,
  tweakSettings: (s) => {
    s.features.guestCheckout = true;
    s.shipping = { countries: ['GB', 'IE'], collectionCountries: [] };
  },
});

test('switching to a warehouse that does not serve the country changes countries, methods and price, and drops the method', async ({ page }) => {
  const mocks = await shopMocks(page);

  // At the shop's own warehouse: its countries, its two methods and their prices, Tracked 24 chosen.
  await addToBasket(page);
  await page.goto('/checkout');
  await toAddress(page);
  await expect(country(page).locator('option:not([value=""])')).toHaveText(['Ireland', 'United Kingdom']);
  await expect(country(page)).toHaveValue('GB');
  await fillAddress(page);
  await next(page);
  await expect(page.getByRole('heading', { name: 'Delivery and discounts' })).toBeVisible();
  await expect(rowPrice(page, 'Tracked 24')).toContainText('£4.95');
  await expect(rowPrice(page, 'Tracked 48')).toContainText('£2.95');
  await page.getByText('Tracked 24').click();
  await expect(page.getByRole('radio', { name: /Tracked 24/ })).toBeChecked();
  await expect(summaryShipping(page)).toHaveText('£4.95');

  await switchToNorth(page, mocks);
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
  await expect(rowPrice(page, 'Standard')).toContainText('£5.00');
  await expect(page.getByText('Tracked 24')).toHaveCount(0);
  await expect(page.getByText('Tracked 48')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /Standard/ })).not.toBeChecked();
  await expect.poll(() => mocks.state.guestQuotes.at(-1)).toMatchObject({ warehouseId: 2, country: 'IE' });
  expect(mocks.state.guestQuotes.at(-1)).not.toHaveProperty('shippingOptionId');
  await next(page);
  await expect(page.getByText('Choose a shipping method')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Delivery and discounts' })).toBeVisible();
});

test('switching to a warehouse that serves the same country does not carry the old method over', async ({ page }) => {
  const mocks = await shopMocks(page);

  // Ireland is served by both warehouses; Tracked 24 is chosen at the shop's own.
  await addToBasket(page);
  await page.goto('/checkout');
  await toAddress(page);
  await country(page).selectOption('IE');
  await fillAddress(page);
  await next(page);
  await expect(rowPrice(page, 'Tracked 24')).toContainText('£4.95');
  await page.getByText('Tracked 24').click();
  await expect(summaryShipping(page)).toHaveText('£4.95');

  await switchToNorth(page, mocks);
  const before = mocks.state.guestQuotes.length;
  await page.goto('/checkout');
  await toAddress(page);
  await expect(country(page)).toHaveValue('IE');
  await fillAddress(page);
  await next(page);

  // The new warehouse's list is shown and current (no "still pricing"), and the old method id was never sent to it.
  await expect(page.getByRole('heading', { name: 'Delivery and discounts' })).toBeVisible();
  await expect(rowPrice(page, 'Standard')).toContainText('£5.00');
  await expect(page.getByText('Tracked 24')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /Standard/ })).not.toBeChecked();
  const sent = mocks.state.guestQuotes.slice(before);
  expect(sent.length).toBeGreaterThan(0);
  for (const q of sent) expect(q).not.toHaveProperty('shippingOptionId');

  // The shopper can choose a method and carry on.
  await page.getByText('Standard').click();
  await expect(summaryShipping(page)).toHaveText('£5.00');
  await next(page);
  await expect(page.getByRole('heading', { name: /How you.ll pay/ })).toBeVisible();
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

test('a warehouse that ships nowhere offers no country, says so on the address step and stops there', async ({ page }) => {
  const mocks = await installMocks(page, {
    layout: 'storefront',
    warehouses: {
      list: [
        ...WAREHOUSES.list,
        { id: 3, name: 'Quiet warehouse', country: 'FR', isDefault: false, shipping: { countries: [], collectionCountries: [] } },
      ],
      carries: { 2: [101], 3: [101] },
      // Like the backend: a warehouse with nothing to ship with quotes an empty method list.
      quoteShipping: { ...WAREHOUSES.quoteShipping, 3: [] },
    },
    tweakSettings: (s) => {
      s.features.guestCheckout = true;
      s.shipping = { countries: ['GB', 'IE'], collectionCountries: [] };
    },
  });
  await addToBasket(page);
  await page.goto('/');
  await page.getByLabel('Shipping from').selectOption({ label: 'Quiet warehouse · FR' });
  await expect.poll(() => mocks.state.urls).toContain('GET catalog?warehouse=3');
  await page.goto('/checkout');
  await toAddress(page);

  // Not every country: none, and the shopper is told before filling the form in.
  await expect(country(page).locator('option:not([value=""])')).toHaveCount(0);
  await expect(page.getByText(/We can.t ship to that country yet/)).toBeVisible();

  // Continue stays on the address step.
  await next(page);
  await expect(page.getByRole('heading', { name: 'Delivery address' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Delivery and discounts' })).toHaveCount(0);

  // Back at a warehouse that ships, the pickers return.
  await page.goto('/');
  await page.getByLabel('Shipping from').selectOption({ label: 'North warehouse · DE' });
  await expect.poll(() => mocks.state.urls).toContain('GET catalog?warehouse=2');
  await page.goto('/checkout');
  await toAddress(page);
  await expect(country(page).locator('option:not([value=""])')).toHaveText(['Germany', 'Ireland']);
  await expect(page.getByText(/We can.t ship to that country yet/)).toHaveCount(0);
});
