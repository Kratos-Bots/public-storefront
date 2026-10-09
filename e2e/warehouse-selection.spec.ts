import { expect, test, type Page } from '@playwright/test';
import { installMocks, type InstallMocksOptions } from './mocks.ts';
import { fillCheckout, onlyVisible, openCart, openProduct, productOpener } from './flows.ts';

/**
 * Warehouse selection (STOREFRONT.md 3.8b), mocked end to end. Synthetic warehouses: "Main" is the shop's
 * default; "Test EU" (id 2) stocks only Borealis Drops and Dune Starter Kit.
 */
test.use({ viewport: { width: 390, height: 844 } });

const WAREHOUSES: NonNullable<InstallMocksOptions['warehouses']> = {
  list: [
    { id: 1, name: 'Main', country: 'GB', isDefault: true },
    { id: 2, name: 'Test EU', country: 'DE', isDefault: false },
    { id: 3, name: 'Test Overseas', country: null, isDefault: false },
  ],
  carries: { 2: [102, 104], 3: [101] },
};
const ALL = ['Alpine Extract 10ml', 'Borealis Drops 25ml', 'Citrine Capsules 60ct', 'Dune Starter Kit', 'Echo Balm 12ml', 'Fennec Tincture 30ml'];
const AT_EU = ['Borealis Drops 25ml', 'Dune Starter Kit'];

const picker = (page: Page) => page.getByLabel('Shipping from');
const catalogUrls = (urls: string[]) => urls.filter((u) => /^GET catalog(\?|$)/.test(u));

async function expectProducts(page: Page, names: string[]): Promise<void> {
  for (const name of ALL) {
    const opener = productOpener(page, 'storefront', name);
    if (names.includes(name)) await expect(opener).toBeVisible();
    else await expect(opener).toHaveCount(0);
  }
}

