import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { installMocks } from './mocks.ts';
import type { Catalog } from '../web/src/types/catalog.ts';

/**
 * Order-quantity limits, end to end against the mocked backend: a minimum
 * opens the line at the floor rather than 1, a stale line below it is flagged
 * with a one-tap fix rather than dropped, and checkout stays blocked until
 * it's resolved. The server cart (and so `belowMin`/`aboveMax`) only exists
 * for a signed-in shopper — a guest cart never calls `/storefront/cart` — so
 * this spec seeds a session, unlike most of `storefront.spec.ts`.
 */

const SHOTS = fileURLToPath(new URL('./screenshots/', import.meta.url));
const MIN_PRODUCT_ID = 9101;
const MIN_PRODUCT_NAME = 'Batch Tincture';

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}${name}.png` });
}

function onlyVisible(locator: Locator): Locator {
  return locator.filter({ visible: true }).first();
}

/** The shared catalog fixture plus one product with a minimum, appended so the
 *  main spec's assumptions about products 101-106 (ids, quantities, prices)
 *  are never touched. */
function catalogWithMinimumProduct(): Catalog {
  const base = JSON.parse(
    readFileSync(fileURLToPath(new URL('./fixtures/catalog.json', import.meta.url)), 'utf8'),
  ) as Catalog;
  return {
    ...base,
    products: [
      ...base.products,
      {
        id: MIN_PRODUCT_ID,
        sku: 'MIN-10',
        name: MIN_PRODUCT_NAME,
        displayName: MIN_PRODUCT_NAME,
        shortDisplayName: 'Batch',
        description: 'Sold by the batch — ten to an order.',
        categoryId: 1,
        categoryName: 'Concentrates',
        sortOrder: 99,
        price: 15,
        inStock: true,
        lowStockAlert: false,
        isActive: true,
        isPreorder: false,
        preorderEta: null,
        pricingTiers: [],
        upsellProductIds: [],
        excludedFromFreeShipping: false,
        imageProductId: null,
        provenance: null,
        minOrderQuantity: 10,
        maxOrderQuantity: null,
      },
    ],
  };
}

test.describe('order quantity limits', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a min-10 product opens at 10, a stale low line is flagged and fixed, and checkout is blocked until then', async ({
    page,
  }) => {
    const mocks = await installMocks(page, {
      layout: 'storefront',
      catalog: catalogWithMinimumProduct(),
      session: true,
    });

    await page.goto('/');
    await page
      .getByRole('link', { name: MIN_PRODUCT_NAME, exact: true })
      .or(page.getByRole('button', { name: MIN_PRODUCT_NAME, exact: true }))
      .click();
    await expect(page.getByRole('heading', { name: MIN_PRODUCT_NAME, level: 1 })).toBeVisible();

    // The floor is stated before the shopper commits to it.
    await expect(page.getByText('Min 10')).toBeVisible();

    // Tapping Add opens the line at the minimum, not 1, and prices the batch.
    const addButton = page.getByRole('button', { name: /^Add 10/ });
    await expect(addButton).toBeVisible();
    await addButton.click();
    await expect.poll(() => mocks.state.cart.items[0]?.quantity).toBe(10);

    await onlyVisible(page.getByRole('link', { name: /^Cart, / })).click();
    const cart = page.getByRole('dialog', { name: 'Your cart' });
    await expect(cart).toBeVisible();
    await shot(page, 'quantity-limits-opens-at-minimum');

    // Drop the line to a stale 4 the way a shopper actually would — typing
    // into the stepper's field — rather than rewriting server state directly.
    await cart.getByRole('textbox', { name: `${MIN_PRODUCT_NAME} quantity` }).fill('4');
    await expect.poll(() => mocks.state.cart.items[0]?.quantity).toBe(4);
    await expect.poll(() => mocks.state.cart.items[0]?.belowMin).toBe(true);

    // The flag, its fix, and the blocked checkout button — the line stays on
    // the order, it is never silently dropped.
    await expect(cart.getByText('Minimum 10 per order')).toBeVisible();
    await expect(cart.getByRole('button', { name: 'Checkout' })).toBeDisabled();
    await expect(cart.getByText('Resolve the flagged items to continue.')).toBeVisible();
    await shot(page, 'quantity-limits-below-min-blocked');

    // The one-tap fix restores compliance and unblocks checkout.
    await cart.getByRole('button', { name: 'Set to 10' }).click();
    await expect.poll(() => mocks.state.cart.items[0]?.quantity).toBe(10);
    await expect(cart.getByText('Minimum 10 per order')).toHaveCount(0);
    await expect(cart.getByRole('link', { name: 'Checkout' })).toBeVisible();
    await shot(page, 'quantity-limits-fixed-checkout-enabled');
  });

  test('a max-15 product blocks + at the ceiling and flags a stale line above it', async ({ page }) => {
    const catalog = catalogWithMinimumProduct();
    catalog.products.push({
      ...catalog.products[catalog.products.length - 1]!,
      id: 9102,
      sku: 'MAX-15',
      name: 'Ceiling Blend',
      displayName: 'Ceiling Blend',
      shortDisplayName: 'Ceiling',
      minOrderQuantity: null,
      maxOrderQuantity: 15,
    });
    const mocks = await installMocks(page, { layout: 'storefront', catalog, session: true });

    await page.goto('/');
    await page
      .getByRole('link', { name: 'Ceiling Blend', exact: true })
      .or(page.getByRole('button', { name: 'Ceiling Blend', exact: true }))
      .click();
    await expect(page.getByRole('heading', { name: 'Ceiling Blend', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: /^Add /, exact: false }).click();
    await expect.poll(() => mocks.state.cart.items[0]?.quantity).toBe(1);

    await onlyVisible(page.getByRole('link', { name: /^Cart, / })).click();
    const cart = page.getByRole('dialog', { name: 'Your cart' });
    await cart.getByRole('textbox', { name: 'Ceiling Blend quantity' }).fill('20');
    await expect.poll(() => mocks.state.cart.items[0]?.quantity).toBe(20);
    await expect.poll(() => mocks.state.cart.items[0]?.aboveMax).toBe(true);

    await expect(cart.getByText('Maximum 15 per order')).toBeVisible();
    await expect(cart.getByRole('button', { name: 'Checkout' })).toBeDisabled();
    // Flagged above the ceiling: `+` won't compound the violation any further.
    await expect(cart.getByRole('button', { name: 'One more Ceiling Blend' })).toBeDisabled();

    await cart.getByRole('button', { name: 'Set to 15' }).click();
    await expect.poll(() => mocks.state.cart.items[0]?.quantity).toBe(15);
    // Fixed to exactly the ceiling is compliant, not violating — the flag (and
    // the stepper clamp that rides on it) clears, same as any resolved issue.
    await expect(cart.getByText('Maximum 15 per order')).toHaveCount(0);
    await expect(cart.getByRole('link', { name: 'Checkout' })).toBeVisible();
  });
});
