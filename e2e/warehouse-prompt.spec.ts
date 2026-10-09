import { expect, test } from '@playwright/test';
import { installMocks, type InstallMocksOptions } from './mocks.ts';
import { onlyVisible, productOpener } from './flows.ts';

/**
 * The pick-first warehouse prompt (STOREFRONT.md 3.8b), mocked end to end. Synthetic warehouses: "Main" is
 * the shop's default; "Test EU" (id 2) stocks only Borealis Drops and Dune Starter Kit.
 */
test.use({ viewport: { width: 390, height: 844 } });

const WAREHOUSES: NonNullable<InstallMocksOptions['warehouses']> = {
  list: [
    { id: 1, name: 'Main', country: 'GB', isDefault: true },
    { id: 2, name: 'Test EU', country: 'DE', isDefault: false },
  ],
  carries: { 2: [102, 104] },
  prompt: true,
};
const PROMPT = '[data-warehouse-prompt]';
const opener = (page: import('@playwright/test').Page, name: string) => productOpener(page, 'storefront', name);

test('prompt on: the chooser comes first, choosing a warehouse shows its catalogue', async ({ page }) => {
  const mocks = await installMocks(page, { layout: 'storefront', warehouses: WAREHOUSES });
  await page.goto('/');
  await expect(page.locator(PROMPT)).toBeVisible();
  await expect(opener(page, 'Borealis Drops 25ml')).toHaveCount(0);

  await page.getByRole('button', { name: 'Shop from Test EU' }).click();
  await expect(page.locator(PROMPT)).toHaveCount(0);
  await expect(opener(page, 'Borealis Drops 25ml')).toBeVisible();
  await expect(opener(page, 'Alpine Extract 10ml')).toHaveCount(0);
  expect(mocks.state.urls).toContain('GET catalog?warehouse=2');
});

test('asked once per visit', async ({ page }) => {
  await installMocks(page, { layout: 'storefront', warehouses: WAREHOUSES });
  await page.goto('/');
  await page.getByRole('button', { name: 'Shop from Test EU' }).click();
  await expect(opener(page, 'Borealis Drops 25ml')).toBeVisible();

  await page.reload();
  await expect(opener(page, 'Borealis Drops 25ml')).toBeVisible();
  await expect(page.locator(PROMPT)).toHaveCount(0);

  await page.goto('/cart');
  await page.goto('/');
  await expect(opener(page, 'Borealis Drops 25ml')).toBeVisible();
  await expect(page.locator(PROMPT)).toHaveCount(0);
});

test('a new visit asks again and marks the last choice', async ({ page, context }) => {
  await installMocks(page, { layout: 'storefront', warehouses: WAREHOUSES });
  await page.goto('/');
  await page.getByRole('button', { name: 'Shop from Test EU' }).click();
  await expect(opener(page, 'Borealis Drops 25ml')).toBeVisible();

  // A new tab is a new visit (sessionStorage is per tab); localStorage still remembers the choice.
  const second = await context.newPage();
  await installMocks(second, { layout: 'storefront', warehouses: WAREHOUSES });
  await second.goto('/');
  await expect(second.locator(PROMPT)).toBeVisible();
  await expect(second.getByRole('button', { name: 'Shop from Test EU' })).toContainText('Your last choice');
  await expect(second.getByRole('button', { name: 'Shop from Main' })).not.toContainText('Your last choice');
});

test('deep links are not interrupted', async ({ page }) => {
  await installMocks(page, { layout: 'storefront', warehouses: WAREHOUSES });
  await page.goto('/order-placed');
  await expect(page.locator(PROMPT)).toHaveCount(0);
  await page.goto('/login');
  await expect(page.locator(PROMPT)).toHaveCount(0);
});

test('prompt off: no chooser', async ({ page }) => {
  await installMocks(page, { layout: 'storefront', warehouses: { ...WAREHOUSES, prompt: false } });
  await page.goto('/');
  await expect(opener(page, 'Alpine Extract 10ml')).toBeVisible();
  await expect(page.locator(PROMPT)).toHaveCount(0);
});

