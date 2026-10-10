import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { installMocks, type Layout, type MockHandle } from './mocks.ts';
import type { LastCheckoutDetails } from '../web/src/types/checkout.ts';

/**
 * "Use the details from your last order?" on the checkout's first step, at phone width, with the route mocked. Synthetic
 * data only. Set S1_SHOTS to an output directory to also save screenshots.
 */
test.use({ viewport: { width: 390, height: 844 } });

const SHOTS = process.env.S1_SHOTS ?? '';
const DETAILS: LastCheckoutDetails = {
  orderReference: 'E2E0', placedAt: '2026-08-01T10:00:00.000Z',
  firstName: 'Alex', surname: 'Rowan',
  addressLine1: '14 Test Lane', addressLine2: 'Flat 2', addressLine3: null,
  city: 'Leeds', county: null, zip: 'LS1 4AB', country: 'GB',
  email: 'alex@example.invalid', phone: '+447700900123', servicePoint: null,
};
const CARD = '[data-last-details]';

/** A server cart with one line, so /checkout stays on the checkout. */
function seedCart(mocks: MockHandle): void {
  mocks.state.cart = {
    items: [{
      productId: 101, name: 'Alpine Extract 10ml', quantity: 1, unitPrice: 42.5, lineTotal: 42.5, imageUrl: null, isPreorder: false,
      outOfStock: false, priceChanged: false, inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null,
    }],
    subtotal: 42.5, itemCount: 1,
  };
}

async function open(page: Page, layout: Layout, over: { lastDetails?: LastCheckoutDetails | null; session?: boolean } = {}) {
  const mocks = await installMocks(page, { layout, session: over.session ?? true, ...('lastDetails' in over ? { lastDetails: over.lastDetails } : {}) });
  seedCart(mocks);
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /Your details|Guest checkout/ }).first()).toBeVisible();
  return mocks;
}

const asks = (mocks: MockHandle) => mocks.requests().filter((r) => r === 'GET storefront/checkout/last-details').length;

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(SHOTS, `${name}.png`), animations: 'disabled', caret: 'hide' });
}

for (const layout of ['storefront', 'menu', 'webapp'] as const) {
  test(`${layout}: the card offers the last order, Use fills the step and moves nothing on`, async ({ page }) => {
    const mocks = await open(page, layout, { lastDetails: DETAILS });
    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    await expect(card.getByText('Alex Rowan')).toBeVisible();
    await expect(card.getByText('14 Test Lane, Flat 2, Leeds, LS1 4AB, GB')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'First name' })).toHaveValue('');
    await shot(page, `checkout-offer-${layout}-m`);

    // Same left edge as the fields it sits above, and inside the viewport.
    const box = (await card.boundingBox())!;
    const field = (await page.getByRole('textbox', { name: 'First name' }).boundingBox())!;
    expect(box.x).toBeLessThanOrEqual(field.x + 1);
    expect(box.x + box.width).toBeLessThanOrEqual(390);

    await card.getByRole('button', { name: 'Use these details' }).click();
    await expect(card).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'First name' })).toHaveValue('Alex');
    await expect(page.getByRole('textbox', { name: 'Surname' })).toHaveValue('Rowan');
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue('alex@example.invalid');
    await expect(page.locator('input[name="tel"]')).toHaveValue('7700900123');
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible(); // still on step one
    expect(mocks.state.checkouts).toHaveLength(0);
    await shot(page, `checkout-filled-${layout}-m`);

    // The shopper still walks the next step, now holding the address.
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Delivery address' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Address line 1' })).toHaveValue('14 Test Lane');
    await expect(page.getByRole('textbox', { name: 'Town / City' })).toHaveValue('Leeds');
    await expect(page.getByRole('textbox', { name: 'Postcode' })).toHaveValue('LS1 4AB');
    expect(mocks.state.checkouts).toHaveLength(0);
  });
}

test('No thanks hides it, and a reload in the same tab does not bring it back', async ({ page }) => {
  await open(page, 'storefront', { lastDetails: DETAILS });
  await page.locator(CARD).getByRole('button', { name: 'No thanks' }).click();
  await expect(page.locator(CARD)).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'First name' })).toHaveValue('');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.locator(CARD)).toHaveCount(0);
});

test('a collection order fills name and contact only', async ({ page }) => {
  await open(page, 'storefront', { lastDetails: { ...DETAILS, addressLine1: '1 Point Street', servicePoint: { id: 'sp-1', carrier: 'evri', name: 'Corner News' } } });
  await expect(page.locator(CARD).getByText('Name and contact details only')).toBeVisible();
  await expect(page.locator(CARD)).not.toContainText('Point Street');
  await shot(page, 'checkout-offer-collection-m');
  await page.locator(CARD).getByRole('button', { name: 'Use these details' }).click();
  await expect(page.getByRole('textbox', { name: 'First name' })).toHaveValue('Alex');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('textbox', { name: 'Address line 1' })).toHaveValue('');
});

test('nothing shows, and nothing is said, when there are no details or the route is missing', async ({ page }) => {
  const none = await open(page, 'storefront', { lastDetails: null });
  await page.waitForLoadState('networkidle');
  expect(asks(none)).toBe(1);
  await expect(page.locator(CARD)).toHaveCount(0);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const missing = await open(page, 'storefront', {});
  await page.waitForLoadState('networkidle');
  expect(asks(missing)).toBe(1);
  await expect(page.locator(CARD)).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'First name' })).toBeVisible();
});

test('a guest is never asked for, and sees nothing', async ({ page }) => {
  const mocks = await installMocks(page, { layout: 'storefront', lastDetails: DETAILS, tweakSettings: (st) => { st.features.guestCheckout = true; } });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Alpine Extract 10ml', exact: true }).click();
  await page.getByRole('button', { name: /^Add · / }).first().click();
  await expect(page.getByRole('group', { name: /in your cart/ })).toBeVisible();
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: 'Guest checkout', level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(asks(mocks)).toBe(0);
  await expect(page.locator(CARD)).toHaveCount(0);
});
