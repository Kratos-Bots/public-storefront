import { expect, test } from '@playwright/test';
import { installMocks, type InstallMocksOptions } from './mocks.ts';
import { productOpener } from './flows.ts';

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