test('a paused warehouse is labelled and still selectable', async ({ page }) => {
  await installMocks(page, {
    layout: 'storefront',
    warehouses: {
      ...WAREHOUSES,
      list: [WAREHOUSES.list[0]!, { ...WAREHOUSES.list[1]!, orderingEnabled: false, orderingMessage: 'Back Monday' }],
    },
  });
  await page.goto('/');
  const card = page.getByRole('button', { name: 'Shop from Test EU' });
  await expect(card).toContainText('Not taking orders');
  await expect(card).toContainText('Back Monday');
  await card.click();
  await expect(opener(page, 'Borealis Drops 25ml')).toBeVisible();
  await expect(opener(page, 'Alpine Extract 10ml')).toHaveCount(0);
});

const PAUSED_EU = { orderingEnabled: false, orderingMessage: 'Back Monday' };
const pausedWarehouses = (): NonNullable<InstallMocksOptions['warehouses']> => ({
  ...WAREHOUSES,
  list: [WAREHOUSES.list[0]!, { ...WAREHOUSES.list[1]!, ...PAUSED_EU }],
});
const NOTICE = '[data-warehouse-paused]';
const addControl = (page: import('@playwright/test').Page) => page.getByRole('button', { name: /^Add\b/ });

test('paused warehouse: browse only', async ({ page }) => {
  // Signed in: a signed-out shopper's /checkout goes to the sign-in page first, which is not what is under test.
  await installMocks(page, { layout: 'storefront', warehouses: pausedWarehouses(), session: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Shop from Test EU' }).click();
  await expect(opener(page, 'Borealis Drops 25ml')).toBeVisible();
  await expect(page.locator(NOTICE)).toContainText('Back Monday');
  await expect(page.locator(NOTICE)).toHaveAttribute('role', 'status');
  await expect(addControl(page)).toHaveCount(0);

  await opener(page, 'Borealis Drops 25ml').click();
  await expect(page.getByRole('heading', { name: 'Borealis Drops 25ml', level: 1 })).toBeVisible();
  await expect(page.locator(NOTICE)).toContainText('Back Monday');
  await expect(addControl(page)).toHaveCount(0);

  await page.goto('/checkout');
  await expect(page).toHaveURL(/\/cart$/);
});

test('switching to an open warehouse restores ordering', async ({ page }) => {
  await installMocks(page, { layout: 'storefront', warehouses: pausedWarehouses() });
  await page.goto('/');
  await page.getByRole('button', { name: 'Shop from Test EU' }).click();
  await expect(page.locator(NOTICE)).toBeVisible();

  await page.getByLabel('Shipping from').selectOption({ label: 'Main · GB' });
  await expect(page.locator(NOTICE)).toHaveCount(0);
  await opener(page, 'Alpine Extract 10ml').click();
  await expect(page.getByRole('button', { name: /^Add · / }).first()).toBeVisible();
});

test('the switch flips mid-session: checkout ends on the cart with the notice and no raw error', async ({ page }) => {
  const warehouses: NonNullable<InstallMocksOptions['warehouses']> = {
    ...WAREHOUSES,
    prompt: false,
    list: [...WAREHOUSES.list],
  };
  await page.addInitScript(() => window.localStorage.setItem('sf-warehouse-v1', JSON.stringify({ state: { warehouseId: 2 }, version: 0 })));
  await installMocks(page, { layout: 'storefront', warehouses, session: true });
  await page.goto('/');
  await opener(page, 'Borealis Drops 25ml').click();
  await page.getByRole('button', { name: /^Add · / }).first().click();
  await expect(page.getByRole('group', { name: /in your cart/ }).first()).toBeVisible();
  await expect(page.locator(NOTICE)).toHaveCount(0);

  // From now on the owner has paused Test EU: the quote says so, and so does the list the shop re-reads.
  await page.route('**/api/storefront/checkout/quote', async (route) => {
    warehouses.list[1] = { ...warehouses.list[1]!, ...PAUSED_EU };
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, data: null, error: 'WAREHOUSE_ORDERING_PAUSED' }) });
  });
  await onlyVisible(page.getByRole('link', { name: /^Cart, / })).click();
  await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
  await page.getByRole('link', { name: 'Checkout' }).click();

  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.locator(NOTICE)).toHaveCount(1);
  await expect(page.locator(NOTICE)).toContainText('Back Monday');
  await expect(page.getByText('Borealis Drops 25ml')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Checkout' })).toHaveCount(0);
  expect(await page.content()).not.toContain('WAREHOUSE_ORDERING_PAUSED');
});