test.describe('feature off (the default)', () => {
  test('no picker, no warehouse request, no warehouse parameter anywhere', async ({ page }) => {
    const mocks = await installMocks(page, { layout: 'storefront' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
    await expectProducts(page, ALL);
    await expect(page.locator('[data-warehouse-picker]')).toHaveCount(0);
    expect(mocks.state.urls.filter((u) => /warehouse/.test(u))).toEqual([]);
    expect(catalogUrls(mocks.state.urls)).toEqual(['GET catalog']);
  });

  test('a stale stored choice does nothing while the flag is off', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sf-warehouse-v1', JSON.stringify({ state: { warehouseId: 2 }, version: 0 })));
    const mocks = await installMocks(page, { layout: 'storefront' });
    await page.goto('/');
    await expectProducts(page, ALL);
    expect(mocks.state.urls.filter((u) => /warehouse/.test(u))).toEqual([]);
  });
});

test.describe('feature on', () => {
  test('choosing a warehouse refetches the catalogue with ?warehouse=, it survives a reload, and choosing the default removes it', async ({ page }) => {
    const mocks = await installMocks(page, { layout: 'storefront', warehouses: WAREHOUSES });
    await page.goto('/');
    await expectProducts(page, ALL);
    await expect(picker(page)).toHaveValue('1');
    await expect(picker(page).locator('option')).toHaveText(['Main · GB', 'Test EU · DE', 'Test Overseas']);
    expect(catalogUrls(mocks.state.urls)).toEqual(['GET catalog']);

    await picker(page).selectOption({ label: 'Test EU · DE' });
    await expectProducts(page, AT_EU);
    expect(catalogUrls(mocks.state.urls).at(-1)).toBe('GET catalog?warehouse=2');
    await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();

    await page.reload();
    await expect(picker(page)).toHaveValue('2');
    await expectProducts(page, AT_EU);
    // The first catalogue request after the reload already asks for the stored warehouse: one request, not two.
    const afterReload = catalogUrls(mocks.state.urls).slice(2);
    expect(afterReload).toEqual(['GET catalog?warehouse=2']);

    await picker(page).selectOption({ label: 'Main · GB' });
    await expectProducts(page, ALL);
    expect(catalogUrls(mocks.state.urls).at(-1)).toBe('GET catalog');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sf-warehouse-v1')!).state)).toEqual({ warehouseId: null });
  });

  test('a single warehouse is no choice: no picker, nothing sent', async ({ page }) => {
    const mocks = await installMocks(page, { layout: 'storefront', warehouses: { list: [WAREHOUSES.list[0]!], carries: {} } });
    await page.addInitScript(() => window.localStorage.setItem('sf-warehouse-v1', JSON.stringify({ state: { warehouseId: 2 }, version: 0 })));
    await page.goto('/');
    await expectProducts(page, ALL);
    await expect(page.locator('[data-warehouse-picker]')).toHaveCount(0);
    // A stored id is used optimistically until the list says there is no choice (documented), so the very first
    // read may carry it; once the list is in, nothing does.
    await expect.poll(() => catalogUrls(mocks.state.urls).at(-1)).toBe('GET catalog');
  });

  test('a stored choice the list no longer offers is dropped', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sf-warehouse-v1', JSON.stringify({ state: { warehouseId: 9 }, version: 0 })));
    await installMocks(page, { layout: 'storefront', warehouses: WAREHOUSES });
    await page.goto('/');
    await expectProducts(page, ALL);
    await expect(picker(page)).toHaveValue('1');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('sf-warehouse-v1')!).state.warehouseId)).toBeNull();
  });

  test('a private shop does not ask anonymous visitors for the list', async ({ page }) => {
    const mocks = await installMocks(page, { layout: 'storefront', warehouses: WAREHOUSES, access: { storefront: 'login' } });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(mocks.state.requests).not.toContain('GET storefront/warehouses');
    await expect(page.locator('[data-warehouse-picker]')).toHaveCount(0);
  });

  test('a product the chosen warehouse does not carry says so and offers the way back', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sf-warehouse-v1', JSON.stringify({ state: { warehouseId: 2 }, version: 0 })));
    await installMocks(page, { layout: 'storefront', warehouses: WAREHOUSES });
    await page.goto('/p/101');
    await expect(page.getByText("This product isn't available from Test EU.")).toBeVisible();
    await page.getByRole('button', { name: 'Ship from Main instead' }).click();
    await expect(page.getByRole('heading', { name: 'Alpine Extract 10ml', level: 1 })).toBeVisible();
    await expect(picker(page)).toHaveValue('1');
  });

  test('signed in: the cart is read at the warehouse, an uncarried line is flagged and kept, and checkout carries warehouseId', async ({ page }) => {
    const mocks = await installMocks(page, { layout: 'storefront', session: true, orderFixture: 'crypto', warehouses: WAREHOUSES });
    await page.goto('/');
    await openProduct(page, 'storefront', 'Borealis Drops 25ml');
    await page.getByRole('button', { name: /^Add · / }).first().click();
    await expect.poll(() => mocks.state.cart.itemCount).toBe(1);
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();

    await picker(page).selectOption({ label: 'Test Overseas' });
    // Borealis is not carried there: the server cart is re-read at that warehouse and flags it.
    await expect.poll(() => mocks.state.urls.filter((u) => u === 'GET storefront/cart?warehouse=3').length).toBeGreaterThan(0);
    await openCart(page, 'mobile');
    await expect(page.getByText('No longer available — remove to continue')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Checkout' })).toBeDisabled();
    expect(mocks.state.cart.items).toHaveLength(1);

    // Back to a warehouse that carries it: the line is fine again and checkout opens.
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
    await picker(page).selectOption({ label: 'Test EU · DE' });
    await expect.poll(() => mocks.state.urls.filter((u) => u === 'GET storefront/cart?warehouse=2').length).toBeGreaterThan(0);
    await openCart(page, 'mobile');
    await expect(page.getByText('No longer available — remove to continue')).toHaveCount(0);
    await onlyVisible(page.getByRole('link', { name: 'Checkout' })).click();
    await expect(page).toHaveURL(/\/checkout$/);
    // The choice is made while browsing: no picker on the checkout.
    await expect(page.locator('[data-warehouse-picker]')).toHaveCount(0);

    await fillCheckout(page);
    await expect(page.getByText('Shipping from Test EU')).toBeVisible();
    await page.getByRole('button', { name: /^Place order/ }).click();
    await expect.poll(() => mocks.state.checkouts.length).toBe(1);
    expect(mocks.state.checkouts[0]).toMatchObject({ warehouseId: 2 });
    expect(mocks.state.quotes.length).toBeGreaterThan(0);
    expect(mocks.state.quotes.every((q) => q.warehouseId === 2)).toBe(true);
  });

  test('guest: a basket line the warehouse does not carry is shown unavailable and blocks checkout, nothing is removed', async ({ page }) => {
    const mocks = await installMocks(page, {
      layout: 'storefront', warehouses: WAREHOUSES,
      tweakSettings: (s) => { s.features.guestCheckout = true; },
    });
    await page.goto('/');
    await openProduct(page, 'storefront', 'Alpine Extract 10ml');
    await page.getByRole('button', { name: /^Add · / }).first().click();
    await expect(page.getByRole('group', { name: /in your cart/ })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();

    await picker(page).selectOption({ label: 'Test EU · DE' });
    await expect.poll(() => catalogUrls(mocks.state.urls).at(-1)).toBe('GET catalog?warehouse=2');
    await openCart(page, 'mobile');
    await expect(page.getByText('Alpine Extract 10ml')).toBeVisible();
    await expect(page.getByText('No longer available — remove to continue')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Checkout' })).toBeDisabled();
  });

  test('the guest quote is sent with warehouseId', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sf-warehouse-v1', JSON.stringify({ state: { warehouseId: 2 }, version: 0 })));
    const mocks = await installMocks(page, {
      layout: 'storefront', warehouses: WAREHOUSES,
      tweakSettings: (s) => { s.features.guestCheckout = true; },
    });
    await page.goto('/');
    await openProduct(page, 'storefront', 'Borealis Drops 25ml');
    await page.getByRole('button', { name: /^Add · / }).first().click();
    await expect(page.getByRole('group', { name: /in your cart/ })).toBeVisible();
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: 'Guest checkout', level: 1 })).toBeVisible();
    await expect.poll(() => mocks.state.guestQuotes.length).toBeGreaterThan(0);
    expect(mocks.state.guestQuotes[0]).toMatchObject({ warehouseId: 2 });
  });
});
